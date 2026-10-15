// HER PHONE'S OWN WAY INTO HER ROWS ONLINE (docs/cloud/PHONE-PLAN.md, step 1).
//
// The phone with the Mac shut talks to the database itself, as her: it signs
// in with the same account the Mac uses, through the database's own sign-in
// pages, and reads and writes only what row level security gives that account
// (cloud/supabase/migrations/20261014000000_phone_inbox.sql). It holds the
// public address and the public key every browser of the site has; never a
// service key, never a vendor login.
//
// Plain fetch rather than the database's own library: the phone needs five
// calls, and each one here is one request a test can see.

export interface CloudConfig { url: string; anonKey: string }
export interface CloudSession { access_token: string; refresh_token: string; expires_at: number; user: { id: string; email?: string | null } }

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const SESSION_KEY = 'agentbox-cloud-session';
const VERIFIER_KEY = 'agentbox-cloud-verifier';

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function cloudClient(cfg: CloudConfig, { storage, fetchImpl, now = () => Date.now() }: { storage: Store; fetchImpl: Fetch; now?: () => number }) {
  const base = cfg.url.replace(/\/+$/, '');
  let session: CloudSession | null = (() => {
    try { const s = JSON.parse(storage.getItem(SESSION_KEY) || 'null'); return s?.access_token && s?.user?.id ? s : null; } catch { return null; }
  })();
  const keep = (s: CloudSession | null) => {
    session = s;
    try { if (s) storage.setItem(SESSION_KEY, JSON.stringify(s)); else storage.removeItem(SESSION_KEY); } catch { /* private mode: this tab only */ }
  };

  async function call(path: string, init: RequestInit & { auth?: boolean } = {}) {
    const headers: Record<string, string> = { apikey: cfg.anonKey, 'content-type': 'application/json', ...(init.headers as Record<string, string> | undefined) };
    if (init.auth !== false) headers.authorization = `Bearer ${await token()}`;
    const res = await fetchImpl(`${base}${path}`, { ...init, headers });
    const text = await res.text();
    const body = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
    if (!res.ok) {
      if (res.status === 401 && init.auth !== false) keep(null);
      const said = (body && typeof body === 'object' && (body.msg || body.message || body.error_description || body.error)) || `the cloud answered ${res.status}`;
      throw new Error(String(said));
    }
    return body;
  }

  // From a token answer to a kept session.
  const took = (body: any): CloudSession => {
    const s = { access_token: body.access_token, refresh_token: body.refresh_token, expires_at: body.expires_at ? body.expires_at * 1000 : now() + (body.expires_in ?? 3600) * 1000, user: { id: body.user?.id, email: body.user?.email ?? null } };
    if (!s.access_token || !s.user.id) throw new Error('the sign-in came back without an account');
    keep(s);
    return s;
  };

  // A token good for at least another minute, renewed if it is not.
  async function token(): Promise<string> {
    if (!session) throw new Error('not signed in');
    if (session.expires_at - now() > 60_000) return session.access_token;
    const body = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', auth: false, body: JSON.stringify({ refresh_token: session.refresh_token }) });
    return took(body).access_token;
  }

  return {
    session: () => session,
    signedIn: () => !!session,

    async signInWithPassword(email: string, password: string) {
      return took(await call('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: JSON.stringify({ email, password }) }));
    },
    // A new account may have to confirm its email first; then there is no
    // session yet, and the page says to look for the email.
    async signUp(name: string, email: string, password: string): Promise<{ confirm: boolean }> {
      const body = await call('/auth/v1/signup', { method: 'POST', auth: false, body: JSON.stringify({ email, password, data: { full_name: name } }) });
      if (body?.access_token) { took(body); return { confirm: false }; }
      return { confirm: true };
    },
    // GOOGLE, THROUGH THE DATABASE'S OWN SIGN-IN PAGE, with a one-time proof
    // (PKCE) so the code that comes back is no use to anybody else.
    async googleUrl(returnTo: string) {
      const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
      const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
      try { storage.setItem(VERIFIER_KEY, verifier); } catch { /* the return will say so */ }
      const q = new URLSearchParams({ provider: 'google', redirect_to: returnTo, code_challenge: challenge, code_challenge_method: 's256' });
      return `${base}/auth/v1/authorize?${q}`;
    },
    async finishGoogle(code: string) {
      const verifier = storage.getItem(VERIFIER_KEY);
      if (!verifier) throw new Error('This sign-in was started somewhere else. Try again here.');
      storage.removeItem(VERIFIER_KEY);
      return took(await call('/auth/v1/token?grant_type=pkce', { method: 'POST', auth: false, body: JSON.stringify({ auth_code: code, code_verifier: verifier }) }));
    },
    signOut() {
      const had = session;
      keep(null);
      if (had) fetchImpl(`${base}/auth/v1/logout`, { method: 'POST', headers: { apikey: cfg.anonKey, authorization: `Bearer ${had.access_token}` } }).catch(() => {});
    },

    // Her rows. Row level security decides what comes back; these only ask.
    async select(table: string, query: string) {
      return (await call(`/rest/v1/${table}?${query}`, { method: 'GET' })) ?? [];
    },
    async insert(table: string, row: Record<string, unknown>) {
      const out = await call(`/rest/v1/${table}`, { method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify(row) });
      return Array.isArray(out) ? out[0] : out;
    },
  };
}

export type CloudClient = ReturnType<typeof cloudClient>;
