// THE CLOUD SERVER HOLDS EACH PERSON TO THEIR PLAN.
//
// The cloud is sold as extra agents running at once, with a monthly hour
// limit behind each plan, and a free 5 hours (docs/cloud/PLAN.md, Plans). In
// the owner's own AWS account nothing needed holding: the bill was hers.
// Once strangers run in our account (w-6633e825a7), every machine they start
// is ours to pay for, and a free machine with root and a network is what
// people mine on. So the server, not the Mac, counts: how many agents are
// running, how long each ran, and when a run has ended. The Mac chooses where
// a run reports its end, so a run that never reports one is charged the
// whole 8 hours AgentCore allows it, never nothing.
import { describe, it, expect } from 'vitest';
import { createGateway, memoryObjects } from '../cloud/gateway/gateway.mjs';
import { PLANS } from '../cloud/gateway/plans.mjs';

const A = '11111111-1111-4111-8111-111111111111';
const HOUR = 60 * 60_000;

function setup({ startAnswer = { ok: true } } = {}) {
  let clock = Date.UTC(2026, 9, 19, 12, 0, 0);
  const sent = [];
  const objects = memoryObjects();
  const gw = createGateway({
    agentcore: {
      async invoke(sessionId, payload) {
        sent.push({ sessionId, payload });
        if (payload.action === 'start' && startAnswer instanceof Error) throw startAnswer;
        return payload.action === 'start' ? startAnswer : { ok: true };
      },
      async stop(sessionId) { sent.push({ sessionId, stop: true }); },
    },
    links: { get: async (k) => `https://b/${k}`, put: async (k) => `https://b/${k}`, head: async (k) => `https://b/${k}` },
    removeObject: async () => {},
    objects,
    whoIs: async (t) => (t === 'session-of-a' ? { id: A } : null),
    now: () => clock,
  });
  let key;
  const call = async (method, path, body) => {
    key ??= (await gw.handle({ method: 'POST', path: '/v1/devices', headers: { authorization: 'Bearer session-of-a' }, body: '{}' })).body.key;
    return gw.handle({ method, path, headers: { authorization: `Bearer ${key}` }, body: body ? JSON.stringify(body) : '' });
  };
  const start = (n, extra = {}) => call('POST', '/v1/invoke', { sessionId: `run-${n}`, payload: { action: 'start', runId: `r${n}`, ...extra } });
  const signin = (n) => call('POST', '/v1/invoke', { sessionId: `agentbox-signin-claude-s${n}`, payload: { action: 'signin', runId: `s${n}`, engine: 'claude', saveUrl: 'x' } });
  const finish = (n) => gw.objectCreated(`runs/u-${A}/r${n}/done.json`);
  const me = async () => (await call('GET', '/v1/me')).body;
  return { gw, objects, sent, call, start, signin, finish, me, tick: (ms) => { clock += ms; } };
}

describe('agents running at once', () => {
  it('free runs its agents up to its number and refuses the next, saying why', async () => {
    const { start, sent } = setup();
    const n = PLANS.free.agents;
    for (let i = 1; i <= n; i += 1) expect((await start(i)).body.ok).toBe(true);
    const over = await start(n + 1);
    expect(over.status).toBe(200);
    expect(over.body).toMatchObject({ ok: false, error: 'agents' });
    expect(over.body.message).toMatch(new RegExp(`${n}`));
    expect(sent.filter((s) => s.payload?.action === 'start')).toHaveLength(n);
  });

  it('a start asked again, because its answer was lost, is one agent, not two', async () => {
    const { start, me } = setup();
    await start(1); await start(1); await start(1);
    expect((await me()).running).toBe(1);
  });

  it('a run whose done.json lands frees its place and is charged the time it ran', async () => {
    const { start, finish, me, tick } = setup();
    for (let i = 1; i <= PLANS.free.agents; i += 1) await start(i);
    tick(30 * 60_000);
    await finish(1);
    const now = await me();
    expect(now.running).toBe(PLANS.free.agents - 1);
    expect(now.usedSeconds).toBe(30 * 60);
    expect((await start(9)).body.ok).toBe(true);
  });

  it('a done.json for a run the person never started, or in someone else\'s space, changes nothing', async () => {
    const { gw, start, me } = setup();
    await start(1);
    await gw.objectCreated(`runs/u-${A}/r-unknown/done.json`);
    await gw.objectCreated('runs/u-22222222-2222-4222-8222-222222222222/r1/done.json');
    await gw.objectCreated(`runs/u-${A}/r1/events.jsonl`);
    expect((await me()).running).toBe(1);
  });

  it('stopping a run ends it and charges it', async () => {
    const { call, start, me, tick, sent } = setup();
    await start(1);
    tick(10 * 60_000);
    await call('POST', '/v1/stop', { sessionId: 'run-1' });
    expect(sent.at(-1)).toEqual({ sessionId: `u-${A}-run-1`, stop: true });
    expect(await me()).toMatchObject({ running: 0, usedSeconds: 600 });
  });

  it('a run nothing ended is ended at 8 hours and charged all 8', async () => {
    const { start, me, tick } = setup();
    await start(1);
    tick(8 * HOUR - 1000);
    expect((await me()).running).toBe(1);
    tick(2 * HOUR);
    expect(await me()).toMatchObject({ running: 0, usedSeconds: 8 * 3600 });
  });

  // Review, 2026-10-20: the Mac holds a link that writes its run's done.json,
  // so a run could be marked ended while its machine kept going, unmetered.
  // Whatever ends a run's metering now ends its machine too.
  it('every way a run ends also stops its machine', async () => {
    const { start, finish, signin, tick, me, sent } = setup();
    const stopped = () => sent.filter((s) => s.stop).map((s) => s.sessionId);
    await start(1);
    await finish(1);
    expect(stopped()).toEqual([`u-${A}-run-1`]);
    await start(2);
    await signin(1);
    tick(21 * 60_000);
    await me();
    expect(stopped()).toContain(`u-${A}-agentbox-signin-claude-s1`);
    tick(8 * HOUR);
    await me();
    expect(stopped()).toContain(`u-${A}-run-2`);
  });

  it('a start the sandbox refused, or that failed, takes no place and costs nothing', async () => {
    for (const answer of [{ ok: false, error: 'busy' }, new Error('network')]) {
      const { start, me } = setup({ startAnswer: answer });
      await start(1).catch(() => {});
      expect(await me()).toMatchObject({ running: 0, usedSeconds: 0 });
    }
  });

  it('a paid plan runs its own number', async () => {
    const { gw, start } = setup();
    await gw.setPlan(A, 'pro');
    for (let i = 1; i <= PLANS.pro.agents; i += 1) expect((await start(i)).body.ok, `run ${i}`).toBe(true);
    expect((await start(PLANS.pro.agents + 1)).body.error).toBe('agents');
  });

  it('an unknown plan name is refused rather than given anything', async () => {
    const { gw } = setup();
    await expect(gw.setPlan(A, 'unlimited')).rejects.toThrow(/plan/);
  });

  it('two starts racing for the last place: one wins, the other is refused', async () => {
    const { start, me } = setup();
    for (let i = 1; i < PLANS.free.agents; i += 1) await start(i);
    const [x, y] = await Promise.all([start(50), start(51)]);
    expect([x.body.ok, y.body.ok].sort()).toEqual([false, true]);
    expect((await me()).running).toBe(PLANS.free.agents);
  });
});

describe('hours in a month', () => {
  it('free stops at its hours: just under, a run starts; at the limit, it is refused', async () => {
    const { start, finish, tick } = setup();
    const limit = PLANS.free.hoursPerMonth * 3600;
    await start(1);
    tick((limit - 60) * 1000);
    await finish(1);
    expect((await start(2)).body.ok).toBe(true);
    tick(60 * 1000);
    await finish(2);
    const refused = await start(3);
    expect(refused.body).toMatchObject({ ok: false, error: 'hours' });
  });

  it('time a run is still running counts against the hours', async () => {
    const { start, tick } = setup();
    await start(1);
    tick(PLANS.free.hoursPerMonth * HOUR);
    expect((await start(2)).body.error).toBe('hours');
  });

  it('a new month starts again from nothing', async () => {
    const { start, finish, tick, me } = setup();
    await start(1);
    tick(PLANS.free.hoursPerMonth * HOUR);
    await finish(1);
    tick(14 * 24 * HOUR);
    expect((await me()).usedSeconds).toBe(0);
    expect((await start(2)).body.ok).toBe(true);
  });
});

describe('signing in', () => {
  it('takes no agent and no hours, three at once at most, each ended after 20 minutes', async () => {
    const { start, signin, tick, me } = setup();
    for (let i = 1; i <= PLANS.free.agents; i += 1) await start(i);
    for (let i = 1; i <= 3; i += 1) expect((await signin(i)).body.ok).toBe(true);
    expect((await signin(4)).body.error).toBe('signins');
    tick(21 * 60_000);
    expect((await signin(5)).body.ok).toBe(true);
    expect((await me()).usedSeconds).toBe(0);
  });
});

describe('what the person is told', () => {
  it('names the plan, its agents and hours, and what is used', async () => {
    const { start, me } = setup();
    await start(1);
    expect(await me()).toEqual({ plan: 'free', agents: PLANS.free.agents, hoursPerMonth: PLANS.free.hoursPerMonth, running: 1, usedSeconds: 0, month: '2026-10' });
  });
});
