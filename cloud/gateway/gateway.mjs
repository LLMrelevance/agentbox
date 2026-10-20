// THE CLOUD SERVER: CLOUD RUNS FOR PEOPLE WITH NO AWS ACCOUNT OF THEIR OWN.
//
// It stands between a Mac and our AWS account (docs/cloud/PLAN.md, "The
// cloud server"). The Mac's run code is unchanged: it still names its own
// sessions and objects, and this puts the person into every name before AWS
// sees it, counts each person's agents and hours against their plan, stops
// every machine it stops counting, and never hands a Mac a link to a sign-in.
//
// Everything AWS is passed in, so the same code runs in Lambda (lambda.mjs),
// in tests, and behind a plain HTTP server (gatewayServer).
import crypto from 'node:crypto';
import http from 'node:http';
import { PLANS, RUN_CEILING_MS, SIGNIN_CEILING_MS, SIGNINS_AT_ONCE, FREE_FLEET_CAP } from './plans.mjs';
import { LOGIN_NAME } from '../../shared/cloud-login-name.mjs';

const PERSON = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SESSION = /^[A-Za-z0-9_-]{1,180}$/;
const KEY = /^(runs|logins)\/([A-Za-z0-9._@+=-]+(?:\/[A-Za-z0-9._@+=-]+)*)$/;
const LINK_MAX_SECONDS = 12 * 60 * 60;
const LOGIN_LINK_SECONDS = 30 * 60;
// Lambda takes and gives at most 6 MB; past RELAY_BYTES a call or an answer
// goes through the person's own `runs/calls/` in the bucket instead.
const BODY_LIMIT = 6 * 1024 * 1024;
export const RELAY_BYTES = 4 * 1024 * 1024;
const RELAYED_CALL_LIMIT = 32 * 1024 * 1024;
const CALL_KEY = /^runs\/calls\/[A-Za-z0-9_-]{1,80}\.json$/;
const STARTS = { start: 'run', signin: 'signin', renew: 'signin', look: 'signin' };
// A run's id becomes a key segment (its done.json), so it is one.
const RUN_ID = /^[A-Za-z0-9._-]{1,120}$/;
// A done.json the S3 notice missed is looked for by the sweep, not sooner.
const DONE_LOOK_AFTER_MS = 2 * 60_000;
// A stop that fails this many sweeps running (an hour) is given up, and said.
const STOP_TRIES = 12;
const SWEEP_AT_ONCE = 8;

const month = (t) => new Date(t).toISOString().slice(0, 7);
const monthStart = (t) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };
const nextMonth = (t) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); };
/** [[month, seconds]] for the time from `from` to `to`, split at UTC month ends. */
function secondsByMonth(from, to) {
  const out = [];
  for (let a = from; a < to; a = nextMonth(a)) out.push([month(a), Math.round((Math.min(to, nextMonth(a)) - a) / 1000)]);
  return out;
}
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const bearer = (headers = {}) => /^Bearer (\S+)$/.exec(headers.authorization || headers.Authorization || '')?.[1] ?? null;
const ceilingOf = (s) => (s.kind === 'run' ? RUN_CEILING_MS : SIGNIN_CEILING_MS);
// The sandbox says a run failed in a `status` answer or a `state` event, and
// it is ended once the Mac has read its last page. "exited" is not the end:
// it is still saving the results, and done.json ends the run once it has.
const saysFailed = (answer) => !answer?.more && (answer?.state === 'failed' || (Array.isArray(answer?.events) && answer.events.some((e) => e?.kind === 'state' && e.state === 'failed')));
const notThere = (err) => err?.name === 'ResourceNotFoundException' || err?.$metadata?.httpStatusCode === 404;

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
    async head(k) { await null; const v = store.get(k); return v ? { size: Buffer.byteLength(v.body) } : null; },
    async put(k, body, { ifMatch, ifNoneMatch } = {}) {
      await null;
      const cur = store.get(k);
      if (ifNoneMatch === '*' && cur) throw conflict();
      if (ifMatch && cur?.etag !== ifMatch) throw conflict();
      n += 1;
      store.set(k, { body: String(body), etag: `e${n}` });
    },
    async del(k) { store.delete(k); },
    async list(prefix) { await null; return [...store.keys()].filter((k) => k.startsWith(prefix)); },
    dump: () => new Map([...store].map(([k, v]) => [k, v.body])),
  };
}

export function createGateway({ agentcore, links, removeObject, objects, whoIs, now = Date.now, plans = PLANS, freeFleetCap = FREE_FLEET_CAP, log = () => {} }) {
  const personKey = (person) => `ledger/people/${person}.json`;
  const deviceKey = (key) => `ledger/devices/${sha256(key)}.json`;
  const SWITCH = 'ledger/switch.json';
  const FLEET = 'ledger/fleet.json';
  const fresh = () => ({ plan: 'free', live: {}, used: {}, stopping: [], unrecorded: [] });
  const planOf = (rec) => plans[rec.plan] || plans.free;
  const readJson = async (key) => { const o = await objects.get(key); return o ? JSON.parse(o.body) : null; };
  const recOf = async (person) => ({ ...fresh(), ...(await readJson(personKey(person))) });

  const live = (rec, kind) => Object.values(rec.live).filter((s) => s.kind === kind);
  // A run going counts against this month only for its time in this month.
  const usedNow = (rec, t) => (rec.used[month(t)] || 0) + live(rec, 'run').reduce((sum, s) => sum + (t - Math.max(s.at, monthStart(t))) / 1000, 0);
  const overHours = (rec, t) => planOf(rec).hoursPerMonth != null && usedNow(rec, t) >= planOf(rec).hoursPerMonth * 3600;

  // Ending a session in the ledger: its time charged to each month it ran
  // in, and, in the same write, its stop and its record owed. `update` makes
  // both once the write has landed; the sweep makes whatever it could not.
  function end(rec, ctx, sid, at, why) {
    const s = rec.live[sid];
    delete rec.live[sid];
    const charged = s.kind === 'run' && why !== 'not-started';
    if (charged) for (const [m, secs] of secondsByMonth(s.at, at)) rec.used[m] = (rec.used[m] || 0) + secs;
    if (!stoppingOf(rec).some((e) => e.sid === sid)) rec.stopping = [...stoppingOf(rec), { sid, tries: 0 }];
    if (charged) {
      rec.unrecorded = [...(rec.unrecorded || []), {
        key: `ledger/runs/${ctx.person}/${month(at)}/${sid}-${s.at}.json`,
        sessionId: sid, runId: s.runId, startedAt: s.at, endedAt: at, seconds: Math.max(0, Math.round((at - s.at) / 1000)), why,
      }];
    }
    ctx.ended.push(sid);
  }
  // Whatever has outlived its ceiling ends at that ceiling; once the month's
  // hours are spent, every run ends.
  function settle(rec, ctx, t) {
    for (const [sid, s] of Object.entries(rec.live)) if (t - s.at >= ceilingOf(s)) end(rec, ctx, sid, s.at + ceilingOf(s), 'ceiling');
    if (overHours(rec, t)) for (const [sid, s] of Object.entries(rec.live)) if (s.kind === 'run') end(rec, ctx, sid, t, 'hours');
  }
  const needsSettling = (rec, t) => Object.values(rec.live).some((s) => t - s.at >= ceilingOf(s)) || (live(rec, 'run').length > 0 && overHours(rec, t));

  // Read, change and write one person's record; a write that lost a race
  // reads again, so two starts can never both take the last agent.
  async function update(person, change) {
    for (let i = 0; i < 8; i += 1) {
      const cur = await objects.get(personKey(person));
      const rec = { ...fresh(), ...(cur ? JSON.parse(cur.body) : {}) };
      const ctx = { ended: [], person };
      const out = change(rec, ctx);
      try {
        await objects.put(personKey(person), JSON.stringify(rec), cur ? { ifMatch: cur.etag } : { ifNoneMatch: '*' });
      } catch (err) {
        if (err?.conflict) continue;
        throw err;
      }
      if (ctx.ended.length) await settleOwed(person, rec, ctx.ended);
      return out;
    }
    throw new Error('the ledger kept changing under this write');
  }

  // Make the stops and write the records a write owed, then let go of the
  // ones made. `only` limits it to the sessions one write ended.
  async function settleOwed(person, rec, only = null) {
    const stops = stoppingOf(rec).filter((e) => !only || only.includes(e.sid));
    const records = (rec.unrecorded || []).filter((r) => !only || only.includes(r.sessionId));
    const written = new Set();
    for (const r of records) {
      const { key, ...record } = r;
      try { await objects.put(key, JSON.stringify(record)); written.add(key); } catch (err) { log(`no record of ${r.sessionId} yet: ${err?.message || err}`); }
    }
    const stopped = new Set();
    for (const e of stops) if (await stopSession(person, e.sid)) stopped.add(e.sid);
    if (!written.size && !stopped.size) return { stops, stopped };
    await update(person, (r) => {
      r.stopping = stoppingOf(r).filter((e) => !stopped.has(e.sid));
      r.unrecorded = (r.unrecorded || []).filter((x) => !written.has(x.key));
    });
    return { stops, stopped };
  }
  // Older records kept bare session names.
  const stoppingOf = (rec) => (rec.stopping || []).map((e) => (typeof e === 'string' ? { sid: e, tries: 0 } : e));
  async function owedStop(person, sid) {
    if (await stopSession(person, sid)) return;
    await update(person, (rec) => { if (!stoppingOf(rec).some((e) => e.sid === sid)) rec.stopping = [...stoppingOf(rec), { sid, tries: 0 }]; });
  }

  // A session AWS says is not there is as stopped as it gets.
  async function stopSession(person, sid) {
    try { await agentcore.stop(`u-${person}-${sid}`); return true; } catch (err) {
      if (notThere(err)) return true;
      log(`could not stop ${sid}: ${err?.message || err}`);
      return false;
    }
  }

  function summary(rec, t) {
    const plan = planOf(rec);
    return { plan: plans[rec.plan] ? rec.plan : 'free', agents: plan.agents, hoursPerMonth: plan.hoursPerMonth, running: live(rec, 'run').length, usedSeconds: rec.used[month(t)] || 0, month: month(t) };
  }

  // Take a place for a session that is starting, or say why there is none.
  function reserve(rec, ctx, sid, kind, runId, t, { paused, freeRunning }) {
    settle(rec, ctx, t);
    const was = rec.live[sid];
    // The same start asked again, because its answer was lost, is the same
    // place. Anything else on a live session would run on that place: a run
    // on a sign-in's, which counts nothing, or a second run on a first's.
    if (was) return was.kind === kind && was.runId === (runId ?? null) ? { ok: true, nonce: was.nonce } : { ok: false, error: 'busy', message: 'this session is running something else' };
    // A stop still owed to this session would land on whatever started here next.
    if (stoppingOf(rec).some((e) => e.sid === sid)) return { ok: false, error: 'busy', message: 'this session is still being stopped' };
    if (kind === 'run') {
      const plan = planOf(rec);
      if (paused) return { ok: false, error: 'paused', message: 'The cloud is not starting new runs right now.' };
      if (overHours(rec, t)) return { ok: false, error: 'hours', message: `This month's ${plan.hoursPerMonth} cloud hours are used.` };
      if (live(rec, 'run').length >= plan.agents) return { ok: false, error: 'agents', message: `All ${plan.agents} of your cloud agents are running.` };
      if ((rec.plan || 'free') === 'free' && freeRunning >= freeFleetCap) return { ok: false, error: 'full', message: 'The free cloud is full right now.' };
    } else if (live(rec, 'signin').length >= SIGNINS_AT_ONCE) {
      return { ok: false, error: 'signins', message: `${SIGNINS_AT_ONCE} sign-ins are already waiting.` };
    }
    const nonce = crypto.randomUUID();
    rec.live[sid] = { kind, runId: typeof runId === 'string' ? runId : null, at: t, nonce };
    return { ok: true, nonce, fresh: true };
  }

  async function loginLink(person, value, op) {
    const key = typeof value === 'string' && value.startsWith(LOGIN_NAME) ? value.slice(LOGIN_NAME.length) : null;
    const scoped = key?.startsWith('logins/') ? scopedKey(person, key) : null;
    if (!scoped) throw bad('a sign-in is named, never linked');
    return links[op](scoped, LOGIN_LINK_SECONDS);
  }

  // A call bigger than Lambda takes was put in the person's own calls; read it once.
  async function relayedCall(person, payloadKey) {
    const scoped = typeof payloadKey === 'string' && CALL_KEY.test(payloadKey) ? scopedKey(person, payloadKey) : null;
    const size = scoped ? await objects.head(scoped) : null;
    if (!size) throw bad('no such call');
    if (size.size > RELAYED_CALL_LIMIT) { await objects.del(scoped).catch(() => {}); throw new Refusal(413, 'too-large', 'that call is too large'); }
    const found = await objects.get(scoped);
    await objects.del(scoped).catch(() => {});
    try { return JSON.parse(found.body); } catch { throw bad('the call is not JSON'); }
  }

  // An answer bigger than Lambda gives goes the same way back.
  async function relayAnswer(person, answer) {
    const text = JSON.stringify(answer);
    if (Buffer.byteLength(text) <= RELAY_BYTES) return answer;
    const key = `runs/calls/${crypto.randomUUID()}.json`;
    const scoped = scopedKey(person, key);
    await objects.put(scoped, text);
    return { relayed: { key, url: await links.get(scoped, 15 * 60) } };
  }

  async function invoke(person, data) {
    const { sessionId } = data;
    if (typeof sessionId !== 'string' || !SESSION.test(sessionId)) throw bad('the session name is not plain letters, digits and dashes');
    const payload = data.payloadKey !== undefined ? await relayedCall(person, data.payloadKey) : data.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw bad('no payload');
    const sent = { ...payload };
    if (sent.login && typeof sent.login === 'object') sent.login = { ...sent.login, url: await loginLink(person, sent.login.url, 'get') };
    if ('loginUrl' in sent) sent.loginUrl = await loginLink(person, sent.loginUrl, 'get');
    if ('saveUrl' in sent) sent.saveUrl = await loginLink(person, sent.saveUrl, 'put');
    const kind = Object.hasOwn(STARTS, sent.action) ? STARTS[sent.action] : null;
    if (kind && (typeof sent.runId !== 'string' || !RUN_ID.test(sent.runId))) throw bad('a run\'s id is plain letters, digits, dots and dashes');
    let nonce;
    let freshPlace = false;
    if (kind) {
      const [sw, fleet] = kind === 'run' ? await Promise.all([readJson(SWITCH), readJson(FLEET)]) : [null, null];
      const verdict = await update(person, (rec, ctx) => reserve(rec, ctx, sessionId, kind, sent.runId, now(), { paused: !!sw?.paused, freeRunning: fleet?.freeRunning || 0 }));
      if (!verdict.ok) return verdict;
      ({ nonce } = verdict);
      freshPlace = !!verdict.fresh;
    } else {
      // AgentCore makes a machine for any session it is asked about, so only
      // a session this person started, and has not ended, is asked.
      const rec = await recOf(person);
      const t = now();
      if (needsSettling(rec, t)) await update(person, (r, ctx) => settle(r, ctx, t));
      const s = (needsSettling(rec, t) ? await recOf(person) : rec).live[sessionId];
      if (!s) return { ok: false, error: 'no-run' };
      ({ nonce } = s);
    }
    let endedHere = false;
    const endIf = async (why) => {
      endedHere = await update(person, (rec, ctx) => {
        if (rec.live[sessionId]?.nonce !== nonce) return false;
        end(rec, ctx, sessionId, now(), why);
        return true;
      });
    };
    let answer;
    try {
      answer = await agentcore.invoke(`u-${person}-${sessionId}`, sent);
    } catch (err) {
      if (freshPlace) await endIf('not-started');
      throw new Refusal(502, 'cloud', `the cloud did not answer: ${err?.message || err}`);
    }
    if (freshPlace && answer?.ok === false) await endIf('not-started');
    else if (saysFailed(answer)) await endIf('failed');
    // Asking a session makes it exist. One that a stop or a finish ended
    // while this call was on its way is stopped again, now that it is there.
    if (!endedHere && (await recOf(person)).live[sessionId]?.nonce !== nonce) await owedStop(person, sessionId);
    return relayAnswer(person, answer);
  }

  async function stop(person, { sessionId }) {
    if (typeof sessionId !== 'string' || !SESSION.test(sessionId)) throw bad('the session name is not plain letters, digits and dashes');
    const was = await update(person, (rec, ctx) => {
      const t = now();
      settle(rec, ctx, t);
      if (!rec.live[sessionId]) return false;
      end(rec, ctx, sessionId, t, 'stopped');
      return true;
    });
    // Ending it in the ledger stopped it; one the ledger had already let go is stopped all the same.
    if (!was) await stopSession(person, sessionId);
    return { ok: true };
  }

  async function link(person, { op, key, seconds }) {
    if (!['get', 'put', 'head'].includes(op)) throw bad('op is get, put or head');
    const scoped = scopedKey(person, key);
    if (!scoped) throw bad('a key is a run\'s or a sign-in\'s, inside your own space');
    // A sign-in is written only by the sandbox, on a link the server makes.
    if (op !== 'head' && key.startsWith('logins/')) throw new Refusal(403, 'not-yours-to-touch', 'a sign-in is never read or written from a Mac');
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
    const person = who.id.toLowerCase();
    if ((await recOf(person)).disabled) throw new Refusal(403, 'disabled', 'this account cannot use the cloud');
    const key = `abk_${crypto.randomBytes(32).toString('base64url')}`;
    await objects.put(deviceKey(key), JSON.stringify({ person, name: String(body.name || '').slice(0, 80), at: now() }), { ifNoneMatch: '*' });
    log(`a cloud key for ${person}`);
    return { key };
  }

  async function personOf(headers) {
    const key = bearer(headers);
    const found = key?.startsWith('abk_') ? await objects.get(deviceKey(key)) : null;
    if (!found) throw new Refusal(401, 'signed-out', 'this cloud key is not known; sign in again');
    const { person } = JSON.parse(found.body);
    if ((await recOf(person)).disabled) throw new Refusal(403, 'disabled', 'this account cannot use the cloud');
    return { person, key };
  }

  async function handle({ method, path, headers = {}, body = '' }) {
    try {
      let data = {};
      if (body) {
        if (Buffer.byteLength(body) > BODY_LIMIT) throw new Refusal(413, 'too-large', `a call over ${RELAY_BYTES} bytes goes through the bucket`);
        try { data = JSON.parse(body); } catch { throw bad('the body is not JSON'); }
        if (!data || typeof data !== 'object') throw bad('the body is not an object');
      }
      if (method === 'POST' && path === '/v1/devices') return { status: 200, body: await newDevice(headers, data) };
      const { person, key } = await personOf(headers);
      const route = `${method} ${path}`;
      if (route === 'DELETE /v1/devices') { await objects.del(deviceKey(key)); return { status: 200, body: { ok: true } }; }
      if (route === 'GET /v1/me') return { status: 200, body: await update(person, (rec, ctx) => { settle(rec, ctx, now()); return summary(rec, now()); }) };
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
    await update(m[1], (rec, ctx) => {
      const t = now();
      settle(rec, ctx, t);
      for (const [sid, s] of Object.entries(rec.live)) if (s.kind === 'run' && s.runId === m[2]) end(rec, ctx, sid, t, 'done');
    });
  }

  // On a clock, whoever is calling or not: ceilings, spent hours, a done.json
  // whose notice was missed, stops AWS did not take, and the free fleet's size.
  async function sweepOne(person, t, before) {
    const owedBefore = stoppingOf(before);
    // Nothing going and nothing owed: read, not written.
    if (!Object.keys(before.live).length && !owedBefore.length && !(before.unrecorded || []).length) return before;
    const finished = new Set();
    for (const s of live(before, 'run')) {
      if (!s.runId || !RUN_ID.test(s.runId) || t - s.at < DONE_LOOK_AFTER_MS) continue;
      const there = await objects.head(`runs/u-${person}/${s.runId}/done.json`).catch(() => null);
      if (there) finished.add(s.runId);
    }
    const rec = await update(person, (r, ctx) => {
      settle(r, ctx, t);
      for (const [sid, s] of Object.entries(r.live)) if (s.kind === 'run' && finished.has(s.runId)) end(r, ctx, sid, t, 'done');
      return r;
    });
    // Everything still owed, from this sweep or before it, is tried again; a
    // stop owed since an earlier sweep that fails again counts a try.
    await settleOwed(person, await recOf(person));
    if (owedBefore.length) {
      await update(person, (r) => {
        r.stopping = stoppingOf(r).flatMap((e) => {
          if (!owedBefore.some((x) => x.sid === e.sid)) return [e];
          if (e.tries + 1 >= STOP_TRIES) { log(`gave up stopping ${person} ${e.sid} after ${STOP_TRIES} sweeps`); return []; }
          return [{ sid: e.sid, tries: e.tries + 1 }];
        });
      });
    }
    return rec;
  }

  // One person who cannot be swept is said and passed; the rest still are,
  // and the free fleet still counts the runs last seen on them.
  async function sweep() {
    const t = now();
    let freeRunning = 0;
    const count = (rec) => { if ((rec.plan || 'free') === 'free') freeRunning += live(rec, 'run').length; };
    const people = (await objects.list('ledger/people/')).map((k) => k.slice('ledger/people/'.length, -'.json'.length)).filter((p) => PERSON.test(p));
    for (let i = 0; i < people.length; i += SWEEP_AT_ONCE) {
      await Promise.all(people.slice(i, i + SWEEP_AT_ONCE).map(async (person) => {
        let before = null;
        try {
          before = await recOf(person);
          count(await sweepOne(person, t, before));
        } catch (err) {
          log(`could not sweep ${person}: ${err?.message || err}`);
          if (before) count(before);
        }
      }));
    }
    await objects.put(FLEET, JSON.stringify({ freeRunning, at: t }));
    return { freeRunning };
  }

  // What the owner does by hand (scripts/cloud-gateway-admin.mjs), and Stripe later.
  async function admin({ do: what, person, plan }) {
    if (what === 'pause' || what === 'resume') { await objects.put(SWITCH, JSON.stringify({ paused: what === 'pause', at: now() })); return { ok: true }; }
    if (!PERSON.test(person || '')) throw new Error(`no such person: ${person}`);
    if (what === 'plan') {
      if (!Object.hasOwn(plans, plan)) throw new Error(`no such plan: ${plan}`);
      if (plans[plan].hoursPerMonth == null) throw new Error(`the ${plan} plan has no hours set yet (cloud/gateway/plans.mjs)`);
      await update(person, (rec) => { rec.plan = plan; });
    } else if (what === 'disable') {
      await update(person, (rec, ctx) => {
        rec.disabled = true;
        for (const sid of Object.keys(rec.live)) end(rec, ctx, sid, now(), 'disabled');
      });
    } else if (what === 'enable') {
      await update(person, (rec) => { delete rec.disabled; });
    } else {
      throw new Error(`no such thing to do: ${what}`);
    }
    return { ok: true };
  }

  return { handle, objectCreated, sweep, admin };
}

/** The server over plain HTTP, for tests and for running it on one machine. */
export function gatewayServer(gw) {
  return http.createServer((req, res) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size <= BODY_LIMIT) chunks.push(c); });
    req.on('end', async () => {
      // As Lambda does: a body over its limit never reaches the function.
      const out = size > BODY_LIMIT ? { status: 413, body: { error: 'too-large' } } : await gw.handle({ method: req.method, path: new URL(req.url, 'http://x').pathname, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
      res.writeHead(out.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(out.body));
    });
  });
}
