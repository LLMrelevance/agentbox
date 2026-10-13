// WHERE A MAC'S CLOUD RUNS ARE SET UP, AND WHETHER THEY CAN RUN AT ALL.
//
// scripts/cloud-setup.mjs writes ~/.agentbox/cloud.json (the bucket, the
// runtime, the profile it signs as); it is never in git, because it names an
// AWS account. A Claude account can run in the cloud only once its long-lived
// sign-in (`claude setup-token`, Anthropic's own flow) is saved for it, by
// scripts/cloud-signin.mjs, in the macOS keychain, or on Linux in a file only
// its owner can read. Nothing here is an API key, and nothing here is sent
// anywhere but to that account's own sandbox.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Name } from '../../shared/product-name.mjs';

// `home` is the supervisor's own idea of the home folder (config.home), so a
// supervisor built for a test, with a home that is not the developer's, never
// reads the developer's real setup.
export function cloudConfigPath(env = process.env, home = os.homedir()) {
  return env.AGENTBOX_CLOUD_CONFIG || path.join(home || os.homedir(), '.agentbox', 'cloud.json');
}

export function readCloudConfig(env = process.env, home = os.homedir()) {
  try {
    const c = JSON.parse(fs.readFileSync(cloudConfigPath(env, home), 'utf8'));
    return c?.bucket && c?.runtimeArn && c?.region ? c : null;
  } catch {
    return null;
  }
}

const SERVICE = `${Name} cloud: Claude sign-in`;
const fileStore = () => path.join(os.homedir(), '.agentbox', 'cloud-tokens.json');

// The account a token belongs to is the Claude config folder it signs in, so
// two accounts on one Mac never share one.
export function accountKey(configDir) {
  return path.resolve(configDir || path.join(os.homedir(), '.claude'));
}

export function readClaudeToken(configDir, { platform = process.platform } = {}) {
  const account = accountKey(configDir);
  if (platform === 'darwin') {
    try {
      return execFileSync('security', ['find-generic-password', '-s', SERVICE, '-a', account, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
    } catch {
      return null;
    }
  }
  try { return JSON.parse(fs.readFileSync(fileStore(), 'utf8'))[account] || null; } catch { return null; }
}

export function saveClaudeToken(configDir, token, { platform = process.platform } = {}) {
  const account = accountKey(configDir);
  if (platform === 'darwin') {
    execFileSync('security', ['add-generic-password', '-U', '-s', SERVICE, '-a', account, '-w', token], { stdio: 'ignore' });
    return;
  }
  const file = fileStore();
  let all = {};
  try { all = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first one */ }
  all[account] = token;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(all, null, 2), { mode: 0o600 });
}
