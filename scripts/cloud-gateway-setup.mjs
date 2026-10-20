#!/usr/bin/env node
// SETS UP THE CLOUD SERVER (docs/cloud/PLAN.md, "The cloud server").
//
//   aws login --region us-east-1           # an admin sign-in
//   node scripts/cloud-gateway-setup.mjs   # safe to run again
//   node scripts/cloud-gateway-setup.mjs --bundle-only   # build it, deploy nothing
//
// It needs what scripts/cloud-setup.mjs made (the bucket and the runtime, in
// ~/.agentbox/cloud.json) and the team database's address and public key
// (cloud/team.config.json or ~/.agentbox/team.config.json). It makes, all
// named agentbox-gateway*:
//   - the signer, an IAM user whose key signs the links (`runs/`, `logins/`),
//     its key kept in Secrets Manager
//   - the function's role: start and stop sessions on that one runtime, its
//     ledger and relayed calls in that one bucket, and that one secret
//   - the function, bundled into one file, with a public function URL
//   - S3's notice to the function when a run's done.json lands
//   - a sweep every 5 minutes
//   - a notice from the budget the spike made (`agentcore-sandboxes`) that
//     pauses new runs when the month's spend passes it
// and prints the function URL.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readCloudConfig } from '../main/cloud/config.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const NAMES = {
  fn: 'agentbox-gateway', role: 'agentbox-gateway-role', signer: 'agentbox-gateway-signer', notice: 'agentbox-gateway-done',
  sweep: 'agentbox-gateway-sweep', topic: 'agentbox-gateway-budget', budget: 'agentcore-sandboxes',
};
// The most functions running at once: the ceiling on a burst of calls. It
// does not stop machines already going; `admin pause` and the sweep do.
const CONCURRENCY = 200;
// Longer than its own 60 s wait on AgentCore (main/cloud/aws.mjs), shorter
// than the Mac's wait on it (main/cloud/managed.mjs).
export const FUNCTION_SECONDS = 90;

/**
 * What the function's own role may do. Links are signed by the signer, so
 * the role reads and writes only its ledger and the calls it relays, looks
 * for a run's done.json, and deletes what a Mac asks it to.
 */
export function rolePolicy({ bucket, runtimeArn, region, account, signerSecretArn = `arn:aws:secretsmanager:${region}:${account}:secret:${NAMES.signer}-*` }) {
  const at = (p) => `arn:aws:s3:::${bucket}/${p}`;
  return {
    Version: '2012-10-17',
    Statement: [
      { Effect: 'Allow', Action: ['bedrock-agentcore:InvokeAgentRuntime', 'bedrock-agentcore:StopRuntimeSession'], Resource: [runtimeArn, `${runtimeArn}/runtime-endpoint/*`] },
      { Effect: 'Allow', Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'], Resource: [at('ledger/*'), at('runs/*/calls/*')] },
      { Effect: 'Allow', Action: ['s3:GetObject'], Resource: [at('runs/*/done.json')] },
      { Effect: 'Allow', Action: ['s3:DeleteObject'], Resource: [at('runs/*'), at('logins/*')] },
      { Effect: 'Allow', Action: ['s3:ListBucket'], Resource: `arn:aws:s3:::${bucket}`, Condition: { StringLike: { 's3:prefix': ['ledger/*'] } } },
      { Effect: 'Allow', Action: ['secretsmanager:GetSecretValue'], Resource: signerSecretArn },
      { Effect: 'Allow', Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'], Resource: `arn:aws:logs:${region}:${account}:log-group:/aws/lambda/${NAMES.fn}*` },
    ],
  };
}

/**
 * What the signer's links may do: runs and sign-ins, never the ledger. It
 * may list them too, so a link to a missing object answers 404, not 403.
 */
export function signerPolicy({ bucket }) {
  return {
    Version: '2012-10-17',
    Statement: [
      { Effect: 'Allow', Action: ['s3:GetObject', 's3:PutObject'], Resource: ['runs/*', 'logins/*'].map((p) => `arn:aws:s3:::${bucket}/${p}`) },
      { Effect: 'Allow', Action: ['s3:ListBucket'], Resource: `arn:aws:s3:::${bucket}`, Condition: { StringLike: { 's3:prefix': ['runs/*', 'logins/*'] } } },
    ],
  };
}

/** Which of the signer's keys to keep: the one in use, if IAM still has it. */
export function signerKeyPlan({ inUse, keys }) {
  const keep = keys.some((k) => k.id === inUse) ? inUse : null;
  return { keep, remove: keys.filter((k) => k.id !== keep).map((k) => k.id), make: !keep };
}

/** The bucket's notices with ours added, every other one kept. */
export function withDoneNotice(current, functionArn) {
  const others = (current?.LambdaFunctionConfigurations || []).filter((c) => c.Id !== NAMES.notice);
  return {
    ...(current || {}),
    LambdaFunctionConfigurations: [...others, {
      Id: NAMES.notice,
      LambdaFunctionArn: functionArn,
      Events: ['s3:ObjectCreated:*'],
      Filter: { Key: { FilterRules: [{ Name: 'prefix', Value: 'runs/' }, { Name: 'suffix', Value: 'done.json' }] } },
    }],
  };
}

/** The function in one file, with nothing to install in Lambda. */
export async function bundle(outDir) {
  const { build } = await import('esbuild');
  fs.mkdirSync(outDir, { recursive: true });
  await build({
    entryPoints: [path.join(ROOT, 'cloud', 'gateway', 'lambda.mjs')],
    outfile: path.join(outDir, 'index.mjs'),
    bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'warning',
    // Lambda's own copy of the AWS libraries has it; this repository does not.
    external: ['@aws-sdk/client-secrets-manager'],
    // The AWS libraries still require() node's own modules.
    banner: { js: "import { createRequire as __agentboxRequire } from 'node:module'; const require = __agentboxRequire(import.meta.url);" },
  });
  const zip = path.join(outDir, 'gateway.zip');
  fs.rmSync(zip, { force: true });
  execFileSync('zip', ['-q', '-j', zip, path.join(outDir, 'index.mjs')]);
  return zip;
}

const say = (...a) => console.log('cloud-gateway-setup:', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'agentbox-gateway-'));
  const zip = await bundle(out);
  say(`bundled ${(fs.statSync(zip).size / 1024).toFixed(0)} KB`);
  if (process.argv.includes('--bundle-only')) { console.log(zip); return; }

  const cloud = readCloudConfig();
  if (!cloud?.bucket) throw new Error('run scripts/cloud-setup.mjs first: the server uses its bucket and runtime');
  const { region, bucket, runtimeArn } = cloud;
  const { loadCloudConfig } = await import('../main/team/session.mjs');
  const db = loadCloudConfig(ROOT, { packaged: false });
  if (!db) throw new Error('no team.config.json on this Mac: the server checks sign-ins against that database');

  const aws = (args, { json = true, allowFail = false } = {}) => {
    try {
      const o = execFileSync('aws', [...args, '--region', region, ...(json ? ['--output', 'json'] : [])], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, AWS_PAGER: '' } });
      return json && o.trim() ? JSON.parse(o) : o;
    } catch (err) {
      if (allowFail) return null;
      throw new Error(`aws ${args.slice(0, 2).join(' ')} failed: ${String(err.stderr || err.message).trim()}`);
    }
  };
  const account = aws(['sts', 'get-caller-identity']).Account;

  // The signer, and its key, kept in Secrets Manager only.
  if (!aws(['iam', 'get-user', '--user-name', NAMES.signer], { allowFail: true })) { say(`making user ${NAMES.signer}`); aws(['iam', 'create-user', '--user-name', NAMES.signer]); }
  aws(['iam', 'put-user-policy', '--user-name', NAMES.signer, '--policy-name', `${NAMES.signer}-policy`, '--policy-document', JSON.stringify(signerPolicy({ bucket }))], { json: false });
  const stored = aws(['secretsmanager', 'get-secret-value', '--secret-id', NAMES.signer], { allowFail: true });
  const inUse = stored ? JSON.parse(stored.SecretString) : null;
  const keys = aws(['iam', 'list-access-keys', '--user-name', NAMES.signer]).AccessKeyMetadata.map((k) => ({ id: k.AccessKeyId, made: Date.parse(k.CreateDate) }));
  const plan = signerKeyPlan({ inUse: inUse?.id || null, keys });
  for (const id of plan.remove) aws(['iam', 'delete-access-key', '--user-name', NAMES.signer, '--access-key-id', id], { json: false });
  if (plan.make) {
    const k = aws(['iam', 'create-access-key', '--user-name', NAMES.signer]).AccessKey;
    const value = JSON.stringify({ id: k.AccessKeyId, secret: k.SecretAccessKey });
    if (stored) aws(['secretsmanager', 'put-secret-value', '--secret-id', NAMES.signer, '--secret-string', value]);
    else aws(['secretsmanager', 'create-secret', '--name', NAMES.signer, '--secret-string', value]);
  }
  const signerSecretArn = aws(['secretsmanager', 'describe-secret', '--secret-id', NAMES.signer]).ARN;

  // The role.
  const trust = JSON.stringify({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' }, Action: 'sts:AssumeRole' }] });
  let role = aws(['iam', 'get-role', '--role-name', NAMES.role], { allowFail: true })?.Role;
  if (!role) { say(`making role ${NAMES.role}`); role = aws(['iam', 'create-role', '--role-name', NAMES.role, '--assume-role-policy-document', trust]).Role; }
  aws(['iam', 'put-role-policy', '--role-name', NAMES.role, '--policy-name', `${NAMES.role}-policy`, '--policy-document', JSON.stringify(rolePolicy({ bucket, runtimeArn, region, account, signerSecretArn }))], { json: false });

  // The function. A role made a moment ago is not assumable yet: retry.
  const env = { REGION: region, BUCKET: bucket, RUNTIME_ARN: runtimeArn, SUPABASE_URL: db.url, SUPABASE_ANON_KEY: db.anonKey, SIGNER_SECRET_ARN: signerSecretArn };
  const settings = ['--runtime', 'nodejs22.x', '--architectures', 'arm64', '--handler', 'index.handler', '--timeout', String(FUNCTION_SECONDS), '--memory-size', '512', '--environment', JSON.stringify({ Variables: env })];
  const existing = aws(['lambda', 'get-function-configuration', '--function-name', NAMES.fn], { allowFail: true });
  const waitUpdated = () => aws(['lambda', 'wait', 'function-updated-v2', '--function-name', NAMES.fn], { json: false });
  if (!existing) {
    for (let i = 1; ; i += 1) {
      try { aws(['lambda', 'create-function', '--function-name', NAMES.fn, '--role', role.Arn, '--zip-file', `fileb://${zip}`, ...settings]); break; } catch (err) {
        if (i >= 12 || !/assume|role/i.test(err.message)) throw err;
        say(`waiting for the role (${i}/12)`); await sleep(5000);
      }
    }
    aws(['lambda', 'wait', 'function-active-v2', '--function-name', NAMES.fn], { json: false });
  } else {
    aws(['lambda', 'update-function-code', '--function-name', NAMES.fn, '--zip-file', `fileb://${zip}`]);
    waitUpdated();
    aws(['lambda', 'update-function-configuration', '--function-name', NAMES.fn, '--role', role.Arn, ...settings]);
    waitUpdated();
  }
  aws(['lambda', 'put-function-concurrency', '--function-name', NAMES.fn, '--reserved-concurrent-executions', String(CONCURRENCY)], { allowFail: true });
  const fnArn = aws(['lambda', 'get-function-configuration', '--function-name', NAMES.fn]).FunctionArn;
  const allow = (id, principal, extra = []) => aws(['lambda', 'add-permission', '--function-name', NAMES.fn, '--statement-id', id, '--action', 'lambda:InvokeFunction', '--principal', principal, ...extra], { allowFail: true });

  // Its public address. The server checks every caller itself.
  let urlConfig = aws(['lambda', 'get-function-url-config', '--function-name', NAMES.fn], { allowFail: true });
  if (!urlConfig) urlConfig = aws(['lambda', 'create-function-url-config', '--function-name', NAMES.fn, '--auth-type', 'NONE']);
  aws(['lambda', 'add-permission', '--function-name', NAMES.fn, '--statement-id', 'public-url', '--action', 'lambda:InvokeFunctionUrl', '--principal', '*', '--function-url-auth-type', 'NONE'], { allowFail: true });
  allow('public-url-invoke', '*', ['--invoked-via-function-url']);

  // S3's notice when a run ends.
  allow('s3-done', 's3.amazonaws.com', ['--source-arn', `arn:aws:s3:::${bucket}`, '--source-account', account]);
  const current = aws(['s3api', 'get-bucket-notification-configuration', '--bucket', bucket], { allowFail: true }) || {};
  aws(['s3api', 'put-bucket-notification-configuration', '--bucket', bucket, '--notification-configuration', JSON.stringify(withDoneNotice(current, fnArn))], { json: false });

  // The sweep, every 5 minutes.
  const rule = aws(['events', 'put-rule', '--name', NAMES.sweep, '--schedule-expression', 'rate(5 minutes)']).RuleArn;
  aws(['events', 'put-targets', '--rule', NAMES.sweep, '--targets', JSON.stringify([{ Id: 'gateway', Arn: fnArn, Input: '{"sweep":true}' }])]);
  allow('sweep', 'events.amazonaws.com', ['--source-arn', rule]);

  // The budget's alarm pauses new runs.
  const topic = aws(['sns', 'create-topic', '--name', NAMES.topic]).TopicArn;
  aws(['sns', 'set-topic-attributes', '--topic-arn', topic, '--attribute-name', 'Policy', '--attribute-value', JSON.stringify({
    Version: '2012-10-17',
    Statement: [{ Effect: 'Allow', Principal: { Service: 'budgets.amazonaws.com' }, Action: 'SNS:Publish', Resource: topic, Condition: { StringEquals: { 'aws:SourceAccount': account } } }],
  })], { json: false });
  allow('budget', 'sns.amazonaws.com', ['--source-arn', topic]);
  aws(['sns', 'subscribe', '--topic-arn', topic, '--protocol', 'lambda', '--notification-endpoint', fnArn]);
  const notice = aws(['budgets', 'create-notification', '--account-id', account, '--budget-name', NAMES.budget,
    '--notification', 'NotificationType=ACTUAL,ComparisonOperator=GREATER_THAN,Threshold=100,ThresholdType=PERCENTAGE',
    '--subscribers', `SubscriptionType=SNS,Address=${topic}`], { allowFail: true, json: false });
  if (notice === null) say(`the budget ${NAMES.budget} already has that notice, or is not there: check it sends to ${topic}`);

  say('ready');
  console.log(urlConfig.FunctionUrl);
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(`cloud-gateway-setup: ${err.message}`); process.exit(1); });
}
