// THE CLOUD SERVER: CLOUD RUNS FOR PEOPLE WITH NO AWS ACCOUNT OF THEIR OWN.
//
// It stands between a Mac and our AWS account (docs/cloud/PLAN.md, "The
// cloud server"). The Mac's run code is unchanged: it still names its own
// sessions and objects, and this puts the person into every name before AWS
// sees it, counts each person's agents and hours against their plan, and
// never hands a Mac a link that reads a sign-in.
//
// Everything AWS is passed in, so the same code runs in Lambda (lambda.mjs),
// in tests, and behind a plain HTTP server (gatewayServer).
import crypto from 'node:crypto';
import http from 'node:http';
import { PLANS, RUN_CEILING_MS, SIGNIN_CEILING_MS, SIGNINS_AT_ONCE } from './plans.mjs';
import { LOGIN_NAME } from '../../shared/cloud-login-name.mjs';

const PERSON = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION = /^[A-Za-z0-9_-]{1,180}$/;
const KEY = /^(runs|logins)\/([A-Za-z0-9._@+=-]+(?:\/[A-Za-z0-9._@+=-]+)*)$/;
const LINK_MAX_SECONDS = 12 * 60 * 60;
const LOGIN_LINK_SECONDS = 30 * 60;
const BODY_LIMIT = 6 * 1024 * 1024;

const month = (t) => new Date(t).toISOString().slice(0, 7);
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const bearer = (headers = {}) => /^Bearer (\S+)$/.exec(headers.authorization || headers.Authorization || '')?.[1] ?? null;

class Refusal extends Error {
  constructor(status, error, message) { super(message); this.status = status; this.error = error; }
}
const bad = (message) => new Refusal(400, 'bad-request', message);

/** `runs/x` as the person's own `runs/u-<person>/x`; null for anything else. */
export function scopedKey(person, key) {
  const m = typeof key === 'string' ? KEY.exec(key) : null;
  if (!m || m[2].split('/').some((s) => s === '.' || s === '..')) return null;
  return `${m[1]}/u-${person}/${m[2]}`;
}

/** Objects with S3's conditional writes, in memory, for tests and local runs. */
export function memoryObjects() {
  const store = new Map();
  let n = 0;
  const conflict = () => Object.assign(new Error('changed meanwhile'), { conflict: true });
  return {
    async get(k) { await null; const v = store.get(k); return v ? { body: v.body, etag: v.etag } : null; },
    async put(k, body, { ifMatch, ifNoneMatch } = {}) {
      await null;
      const cur = store.get(k);
      if (ifNoneMatch === '*' && cur) throw conflict();
      if (ifMatch && cur?.etag !== ifMatch) throw conflict();
      n += 1;
      store.set(k, { body: String(body), etag: `e${n}` });
    },
    async del(k) { store.delete(k); },
    dump: () => new Map([...store].map(([k, v]) => [k, v.body])),
  };
}

export function createGateway({ agentcore, links, removeObject, objects, whoIs, now = Date.now, plans = PLANS, log = () => {} }) {
  const personKey = (person) => `ledger/people/${person}.json`;
  const deviceKey = (key) => `ledger/devices/${sha256(key)}.json`;
  const fresh = () => ({ plan: 'free', live: {}, used: {} });
  const planOf = (rec) => plans[rec.plan] || plans.free;

  const end = (rec, sid, at) => {
    const s = rec.live[sid];
    delete rec.live[sid];
    if (s.kind === 'run') rec.used[month(at)] = (rec.used[month(at)] || 0) + Math.max(0, Math.round((at - s.at) / 1000));
  };
  // Whatever outlived AgentCore's own ceiling has ended, at that ceiling.
  const settle = (rec, t) => {
    for (const [sid, s] of Object.entries(rec.live)) {
      const ceiling = s.kind === 'run' ? RUN_CEILING_MS : SIGNIN_CEILING_MS;
      if (t - s.at >= ceiling) end(rec, sid, s.at + ceiling);
    }
  };
  const live = (rec, kind) => Object.values(rec.live).filter((s) => s.kind === kind);
  const usedNow = (rec, t) => (rec.used[month(t)] || 0) + live(rec, 'run').reduce((sum, s) => sum + (t - s.at) / 1000, 0);

  // Read, change and write one person's record; a write that lost a race
  // reads again, so two starts can never both take the last agent.
  async function update(person, change) {
    for (let i = 0; i < 8; i += 1) {
      const cur = await objects.get(personKey(person));
      const rec = cur ? JSON.parse(cur.body) : fresh();
      const out = change(rec);
      try {
        await objects.put(personKey(person), JSON.stringify(rec), cur ? { ifMatch: cur.etag } : { ifNoneMatch: '*' });
        return out;
      } catch (err) {
        if (!err?.conflict) throw err;
      }
    }
    throw new Error('the ledger kept changing under this write');
  }
  async function read(person) {
    const cur = await objects.get(personKey(person));
    const rec = cur ? JSON.parse(cur.body) : fresh();
    settle(rec, now());
    return rec;
  }

  function summary(rec, t) {
    const plan = planOf(rec);
    return { plan: plans[rec.plan] ? rec.plan : 'free', agents: plan.agents, hoursPerMonth: plan.hoursPerMonth, running: live(rec, 'run').length, usedSeconds: rec.used[month(t)] || 0, month: month(t) };
  }

  // Take a place for a session that is starting, or say why there is none.
  function reserve(rec, sid, kind, runId, t) {
    settle(rec, t);
    if (rec.live[sid]) return { ok: true, again: true };
    if (kind === 'run') {
      const plan = planOf(rec);
      if (plan.hoursPerMonth != null && usedNow(rec, t) >= plan.hoursPerMonth * 3600) {
        return { ok: false, error: 'hours', message: `This month's ${plan.hoursPerMonth} cloud hours are used.` };
      }
      if (live(rec, 'run').length >= plan.agents) {
        return { ok: false, error: 'agents', message: `All ${plan.agents} of your cloud agents are running.` };
      }
    } else if (live(rec, 'signin').length >= SIGNINS_AT_ONCE) {
      return { ok: false, error: 'signins', message: `${SIGNINS_AT_ONCE} sign-ins are already waiting.` };
    }
    rec.live[sid] = { kind, runId: typeof runId === 'string' ? runId : null, at: t };
    return { ok: true };
  }

  async function loginLink(person, value) {
    const key = typeof value === 'string' && value.startsWith(LOGIN_NAME) ? value.slice(LOGIN_NAME.length) : null;
    const scoped = key?.startsWith('logins/') ? scopedKey(person, key) : null;
    if (!scoped) throw bad('a sign-in is named, never linked');
    return links.get(scoped, LOGIN_LINK_SECONDS);
  }

  async function invoke(person, { sessionId, payload }) {
    if (typeof sessionId !== 'string' || !SESSION.test(sessionId)) throw bad('the session name is not plain letters, digits and dashes');
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw bad('no payload');
    const sent = { ...payload };
    if (sent.login && typeof sent.login === 'object') sent.login = { ...sent.login, url: await loginLink(person, sent.login.url) };
    if ('loginUrl' in sent) sent.loginUrl = await loginLink(person, sent.loginUrl);
    const kind = sent.action === 'start' ? 'run' : ['signin', 'renew', 'look'].includes(sent.action) ? 'signin' : null;
    let verdict = null;
    if (kind) {
      verdict = await update(person, (rec) => reserve(rec, sessionId, kind, sent.runId, now()));
      if (!verdict.ok) return verdict;
    }
    // A start that did not start gives its place back, uncharged.
    const release = () => (kind && !verdict.again ? update(person, (rec) => { delete rec.live[sessionId]; }) : null);
    let answer;
    try {
      answer = await agentcore.invoke(`u-${person}-${sessionId}`, sent);
    } catch (err) {
      await release();
      throw new Refusal(502, 'cloud', `the cloud did not answer: ${err?.message || err}`);
    }
    if (answer?.ok === false) await release();
    return answer;
  }

  async function stop(person, { sessionId }) {
    if (typeof sessionId !== 'string' || !SESSION.test(sessionId)) throw bad('the session name is not plain letters, digits and dashes');
    await agentcore.stop(`u-${person}-${sessionId}`);
    await update(person, (rec) => {
      const t = now();
      settle(rec, t);
      if (rec.live[sessionId]) end(rec, sessionId, t);
    });
    return { ok: true };
  }

  async function link(person, { op, key, seconds }) {
    if (!['get', 'put', 'head'].includes(op)) throw bad('op is get, put or head');
    const scoped = scopedKey(person, key);
    if (!scoped) throw bad('a key is a run\'s or a sign-in\'s, inside your own space');
    if (op === 'get' && key.startsWith('logins/')) throw new Refusal(403, 'not-readable', 'a sign-in is never read from a Mac');
    const s = Math.min(LINK_MAX_SECONDS, Math.max(60, Number(seconds) || LINK_MAX_SECONDS));
    return { url: await links[op](scoped, s) };
  }

  async function remove(person, { key }) {
    const scoped = scopedKey(person, key);
    if (!scoped) throw bad('a key is a run\'s or a sign-in\'s, inside your own space');
    await removeObject(scoped);
    return { ok: true };
  }

  async function newDevice(headers, body) {
    const token = bearer(headers);
    const who = token ? await Promise.resolve(whoIs(token)).catch(() => null) : null;
    if (!who || !PERSON.test(who.id || '')) throw new Refusal(401, 'signed-out', 'sign in again');
    const key = `abk_${crypto.randomBytes(32).toString('base64url')}`;
    await objects.put(deviceKey(key), JSON.stringify({ person: who.id.toLowerCase(), name: String(body.name || '').slice(0, 80), at: now() }), { ifNoneMatch: '*' });
    log(`a cloud key for ${who.id}`);
    return { key };
  }

  async function personOf(headers) {
    const key = bearer(headers);
    const found = key?.startsWith('abk_') ? await objects.get(deviceKey(key)) : null;
    if (!found) throw new Refusal(401, 'signed-out', 'this cloud key is not known; sign in again');
    return { person: JSON.parse(found.body).person, key };
  }

  async function handle({ method, path, headers = {}, body = '' }) {
    try {
      let data = {};
      if (body) {
        if (body.length > BODY_LIMIT) throw bad('too large');
        try { data = JSON.parse(body); } catch { throw bad('the body is not JSON'); }
        if (!data || typeof data !== 'object') throw bad('the body is not an object');
      }
      if (method === 'POST' && path === '/v1/devices') return { status: 200, body: await newDevice(headers, data) };
      const { person, key } = await personOf(headers);
      const route = `${method} ${path}`;
      if (route === 'DELETE /v1/devices') { await objects.del(deviceKey(key)); return { status: 200, body: { ok: true } }; }
      if (route === 'GET /v1/me') return { status: 200, body: summary(await read(person), now()) };
      if (route === 'POST /v1/invoke') return { status: 200, body: await invoke(person, data) };
      if (route === 'POST /v1/stop') return { status: 200, body: await stop(person, data) };
      if (route === 'POST /v1/link') return { status: 200, body: await link(person, data) };
      if (route === 'POST /v1/delete') return { status: 200, body: await remove(person, data) };
      return { status: 404, body: { error: 'not-found' } };
    } catch (err) {
      if (err instanceof Refusal) return { status: err.status, body: { error: err.error, message: err.message } };
      log(`cloud server: ${err?.stack || err}`);
      return { status: 500, body: { error: 'server', message: 'the cloud server failed; try again' } };
    }
  }

  // An object landed in the bucket. A run's done.json is the run's end.
  async function objectCreated(key) {
    const m = /^runs\/u-([0-9a-f-]{36})\/([^/]+)\/done\.json$/.exec(key);
    if (!m || !PERSON.test(m[1]) || !(await objects.get(personKey(m[1])))) return;
    await update(m[1], (rec) => {
      const t = now();
      settle(rec, t);
      for (const [sid, s] of Object.entries(rec.live)) if (s.kind === 'run' && s.runId === m[2]) end(rec, sid, t);
    });
  }

  async function setPlan(person, plan) {
    if (!PERSON.test(person || '')) throw new Error(`no such person: ${person}`);
    if (!Object.hasOwn(plans, plan)) throw new Error(`no such plan: ${plan}`);
    await update(person, (rec) => { rec.plan = plan; });
  }

  return { handle, objectCreated, setPlan };
}

/** The server over plain HTTP, for tests and for running it on one machine. */
export function gatewayServer(gw) {
  return http.createServer((req, res) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size <= BODY_LIMIT) chunks.push(c); });
    req.on('end', async () => {
      const out = await gw.handle({ method: req.method, path: new URL(req.url, 'http://x').pathname, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
      res.writeHead(out.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(out.body));
    });
  });
}
