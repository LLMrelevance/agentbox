#!/usr/bin/env node
// THE PROGRAM THE SUPERVISOR STARTS IN PLACE OF `claude` FOR A CLOUD RUN.
//
//   ELECTRON_RUN_AS_NODE=1 <electron> main/cloud/run-cli.mjs <claude's argv>
//
// Same argv, env and cwd as the local run would have had. Everything it does
// is main/cloud/run.mjs; this only connects it to the real AWS account named
// in ~/.agentbox/cloud.json and names this account's cloud sign-in, which
// lives in the cloud and is never read here (main/cloud/logins.mjs).
import { cloudRun, IMPORT_FAILED, LOGIN_TROUBLE } from './run.mjs';
import { awsTransport, awsStorage } from './aws.mjs';
import { readCloudConfig } from './config.mjs';
import { pickCloudLogin, markCloudLogin, loginObjectKey } from './logins.mjs';

const say = (m) => process.stderr.write(`agentbox cloud: ${m}\n`);

async function main() {
  // SIGNED AS THE CLOUD RUNS' OWN USER AND NOBODY ELSE. AWS's libraries read
  // keys from the environment before they read a named profile, so an app
  // started from a shell signed in as an admin would run every cloud call as
  // that admin. Those keys go, and the `agentbox-cloud` profile is what signs.
  for (const k of Object.keys(process.env)) {
    if (/^AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN|SECURITY_TOKEN|PROFILE|DEFAULT_PROFILE|CREDENTIAL_EXPIRATION|WEB_IDENTITY_TOKEN_FILE|ROLE_ARN)$/.test(k)) delete process.env[k];
  }
  const config = readCloudConfig();
  if (!config) { say('cloud runs are not set up on this Mac (run scripts/cloud-setup.mjs)'); return 1; }
  // `--agentbox-import-only`: bring an earlier run in this folder home, and
  // start nothing (Supervisor#_bringCloudHome).
  // `--agentbox-codex app-server ...`: a Codex run, its own `codex app-server`
  // in the sandbox, on the Codex login CODEX_HOME names.
  const importOnly = process.argv[2] === '--agentbox-import-only';
  const codex = process.argv[2] === '--agentbox-codex';
  const engine = codex ? 'codex' : 'claude';
  // The cloud account it runs on: of the ones she added for this engine, the
  // one used least recently (main/cloud/logins.mjs). Not the Mac's account:
  // the folder below only says where the conversation is kept.
  const rec = importOnly ? null : pickCloudLogin(engine);
  if (!importOnly && !rec) { say(`no ${codex ? 'Codex' : 'Claude'} account is signed in for the cloud yet (the cloud button)`); return LOGIN_TROUBLE; }
  const dir = rec?.key;
  return cloudRun({
    importOnly,
    engine,
    login: rec ? { engine, id: rec.id, key: loginObjectKey(engine, rec.id) } : null,
    // A missing or refused login is marked so the menu asks for a new sign-in;
    // an expired Codex one is left for the supervisor to renew.
    onLoginTrouble: ({ state, id }) => {
      if (state === 'expired') markCloudLogin(engine, dir, id, { expiresAt: Date.now() });
      else markCloudLogin(engine, dir, id, { broken: state });
    },
    // An account at its usage limit sits out until it resets; the next run
    // takes another cloud account, or this Mac.
    onLimit: ({ until }) => { if (rec) markCloudLogin(engine, dir, rec.id, { limitedUntil: until }); },
    remoteCommand: codex ? 'codex' : 'claude',
    argv: importOnly ? [] : process.argv.slice(codex ? 3 : 2),
    env: process.env,
    cwd: process.cwd(),
    transport: awsTransport(config),
    storage: awsStorage(config),
  });
}

main().then(
  (code) => process.exit(code ?? 1),
  (err) => { say(`stopped: ${err?.message || err}`); process.exit(IMPORT_FAILED); },
);
