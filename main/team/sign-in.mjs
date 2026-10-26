// THE BROWSER COMES BACK TO THIS MAC WITH A ONE-TIME CODE.
//
// Supabase does the Google part, and sends a new account's confirmation email.
// Either way the person ends up in their own browser, and the app listens on
// 127.0.0.1 for it to come back with a code, which it trades for a session
// (PKCE, so the code is useless to anyone who did not start this sign-in). The
// listener exists only while one is in flight and answers nothing but that one
// path.
//
// The return address must be in the project's allowed list
// (cloud/supabase/config.toml, additional_redirect_urls).
import http from 'node:http';
import { Name } from '../../shared/product-name.mjs';

// Whatever came back in the address is the browser's to show as text, never
// as markup: error_description is anybody's to write (review, 2026-10-01).
const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const PAGE = (title, line) => `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="margin:0;height:100vh;display:grid;place-items:center;background:#1a1817;color:#efebe7;font:16px -apple-system,system-ui,sans-serif">
<div style="text-align:center"><div style="font-size:22px;margin-bottom:8px">${escape(title)}</div><div style="color:#a09994">${escape(line)}</div></div>`;

// ONE ATTEMPT AT A TIME, AND ANY ATTEMPT CAN BE LET GO (2026-10-04). The first
// teammate to install this clicked Continue with Google and saw nothing: the
// page had opened somewhere she could not see, the button then sat disabled
// for the five minutes the listener waits, and a reload and a second click
// failed on "address already in use", because the first attempt still held
// the return address. A new attempt now replaces the one before it, and a
// cancel frees the address at once.
let inFlight = null;

const cancelled = () => Object.assign(new Error('Sign-in was cancelled.'), { cancelled: true });

/** Stop whatever is waiting for the browser, if anything is. True if one was. */
export function cancelGoogleSignIn() {
  if (!inFlight) return false;
  inFlight.cancel();
  return true;
}

/**
 * Wait on 127.0.0.1 for the browser to come back with a code and trade it for
 * a session. `go` runs once the address is being listened on: a Google sign-in
 * opens the browser there itself, a confirmation email's link is already out.
 */
export async function theBrowserComesBackWithACode({
  client, returnUrl, timeoutMs = 5 * 60 * 1000, log = () => {},
  what = 'Google sign-in', done: toSay = { title: 'You are signed in', line: `You can close this tab and go back to ${Name}.` },
  go = async () => {},
}) {
  const url = new URL(returnUrl);
  const port = Number(url.port);
  if (url.hostname !== '127.0.0.1' || !port) throw new Error(`the sign-in return address must be on 127.0.0.1 with a port, not ${returnUrl}`);

  if (inFlight) { log(`team: ${what}: a new attempt replaces the one still waiting`); await inFlight.cancel(); }

  let finish;
  const done = new Promise((resolve, reject) => { finish = { resolve, reject }; });
  done.catch(() => {}); // a cancel can land before anything awaits it
  const server = http.createServer(async (req, res) => {
    const here = new URL(req.url, returnUrl);
    if (here.pathname !== url.pathname) { res.writeHead(404); res.end(); return; }
    const code = here.searchParams.get('code');
    const problem = here.searchParams.get('error_description') || here.searchParams.get('error');
    log(`team: ${what}: the browser came back ${code ? 'with a code' : `without one (${problem || 'no reason given'})`}`);
    if (!code) {
      res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' });
      res.end(PAGE('Sign-in did not finish', problem || `Go back to ${Name} and try again.`));
      finish.reject(new Error(problem || 'sign-in came back without a code'));
      return;
    }
    const { error: refused } = await client.auth.exchangeCodeForSession(code);
    // "invalid flow state" is what an old tab, or one from a cancelled try, gets.
    const error = refused && /flow state/i.test(refused.message ?? '')
      ? new Error(`That link was from an earlier try. Go back to ${Name} and start again.`)
      : refused;
    res.writeHead(error ? 400 : 200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(error ? PAGE('Sign-in did not finish', error.message) : PAGE(toSay.title, toSay.line));
    if (error) finish.reject(error); else finish.resolve();
  });

  const closed = () => new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections?.(); });
  const mine = { cancel: () => { finish.reject(cancelled()); return closed(); } };
  inFlight = mine;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
  } catch (err) {
    if (inFlight === mine) inFlight = null;
    if (err?.code === 'EADDRINUSE') {
      throw new Error(`Another copy of ${Name} is already waiting for a sign-in to come back. Finish it there, or quit that copy and try again.`);
    }
    throw err;
  }
  const timer = setTimeout(() => finish.reject(new Error(`${what} timed out. Try again.`)), timeoutMs);
  try {
    log(`team: ${what}: waiting on ${returnUrl}`);
    await Promise.race([go(), done]);
    await done;
    log(`team: ${what}: done`);
  } catch (err) {
    log(`team: ${what}: ${err?.cancelled ? 'cancelled' : `did not finish: ${err?.message ?? err}`}`);
    throw err;
  } finally {
    clearTimeout(timer);
    if (inFlight === mine) inFlight = null;
    await closed();
  }
}

export async function signInWithGoogle({ client, openExternal, returnUrl, timeoutMs = 5 * 60 * 1000, onUrl = () => {}, log = () => {} }) {
  return theBrowserComesBackWithACode({
    client,
    returnUrl,
    timeoutMs,
    log,
    go: async () => {
      const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: returnUrl, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
      });
      if (error) throw error;
      log(`team: Google sign-in: opening the browser on ${returnUrl}`);
      onUrl(data.url);
      await openExternal(data.url);
    },
  });
}
