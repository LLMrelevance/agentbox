// SIGNING IN TO AGENTBOX CLOUD FROM THIS MAC.
//
// A Google sign-in, through the database's own page, is traded once with the
// cloud server (cloud/gateway/) for a cloud key, kept beside cloud.json; the
// Mac's cloud.json then names the server, so its runs go there
// (main/cloud/clients.mjs). The database session itself is not kept. A Mac
// set up on its owner's own AWS account is never moved onto the server.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cloudConfigPath, readCloudConfig, readCloudKey, writeCloudKey, cloudKeyPath } from './config.mjs';
import { withDeadline } from '../team/session.mjs';
import { signInWithGoogle } from '../team/sign-in.mjs';

const CALL_MS = 30_000;
const RETURN_URL = 'http://127.0.0.1:54783/auth/callback';

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

async function ask(gateway, route, { method = 'GET', key, body } = {}) {
  const init = { method, headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined };
  const res = await fetch(`${gateway.replace(/\/+$/, '')}${route}`, { ...init, signal: AbortSignal.timeout(CALL_MS) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/** The version of the terms a person accepts now. */
export async function currentCloudTerms(config) {
  return (await ask(config.gateway, '/v1/terms')).body.terms ?? null;
}

// The access token of a fresh Google sign-in, through the database's own
// page. Kept in memory only: the cloud key is what this Mac keeps.
async function googleAccessToken({ config, openExternal, log }) {
  const { createClient } = await import('@supabase/supabase-js');
  const mem = new Map();
  const client = createClient(config.supabaseUrl, config.anonKey, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: false, storage: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) } },
    global: { fetch: withDeadline() },
  });
  await signInWithGoogle({ client, openExternal, returnUrl: config.signInReturn || RETURN_URL, log });
  const { data } = await client.auth.getSession();
  if (!data?.session?.access_token) throw new Error('Google sign-in came back without a session. Try again.');
  return data.session.access_token;
}

export async function signInToCloud({ config, acceptedTerms, name = os.hostname(), openExternal, log = () => {}, env = process.env, home = os.homedir(), googleSignIn = () => googleAccessToken({ config, openExternal, log }) }) {
  const now = readCloudConfig(env, home);
  if (now?.bucket) return { ok: false, error: 'own-aws', message: 'This Mac runs the cloud in its own AWS account.' };
  let token;
  try { token = await googleSignIn(); } catch (err) { return { ok: false, error: 'google', message: err?.message || String(err) }; }
  const made = await ask(config.gateway, '/v1/devices', { method: 'POST', key: token, body: { acceptedTerms, name: String(name).slice(0, 80) } });
  if (made.status !== 200 || !made.body.key) return { ok: false, error: made.body.error || 'refused', message: made.body.message || `the cloud said ${made.status}`, ...(made.body.terms ? { terms: made.body.terms } : {}) };
  writeCloudKey(made.body.key, env, home);
  const file = cloudConfigPath(env, home);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ gateway: config.gateway }, null, 2) + '\n', { mode: 0o600 });
  const me = await ask(config.gateway, '/v1/me', { key: made.body.key });
  return { ok: true, ...(me.status === 200 ? me.body : {}) };
}

/** Let this Mac's cloud key go, there and here. An own-AWS setup is left alone. */
export async function signOutOfCloud({ env = process.env, home = os.homedir() } = {}) {
  const now = readCloudConfig(env, home);
  if (!now?.gateway) return { ok: true };
  const key = readCloudKey(env, home);
  if (key) await ask(now.gateway, '/v1/devices', { method: 'DELETE', key }).catch(() => {});
  fs.rmSync(cloudKeyPath(env, home), { force: true });
  fs.rmSync(cloudConfigPath(env, home), { force: true });
  return { ok: true };
}
