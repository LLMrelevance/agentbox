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

export function readCloudConfig(env = process.env, home = os.homedir()) {
  try {
    const c = JSON.parse(fs.readFileSync(cloudConfigPath(env, home), 'utf8'));
    return c?.bucket && c?.runtimeArn && c?.region ? c : null;
  } catch {
    return null;
  }
}

// The keychain service the first cloud build kept its own Claude tokens
// under. Nothing writes it now; main/cloud/logins.mjs deletes what is left.
export const OLD_TOKEN_SERVICE = `${Name} cloud: Claude sign-in`;
