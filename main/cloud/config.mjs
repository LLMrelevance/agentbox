// WHERE A MAC'S CLOUD RUNS ARE SET UP, AND WHETHER THEY CAN RUN AT ALL.
//
// scripts/cloud-setup.mjs writes ~/.agentbox/cloud.json (the bucket, the
// runtime, the profile it signs as); it is never in git, because it names an
// AWS account. Each account's sign-in for the cloud is made and kept in the
// cloud, never on this Mac (main/cloud/logins.mjs).
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { Name } from '../../shared/product-name.mjs';

// `home` is the supervisor's own idea of the home folder (config.home), so a
// supervisor built for a test, with a home that is not the developer's, never
// reads the developer's real setup.
export function cloudConfigPath(env = process.env, home = os.homedir()) {
  return env.AGENTBOX_CLOUD_CONFIG || path.join(home || os.homedir(), '.agentbox', 'cloud.json');
}

// Either the owner's own AWS account (bucket, runtime, region), or the
// managed cloud's server (`gateway`, its address), whose key sits beside it.
export function readCloudConfig(env = process.env, home = os.homedir()) {
  try {
    const c = JSON.parse(fs.readFileSync(cloudConfigPath(env, home), 'utf8'));
    return (c?.bucket && c?.runtimeArn && c?.region) || typeof c?.gateway === 'string' ? c : null;
  } catch {
    return null;
  }
}

/**
 * Where Agentbox Cloud is: the server's address and the database's public
 * address and key. A release build carries it in the app's own folder; a
 * Mac may keep its own copy. Both files are out of git.
 */
export function cloudAccountConfig(appDir, { home = os.homedir() } = {}) {
  for (const file of [path.join(appDir, 'cloud', 'cloud.public.json'), path.join(home, '.agentbox', 'cloud.public.json')]) {
    try {
      const c = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (typeof c.gateway === 'string' && typeof c.supabaseUrl === 'string' && typeof c.anonKey === 'string') return c;
    } catch { /* try the next */ }
  }
  return null;
}

export const cloudKeyPath =(env = process.env, home = os.homedir()) => path.join(path.dirname(cloudConfigPath(env, home)), 'cloud-key');

export function readCloudKey(env = process.env, home = os.homedir()) {
  try { return fs.readFileSync(cloudKeyPath(env, home), 'utf8').trim() || null; } catch { return null; }
}

export function writeCloudKey(key, env = process.env, home = os.homedir()) {
  const file = cloudKeyPath(env, home);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, key, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

// The keychain service the first cloud build kept its own Claude tokens
// under. Nothing writes it now; main/cloud/logins.mjs deletes what is left.
export const OLD_TOKEN_SERVICE = `${Name} cloud: Claude sign-in`;
