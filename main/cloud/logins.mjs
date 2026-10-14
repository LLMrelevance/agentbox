// EACH ACCOUNT'S CLOUD SIGN-IN, AS THE MAC KNOWS IT: BY NAME, NEVER BY CONTENT.
//
// docs/cloud/PLAN.md, "Sign-ins live in the cloud". A person signs in to
// Claude or Codex inside a cloud sandbox, through the vendor's own sign-in,
// and the login is kept in the cloud bucket as `logins/<engine>/<id>.json`.
// The Mac keeps only a note per account in ~/.agentbox/cloud-logins.json:
// which object is current, when it was saved, when a Codex one runs out, and
// whether it stopped working. Nothing here ever reads a login object; it only
// asks for links to one, which the sandbox uses.
//
// Three things the Mac does with that note:
//   - decides whether an account's threads may go to the cloud
//     (`cloudLoginState`);
//   - runs the sign-in from the cloud menu (`startCloudSignIn`), which is a
//     sandbox session the Mac only relays a link and a code to;
//   - renews a Codex login before it runs out (`renewCloudCodexLogin`), one
//     at a time per account, fenced across an app restart.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

// A Codex access token lasts 240 hours. One with under 3 days left is
// renewed; one with under 9 hours (an 8-hour run and its homecoming) does not
// start a run until it has been.
export const CODEX_RENEW_BEFORE_MS = 3 * 24 * 3600_000;
export const CODEX_RUN_NEEDS_MS = 9 * 3600_000;
// A renewal that started this long ago and never said how it ended is over.
const RENEWAL_FENCE_MS = 10 * 60_000;
// An object a newer sign-in replaced is deleted this long after, so a run
// that was handed its link a moment before still finds it.
const OLD_LOGIN_GRACE_MS = 60 * 60_000;
const LINK_SECONDS = 30 * 60;

export const loginObjectKey = (engine, id) => `logins/${engine}/${id}.json`;
export const cloudLoginsPath = (home = os.homedir()) => path.join(home, '.agentbox', 'cloud-logins.json');
const accountOf = (engine, dir) => `${engine}:${path.resolve(dir)}`;

export function readCloudLogins({ home = os.homedir() } = {}) {
  try {
    const all = JSON.parse(fs.readFileSync(cloudLoginsPath(home), 'utf8'));
    return all && typeof all === 'object' ? all : {};
  } catch {
    return {};
  }
}

function writeCloudLogins(all, { home = os.homedir() } = {}) {
  const file = cloudLoginsPath(home);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(all, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

// ONE WRITER AT A TIME. The supervisor and every cloud run's own process
// write this note; a check of the current login and the write after it must
// be one step, or an old run's report lands over a new sign-in (Codex's
// review, finding 2). A lock file, taken exclusively; one left by a process
// that died is stale after ten seconds.
function withLock(home, fn) {
  const lock = `${cloudLoginsPath(home)}.lock`;
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  const until = Date.now() + 5000;
  const pause = new Int32Array(new SharedArrayBuffer(4));
  for (;;) {
    try {
      fs.closeSync(fs.openSync(lock, 'wx'));
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 10_000) { fs.rmSync(lock, { force: true }); continue; } } catch { continue; }
      if (Date.now() > until) throw new Error('the cloud sign-in note is busy');
      Atomics.wait(pause, 0, 0, 15);
    }
  }
  try { return fn(); } finally { fs.rmSync(lock, { force: true }); }
}

export function cloudLoginFor(engine, dir, { home = os.homedir() } = {}) {
  return readCloudLogins({ home })[accountOf(engine, dir)] ?? null;
}

// A new sign-in becomes the account's current one. What it replaced is kept
// on a list to delete once no run can still be about to fetch it.
export function recordCloudLogin(engine, dir, { id, savedAt = Date.now(), expiresAt = null, email = null }, { home = os.homedir(), now = Date.now() } = {}) {
  return withLock(home, () => {
  const all = readCloudLogins({ home });
  const key = accountOf(engine, dir);
  const was = all[key];
  const retired = [...(was?.retired || [])];
  if (was?.id && was.id !== id) retired.push({ id: was.id, at: now });
  all[key] = { engine, dir: path.resolve(dir), id, savedAt, expiresAt, email: email ?? was?.email ?? null, broken: null, renewing: null, retired };
  writeCloudLogins(all, { home });
  return all[key];
  });
}

// A change to the account's note that applies only while `id` is still its
// current login: an old run that reports trouble cannot undo a new sign-in.
export function markCloudLogin(engine, dir, id, patch, { home = os.homedir() } = {}) {
  return withLock(home, () => {
    const all = readCloudLogins({ home });
    const key = accountOf(engine, dir);
    if (!all[key] || (id != null && all[key].id !== id)) return false;
    all[key] = { ...all[key], ...patch };
    writeCloudLogins(all, { home });
    return true;
  });
}

// 'none' (never signed in), 'broken' (sign in again), 'renew' (Codex: must
// be renewed before a run), 'stale' (Codex: may run, renewal due), 'ready'.
export function cloudLoginState(rec, { now = Date.now() } = {}) {
  if (!rec?.id) return 'none';
  if (rec.broken) return 'broken';
  if (rec.engine !== 'codex' || !rec.expiresAt) return 'ready';
  const left = rec.expiresAt - now;
  if (left < CODEX_RUN_NEEDS_MS) return 'renew';
  if (left < CODEX_RENEW_BEFORE_MS) return 'stale';
  return 'ready';
}

export const mayRunOn = (state) => state === 'ready' || state === 'stale';

// Delete what newer sign-ins replaced, once their grace is over. Never the
// current one.
export async function sweepRetiredLogins(engine, dir, { storage, home = os.homedir(), now = Date.now() } = {}) {
  const rec = cloudLoginFor(engine, dir, { home });
  if (!rec?.retired?.length || !storage?.del) return;
  const keep = [];
  for (const r of rec.retired) {
    if (now - r.at < OLD_LOGIN_GRACE_MS || r.id === rec.id) { keep.push(r); continue; }
    try { await storage.del(loginObjectKey(engine, r.id)); } catch { keep.push(r); }
  }
  markCloudLogin(engine, dir, rec.id, { retired: keep }, { home });
}

/* ------------------------------ a session -------------------------------- */
// One sandbox session that is not a run: a sign-in or a renewal. Starts it,
// reads its `signin` events until it says how it ended, and lets the session
// go. `onEvent` hears each event; the session's end is the promise's value.
async function session({ transport, start, onEvent = () => {}, pollWaitMs = 20_000, isCancelled = () => false }) {
  const sessionId = `agentbox-${start.action}-${start.engine}-${start.runId}`;
  const say = (state, extra = {}) => ({ state, ...extra });
  const invoke = async (payload) => {
    for (let failures = 0; ;) {
      try { return await transport.invoke(sessionId, payload); } catch (err) {
        failures += 1;
        if (failures > 5 || isCancelled()) throw err;
        await new Promise((r) => setTimeout(r, 500 * failures));
      }
    }
  };
  try {
    if (isCancelled()) return say('failed', { message: null });
    const started = await invoke(start);
    if (!started?.ok) return say('failed', { message: 'The cloud could not start the sign-in. Try again.' });
    // A cancel that raced the start: the session that did start is stopped.
    if (isCancelled()) {
      await transport.invoke(sessionId, { action: 'signal', runId: start.runId, signal: 'SIGTERM' }).catch(() => {});
      return say('failed', { message: null });
    }
    let since = 0;
    for (;;) {
      const page = await invoke({ action: 'events', runId: start.runId, since, waitMs: pollWaitMs });
      if (!page?.ok) return say('failed', { message: 'The cloud sign-in went away. Try again.' });
      for (const e of page.events || []) {
        since = Math.max(since, e.seq);
        if (e.kind !== 'signin') continue;
        onEvent(e);
        if (e.state === 'saved' || e.state === 'failed') return e;
      }
    }
  } catch {
    return say('failed', { message: 'The cloud could not be reached. Try again.' });
  } finally {
    await Promise.resolve(transport.stop?.(sessionId)).catch(() => {});
  }
}

/* ------------------------------ signing in ------------------------------- */
// THE CLOUD MENU'S SIGN-IN for one account. What the menu draws comes from
// `status()`: 'starting', then for Claude 'needs-code' with the link to open
// (the person pastes Claude's code into `code()`), for Codex 'waiting' with
// the link and the one-time code to type on OpenAI's page; then 'checking',
// and 'saved' or 'failed' with a sentence. A Codex sign-in made with a
// different ChatGPT account than the one this Mac's folder holds is refused.
export function startCloudSignIn({ transport, storage, engine, dir, home = os.homedir(), expectEmail = null, onChange = () => {}, onSaved = () => {}, pollWaitMs }) {
  const id = crypto.randomUUID();
  const runId = `signin-${id}`;
  // `attempt` tells one sign-in from the next, which can show the same link.
  let status = { state: 'starting', url: null, code: null, message: null, attempt: runId };
  let cancelled = false;
  const set = (patch) => { status = { ...status, ...patch }; onChange(status); };

  const done = (async () => {
    const saveUrl = await storage.putUrl(loginObjectKey(engine, id), LINK_SECONDS);
    const end = await session({
      transport,
      pollWaitMs,
      isCancelled: () => cancelled,
      start: { action: 'signin', runId, engine, saveUrl },
      onEvent: (e) => {
        if (e.state === 'needs-code') set({ state: 'needs-code', url: e.url });
        else if (e.state === 'waiting') set({ state: 'waiting', url: e.url, code: e.code });
        else if (e.state === 'checking') set({ state: 'checking' });
      },
    });
    if (end.state !== 'saved') {
      set({ state: 'failed', message: cancelled ? null : (end.message || 'That did not work. Try again.') });
      return status;
    }
    if (engine === 'codex' && expectEmail && end.email && end.email.toLowerCase() !== String(expectEmail).toLowerCase()) {
      await Promise.resolve(storage.del?.(loginObjectKey(engine, id))).catch(() => {});
      set({ state: 'failed', message: `That signed in as ${end.email}. Sign in with ${expectEmail} instead.` });
      return status;
    }
    recordCloudLogin(engine, dir, { id, expiresAt: end.expiresAt ?? null, email: end.email ?? null }, { home });
    set({ state: 'saved', url: null, code: null });
    try { onSaved(); } catch { /* the menu redraws anyway */ }
    return status;
  })().catch((err) => {
    set({ state: 'failed', message: `That did not work (${err.message}). Try again.` });
    return status;
  });

  return {
    status: () => status,
    done,
    async code(text) {
      const c = String(text || '').trim();
      if (!c || status.state !== 'needs-code') return false;
      set({ state: 'checking', message: null });
      let ok = false;
      try {
        const out = await transport.invoke(`agentbox-signin-${engine}-${runId}`, { action: 'signin-code', runId, code: c });
        ok = !!out?.ok;
      } catch { /* not delivered */ }
      // A code that did not reach the sign-in can be pasted again (finding 7).
      if (!ok && status.state === 'checking') set({ state: 'needs-code', message: 'That code did not reach the sign-in. Paste it again.' });
      return ok;
    },
    async cancel() {
      cancelled = true;
      try { await transport.invoke(`agentbox-signin-${engine}-${runId}`, { action: 'signal', runId, signal: 'SIGTERM' }); } catch { /* gone */ }
    },
  };
}

/* ------------------------------- renewing -------------------------------- */
// ONE CODEX LOGIN RENEWED: a sandbox session that renews it from the real
// login and keeps the renewed one as a new object. Fenced by a `renewing`
// mark, so an app restarted mid-renewal does not start a second one on the
// same refresh token. Returns 'renewed', 'busy', 'signed-out' or 'failed'.
export async function renewCloudCodexLogin({ transport, storage, dir, home = os.homedir(), now = Date.now(), pollWaitMs }) {
  const rec = cloudLoginFor('codex', dir, { home });
  if (!rec?.id || rec.broken) return 'failed';
  const was = typeof rec.renewing === 'number' ? { at: rec.renewing, id: null } : rec.renewing;
  if (was && now - was.at < RENEWAL_FENCE_MS) return 'busy';
  // A RENEWAL THE APP NEVER HEARD THE END OF (it quit, or the Mac slept):
  // the renewed login may be in the cloud already, under the id written down
  // before it started. If it is, it is the current one, and the old refresh
  // token, which renewing spent, is never used again (finding 3).
  if (was?.id && await Promise.resolve(storage.exists?.(loginObjectKey('codex', was.id))).catch(() => false)) {
    recordCloudLogin('codex', dir, { id: was.id, expiresAt: was.at + 239 * 3600_000, email: rec.email }, { home, now });
    return 'renewed';
  }
  const id = crypto.randomUUID();
  markCloudLogin('codex', dir, rec.id, { renewing: { at: now, id } }, { home });
  const end = await session({
    transport,
    pollWaitMs,
    start: {
      action: 'renew',
      runId: `renew-${id}`,
      engine: 'codex',
      loginUrl: await storage.getUrl(loginObjectKey('codex', rec.id), LINK_SECONDS),
      saveUrl: await storage.putUrl(loginObjectKey('codex', id), LINK_SECONDS),
    },
  });
  if (end.state === 'saved') {
    recordCloudLogin('codex', dir, { id, expiresAt: end.expiresAt ?? null, email: rec.email }, { home, now: Date.now() });
    return 'renewed';
  }
  if (end.signedOut) {
    markCloudLogin('codex', dir, rec.id, { broken: 'signed-out', renewing: null }, { home });
    return 'signed-out';
  }
  markCloudLogin('codex', dir, rec.id, { renewing: null }, { home });
  return 'failed';
}

/* ------------------------ the first build's tokens ----------------------- */
// The first cloud build kept a Claude token per account in the macOS keychain
// (service below) or, elsewhere, in ~/.agentbox/cloud-tokens.json. Those were
// the app's own copies for the cloud, never Claude Code's own login, and
// nothing reads them now. Deleted once, on start.
export const OLD_KEYCHAIN_SERVICE_SUFFIX = 'cloud: Claude sign-in';
export function forgetOldCloudTokens({ home = os.homedir(), platform = process.platform, service, exec } = {}) {
  try { fs.rmSync(path.join(home, '.agentbox', 'cloud-tokens.json'), { force: true }); } catch { /* none */ }
  if (platform !== 'darwin' || !service || !exec) return;
  // One entry per account; delete until there are none (at most 20).
  for (let i = 0; i < 20; i += 1) {
    try { exec('security', ['delete-generic-password', '-s', service]); } catch { break; }
  }
}
