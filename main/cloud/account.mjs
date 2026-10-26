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
import { cloudConfigPath, readCloudConfig, readCloudKey, writeCloudKey, cloudKeyPath, cloudAccountConfig, forgetCloudKey } from './config.mjs';
import { withDeadline, plainAuthError } from '../team/session.mjs';
import { signInWithGoogle, cancelGoogleSignIn, theBrowserComesBackWithACode } from '../team/sign-in.mjs';
import { Name } from '../../shared/product-name.mjs';

const CALL_MS = 30_000;
const RETURN_URL = 'http://127.0.0.1:54783/auth/callback';
// Long enough to go and open an email, short enough that the one address the
// whole app signs in through is let go of rather than held for good.
const CONFIRM_WAIT_MS = 15 * 60_000;

export { cloudAccountConfig };

async function ask(gateway, route, { method = 'GET', key, body } = {}) {
  const init = { method, headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined };
  const res = await fetch(`${gateway.replace(/\/+$/, '')}${route}`, { ...init, signal: AbortSignal.timeout(CALL_MS) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/** The version of the terms a person accepts now. */
export async function currentCloudTerms(config) {
  return (await ask(config.gateway, '/v1/terms')).body.terms ?? null;
}

/**
 * The ways in that the app's sign-in page offers (team/SignInPage.tsx):
 * Google, an email and a password, or a new account. Each gives the access
 * token of a fresh sign-in, held in memory only: the cloud key is what this
 * Mac keeps, so nothing asks the keychain.
 */
export function cloudAccountSession({ config, openExternal, log = () => {}, createClient = null, confirmWaitMs = CONFIRM_WAIT_MS }) {
  let lastUrl = null;
  // The client that made a new account, kept until its email's link comes
  // back: the one-time proof that redeems the code is held inside it, so no
  // other client on this Mac, and no other Mac, could finish that sign-up.
  let confirming = null;
  const returnUrl = () => config.signInReturn || RETURN_URL;
  const client = async () => {
    const make = createClient || (await import('@supabase/supabase-js')).createClient;
    const mem = new Map();
    return make(config.supabaseUrl, config.anonKey, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: false, storage: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) } },
      global: { fetch: withDeadline() },
    });
  };
  const tokenOf = (data) => {
    if (!data?.session?.access_token) throw new Error('Signing in came back without a session. Try again.');
    return data.session.access_token;
  };
  return {
    async google() {
      const c = await client();
      await signInWithGoogle({ client: c, openExternal, returnUrl: returnUrl(), log, onUrl: (u) => { lastUrl = u; } });
      return tokenOf((await c.auth.getSession()).data);
    },
    async email(email, password) {
      const { data, error } = await (await client()).auth.signInWithPassword({ email: String(email ?? '').trim(), password: String(password ?? '') });
      if (error) throw new Error(plainAuthError(error.message));
      return tokenOf(data);
    },
    // With confirmation on, a new account has no session until its email's
    // link is followed: null, and the page says to check the inbox.
    async signUp({ name, email, password }) {
      const c = await client();
      const at = String(email ?? '').trim();
      const { data, error } = await c.auth.signUp({
        email: at, password: String(password ?? ''),
        options: {
          data: { full_name: String(name ?? '').trim() || undefined },
          // Named, or the link goes to the database's own site_url: this Mac
          // with no path, where nothing is listening (F-59, 2026-10-25).
          emailRedirectTo: returnUrl(),
        },
      });
      if (error) throw new Error(plainAuthError(error.message));
      if (data?.session?.access_token) { confirming = null; return data.session.access_token; }
      confirming = { client: c, email: at };
      return null;
    },

    /** Another copy of the link, for one that never arrived or went astray. */
    async resend() {
      if (!confirming) throw new Error('Create the account again to get a new link.');
      const { error } = await confirming.client.auth.resend({
        type: 'signup', email: confirming.email, options: { emailRedirectTo: returnUrl() },
      });
      if (error) throw new Error(plainAuthError(error.message));
    },

    /** The access token of a sign-up whose link the browser brings back here. */
    async confirmation() {
      if (!confirming) return null;
      const c = confirming.client;
      await theBrowserComesBackWithACode({
        client: c,
        returnUrl: returnUrl(),
        timeoutMs: confirmWaitMs,
        log,
        what: 'email confirmation',
        done: { title: 'Your email is confirmed', line: `You can close this tab and go back to ${Name}.` },
      });
      confirming = null;
      return tokenOf((await c.auth.getSession()).data);
    },
    cancel: () => cancelGoogleSignIn(),
    reopen: () => (lastUrl ? openExternal(lastUrl) : null),
  };
}

/**
 * One press on the sign-in page, to a cloud key. It agrees to the current
 * terms only when the page showed them (`acceptTerms`, and every new account);
 * otherwise a person who never agreed gets `needsTerms`, and `agree` finishes
 * that same sign-in once they do.
 */
export async function cloudSignIn({ config, session, method, email, password, name, acceptTerms = false, env = process.env, home = os.homedir() }) {
  let token;
  let agreeing = acceptTerms;
  try {
    if (method === 'google') token = await session.google();
    else if (method === 'email') token = await session.email(email, password);
    else if (method === 'sign-up') {
      agreeing = true;
      token = await session.signUp({ name, email, password });
      if (!token) return { ok: true, confirm: true };
    } else if (method === 'resend') {
      await session.resend();
      return { ok: true, confirm: true, sent: true };
    } else if (method === 'agree') {
      token = session.held;
      agreeing = true;
      if (!token) return { ok: false, error: 'Sign in again to finish.' };
    } else return { ok: false, error: 'No such way to sign in.' };
  } catch (err) {
    return { ok: false, error: err?.message || String(err), ...(err?.cancelled ? { cancelled: true } : {}) };
  }
  session.held = token;
  const acceptedTerms = agreeing ? await currentCloudTerms(config) : undefined;
  const out = await signInToCloud({ config, acceptedTerms, googleSignIn: async () => token, env, home });
  if (out.ok) { session.held = null; return out; }
  if (out.error === 'terms' && !agreeing) return { ok: false, needsTerms: true, terms: out.terms ?? null };
  return { ok: false, error: out.message || out.error };
}

/**
 * A new account's page says to check the inbox, and this waits behind it for
 * the link to come back, then finishes the same sign-in: nothing else to press
 * (F-59). Creating the account is what agrees to the terms, as on the page.
 */
export async function waitForEmailConfirmation({ config, session, env = process.env, home = os.homedir() }) {
  let token;
  try { token = await session.confirmation(); } catch (err) { return { ok: false, error: err?.message || String(err), ...(err?.cancelled ? { cancelled: true } : {}) }; }
  if (!token) return { ok: false, error: 'nothing-waiting' };
  const out = await signInToCloud({ config, acceptedTerms: await currentCloudTerms(config), googleSignIn: async () => token, env, home });
  return out.ok ? out : { ok: false, error: out.message || out.error };
}

// `googleSignIn` gives the access token of whichever sign-in the page made.
export async function signInToCloud({ config, acceptedTerms, name = os.hostname(), env = process.env, home = os.homedir(), googleSignIn }) {
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

// The server's cloud and this Mac's key for it, or null when signed out.
function signedIn(env, home) {
  const gateway = readCloudConfig(env, home)?.gateway;
  const key = gateway ? readCloudKey(env, home) : null;
  return key ? { gateway, key } : null;
}

/** The plan, its agents and hours, and what is used, as the server counts them. */
export async function cloudPlan({ env = process.env, home = os.homedir() } = {}) {
  const at = signedIn(env, home);
  if (!at) return { signedIn: false };
  const me = await ask(at.gateway, '/v1/me', { key: at.key });
  if (me.status === 401) forgetCloudKey(at.key, env, home);
  return me.status === 200 ? { signedIn: true, ...me.body } : { signedIn: me.status !== 401, error: me.body.error || 'refused', message: me.body.message };
}

/** End every other Mac's cloud key, for a Mac that was lost; this one stays signed in. */
export async function signOutOtherMacs({ env = process.env, home = os.homedir() } = {}) {
  const at = signedIn(env, home);
  if (!at) return { ok: false, error: 'signed-out', message: `Sign in to ${Name} Cloud first.` };
  const out = await ask(at.gateway, '/v1/devices', { method: 'DELETE', key: at.key, body: { others: true } });
  if (out.status === 401) forgetCloudKey(at.key, env, home);
  return out.status === 200 ? { ok: true } : { ok: false, error: out.body.error || 'refused', message: out.body.message || `the cloud said ${out.status}` };
}

// Only Stripe's own two pages are opened: whatever else a server answers stays shut.
const STRIPE_PAGE = /^https:\/\/(checkout|billing)\.stripe\.com\//;

async function openStripe(route, body, openExternal, env, home) {
  const at = signedIn(env, home);
  if (!at) return { ok: false, error: 'signed-out', message: `Sign in to ${Name} Cloud first.` };
  const out = await ask(at.gateway, route, { method: 'POST', key: at.key, body });
  if (out.status !== 200) return { ok: false, error: out.body.error || 'refused', message: out.body.message || `the cloud said ${out.status}` };
  if (typeof out.body.url !== 'string' || !STRIPE_PAGE.test(out.body.url)) return { ok: false, error: 'not-stripe', message: 'The cloud answered with a page that is not Stripe\'s.' };
  await openExternal(out.body.url);
  return { ok: true, ...(out.body.where ? { where: out.body.where } : {}) };
}

/** Stripe's checkout for a plan, in the browser; the billing page for someone already paying. */
export const payForCloud = ({ plan, openExternal, env = process.env, home = os.homedir() }) => openStripe('/v1/checkout', { plan }, openExternal, env, home);

/** Stripe's billing page: change plan, cancel, the card, invoices. */
export const openCloudBilling = ({ openExternal, env = process.env, home = os.homedir() }) => openStripe('/v1/billing', {}, openExternal, env, home);

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
