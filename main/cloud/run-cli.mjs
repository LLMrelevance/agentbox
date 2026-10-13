#!/usr/bin/env node
// THE PROGRAM THE SUPERVISOR STARTS IN PLACE OF `claude` FOR A CLOUD RUN.
//
//   ELECTRON_RUN_AS_NODE=1 <electron> main/cloud/run-cli.mjs <claude's argv>
//
// Same argv, env and cwd as the local run would have had. Everything it does
// is main/cloud/run.mjs; this only connects it to the real AWS account named
// in ~/.agentbox/cloud.json and to this account's saved Claude sign-in.
import { cloudRun, IMPORT_FAILED } from './run.mjs';
import { awsTransport, awsStorage } from './aws.mjs';
import { readCloudConfig, readClaudeToken } from './config.mjs';

const say = (m) => process.stderr.write(`agentbox cloud: ${m}\n`);

async function main() {
  const config = readCloudConfig();
  if (!config) { say('cloud runs are not set up on this Mac (run scripts/cloud-setup.mjs)'); return 1; }
  // `--agentbox-import-only`: bring an earlier run in this folder home, and
  // start nothing (Supervisor#_bringCloudHome).
  const importOnly = process.argv[2] === '--agentbox-import-only';
  const token = importOnly ? null : readClaudeToken(process.env.CLAUDE_CONFIG_DIR);
  if (!importOnly && !token) { say('this Claude account has no cloud sign-in yet (run scripts/cloud-signin.mjs)'); return 1; }
  return cloudRun({
    importOnly,
    argv: importOnly ? [] : process.argv.slice(2),
    env: process.env,
    cwd: process.cwd(),
    transport: awsTransport(config),
    storage: awsStorage(config),
    claudeToken: token,
  });
}

main().then(
  (code) => process.exit(code ?? 1),
  (err) => { say(`stopped: ${err?.message || err}`); process.exit(IMPORT_FAILED); },
);
