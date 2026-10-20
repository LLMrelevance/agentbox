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
//   - the function's role: start and stop sessions on that one runtime, and
//     read and write `runs/`, `logins/` and `ledger/` in that one bucket
//   - the signer, an IAM user whose key signs the links (`runs/`, `logins/`)
//   - the function, bundled into one file, with a public function URL
//   - S3's notice to the function when a run's done.json lands
// and prints the function URL.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readCloudConfig } from '../main/cloud/config.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const NAMES = { fn: 'agentbox-gateway', role: 'agentbox-gateway-role', signer: 'agentbox-gateway-signer', notice: 'agentbox-gateway-done' };
// The most functions running at once: the ceiling on what the server can
// spend in a burst, and its off switch (set it to 0).
const CONCURRENCY = 200;

/** What the function's own role may do. */
export function rolePolicy({ bucket, runtimeArn, region, account }) {
  return {
    Version: '2012-10-17',
    Statement: [
      { Effect: 'Allow', Action: ['bedrock-agentcore:InvokeAgentRuntime', 'bedrock-agentcore:StopRuntimeSession'], Resource: [runtimeArn, `${runtimeArn}/runtime-endpoint/*`] },
      { Effect: 'Allow', Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'], Resource: ['runs/*', 'logins/*', 'ledger/*'].map((p) => `arn:aws:s3:::${bucket}/${p}`) },
      { Effect: 'Allow', Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'], Resource: `arn:aws:logs:${region}:${account}:log-group:/aws/lambda/${NAMES.fn}*` },
    ],
  };
}

/** What the signer's links may do: runs and sign-ins, never the ledger. */
export function signerPolicy({ bucket }) {
  return {
    Version: '2012-10-17',
    Statement: [{ Effect: 'Allow', Action: ['s3:GetObject', 's3:PutObject'], Resource: ['runs/*', 'logins/*'].map((p) => `arn:aws:s3:::${bucket}/${p}`) }],
  };
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

  // The role.
  const trust = JSON.stringify({ Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' }, Action: 'sts:AssumeRole' }] });
  let role = aws(['iam', 'get-role', '--role-name', NAMES.role], { allowFail: true })?.Role;
  if (!role) { say(`making role ${NAMES.role}`); role = aws(['iam', 'create-role', '--role-name', NAMES.role, '--assume-role-policy-document', trust]).Role; }
  aws(['iam', 'put-role-policy', '--role-name', NAMES.role, '--policy-name', `${NAMES.role}-policy`, '--policy-document', JSON.stringify(rolePolicy({ bucket, runtimeArn, region, account }))], { json: false });

  // The signer, and its key: kept in the function's settings only, made once.
  if (!aws(['iam', 'get-user', '--user-name', NAMES.signer], { allowFail: true })) { say(`making user ${NAMES.signer}`); aws(['iam', 'create-user', '--user-name', NAMES.signer]); }
  aws(['iam', 'put-user-policy', '--user-name', NAMES.signer, '--policy-name', `${NAMES.signer}-policy`, '--policy-document', JSON.stringify(signerPolicy({ bucket }))], { json: false });
  const existing = aws(['lambda', 'get-function-configuration', '--function-name', NAMES.fn], { allowFail: true });
  let signer = existing?.Environment?.Variables?.SIGNER_KEY_ID ? { id: existing.Environment.Variables.SIGNER_KEY_ID, secret: existing.Environment.Variables.SIGNER_SECRET } : null;
  if (!signer) {
    const k = aws(['iam', 'create-access-key', '--user-name', NAMES.signer]).AccessKey;
    signer = { id: k.AccessKeyId, secret: k.SecretAccessKey };
  }
  const env = { REGION: region, BUCKET: bucket, RUNTIME_ARN: runtimeArn, SUPABASE_URL: db.url, SUPABASE_ANON_KEY: db.anonKey, SIGNER_KEY_ID: signer.id, SIGNER_SECRET: signer.secret };
  const envArg = JSON.stringify({ Variables: env });

  // The function. A role made a moment ago is not assumable yet: retry.
  const settings = ['--runtime', 'nodejs22.x', '--architectures', 'arm64', '--handler', 'index.handler', '--timeout', '90', '--memory-size', '256', '--environment', envArg];
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

  // Its public address. The server checks every caller itself.
  let urlConfig = aws(['lambda', 'get-function-url-config', '--function-name', NAMES.fn], { allowFail: true });
  if (!urlConfig) urlConfig = aws(['lambda', 'create-function-url-config', '--function-name', NAMES.fn, '--auth-type', 'NONE']);
  aws(['lambda', 'add-permission', '--function-name', NAMES.fn, '--statement-id', 'public-url', '--action', 'lambda:InvokeFunctionUrl', '--principal', '*', '--function-url-auth-type', 'NONE'], { allowFail: true });
  aws(['lambda', 'add-permission', '--function-name', NAMES.fn, '--statement-id', 'public-url-invoke', '--action', 'lambda:InvokeFunction', '--principal', '*', '--invoked-via-function-url'], { allowFail: true });

  // S3's notice when a run ends.
  aws(['lambda', 'add-permission', '--function-name', NAMES.fn, '--statement-id', 's3-done', '--action', 'lambda:InvokeFunction', '--principal', 's3.amazonaws.com', '--source-arn', `arn:aws:s3:::${bucket}`, '--source-account', account], { allowFail: true });
  const current = aws(['s3api', 'get-bucket-notification-configuration', '--bucket', bucket], { allowFail: true }) || {};
  aws(['s3api', 'put-bucket-notification-configuration', '--bucket', bucket, '--notification-configuration', JSON.stringify(withDoneNotice(current, fnArn))], { json: false });

  say('ready');
  console.log(urlConfig.FunctionUrl);
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(`cloud-gateway-setup: ${err.message}`); process.exit(1); });
}
