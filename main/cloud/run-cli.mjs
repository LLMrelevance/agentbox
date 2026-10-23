#!/usr/bin/env node
// THE PROGRAM THE SUPERVISOR STARTS IN PLACE OF `claude` FOR A CLOUD RUN.
//
//   ELECTRON_RUN_AS_NODE=1 <electron> main/cloud/run-cli.mjs <claude's argv>
//
// Same argv, env and cwd as the local run would have had. Everything it does
// is main/cloud/run.mjs; this only connects it to the real AWS account named
// in ~/.agentbox/cloud.json and names this account's cloud sign-in, which
// lives in the cloud and is never read here (main/cloud/logins.mjs).
// `cloudRunFromArgs` is the same, for one of many runs sharing a process
// (main/cloud/host.mjs).
import path from 'node:path';
import { cloudRun, IMPORT_FAILED, LOGIN_TROUBLE } from './run.mjs';
import { cloudClients } from './clients.mjs';
import { readCloudConfig, readCloudKey, imageCaps, noteImageCaps } from './config.mjs';
import { pickCloudLogin, markCloudLogin, loginObjectKey, cloudAccountsFrom } from './logins.mjs';

// SIGNED AS THE CLOUD RUNS' OWN USER AND NOBODY ELSE. AWS's libraries read
// keys from the environment before they read a named profile, so an app
// started from a shell signed in as an admin would run every cloud call as
// that admin. Those keys go, and the `agentbox-cloud` profile is what signs.
export function dropAwsSignIns(env = process.env) {
  for (const k of Object.keys(env)) {
    if (/^AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN|SECURITY_TOKEN|PROFILE|DEFAULT_PROFILE|CREDENTIAL_EXPIRATION|WEB_IDENTITY_TOKEN_FILE|ROLE_ARN)$/.test(k)) delete env[k];
  }
}

/**
 * The other sign-ins a run carries besides its own, so the agent can call the
 * other tool there the way it can on their Mac. A Claude run carries the Codex
 * account a Codex run would use, when it is ready; a Codex run carries nothing,
 * because Claude's token is long-lived and Codex's is not. Named only, like the
 * run's own.
 */
export function loginsCarriedBy(engine, { only = null, home } = {}) {
  if (engine !== 'claude') return [];
  const codex = pickCloudLogin('codex', { only, ...(home ? { home } : {}) });
  return codex ? [{ engine: 'codex', id: codex.id, key: loginObjectKey('codex', codex.id) }] : [];
}

// One client pair per account and cloud key, shared by every run in a process.
const clients = new Map();
function clientsFor(config) {
  const k = JSON.stringify([config, typeof config.gateway === 'string' ? readCloudKey() : null]);
  if (!clients.has(k)) clients.set(k, cloudClients(config).catch((err) => { clients.delete(k); throw err; }));
  return clients.get(k);
}

/** One cloud run from the relay's own arguments; resolves to its exit code. */
export async function cloudRunFromArgs({ args, env, cwd, stdin, stdout, stderr, signals, pid, watchParent }) {
  const say = (m) => stderr.write(`agentbox cloud: ${m}\n`);
  const config = readCloudConfig();
  if (!config) { say('cloud runs are not set up on this Mac (run scripts/cloud-setup.mjs)'); return 1; }
  // `--agentbox-import-only`: bring an earlier run in this folder home, and
  // start nothing (Supervisor#_bringCloudHome).
  // `--agentbox-codex app-server ...`: a Codex run, its own `codex app-server`
  // in the sandbox, on the Codex login CODEX_HOME names.
  const importOnly = args[0] === '--agentbox-import-only';
  const codex = args[0] === '--agentbox-codex';
  const engine = codex ? 'codex' : 'claude';
  // The cloud account it runs on: of the ones she added for this engine, the
  // one used least recently (main/cloud/logins.mjs). Not the Mac's account:
  // the folder below only says where the conversation is kept.
  const rec = importOnly ? null : pickCloudLogin(engine, { only: cloudAccountsFrom(env) });
  if (!importOnly && !rec) { say(`no ${codex ? 'Codex' : 'Claude'} account is signed in for the cloud yet (the cloud button)`); return LOGIN_TROUBLE; }
  const dir = rec?.key;
  let made;
  try { made = await clientsFor(config); } catch (err) { say(err.message); return LOGIN_TROUBLE; }
  const { transport, storage } = made;
  return cloudRun({
    importOnly,
    engine,
    login: rec ? { engine, id: rec.id, key: loginObjectKey(engine, rec.id) } : null,
    also: rec ? loginsCarriedBy(engine, { only: cloudAccountsFrom(env) }) : [],
    // A missing or refused login is marked so the menu asks for a new sign-in;
    // an expired Codex one is left for the supervisor to renew.
    onLoginTrouble: ({ state, id }) => {
      if (state === 'expired') markCloudLogin(engine, dir, id, { expiresAt: Date.now() });
      else markCloudLogin(engine, dir, id, { broken: state });
    },
    // An account at its usage limit sits out until it resets; the next run
    // takes another cloud account, or this Mac.
    onLimit: ({ until }) => { if (rec) markCloudLogin(engine, dir, rec.id, { limitedUntil: until }); },
    imageCaps: imageCaps(config),
    onCaps: (caps) => noteImageCaps(config, caps),
    remoteCommand: codex ? 'codex' : 'claude',
    argv: importOnly ? [] : args.slice(codex ? 1 : 0),
    env, cwd, transport, storage,
    ...(stdin ? { stdin, stdout, stderr } : {}),
    ...(signals ? { signals } : {}),
    ...(pid ? { pid } : {}),
    ...(watchParent !== undefined ? { watchParent } : {}),
  });
}

// Run as a program, not imported by the host: by the file's name, which holds
// inside the packaged app's archive as well as out of it.
const startedAsProgram = path.basename(process.argv[1] || '') === 'run-cli.mjs';
if (startedAsProgram) {
  dropAwsSignIns();
  cloudRunFromArgs({ args: process.argv.slice(2), env: process.env, cwd: process.cwd(), stdout: process.stdout, stderr: process.stderr }).then(
    (code) => process.exit(code ?? 1),
    (err) => { process.stderr.write(`agentbox cloud: stopped: ${err?.message || err}\n`); process.exit(IMPORT_FAILED); },
  );
}
