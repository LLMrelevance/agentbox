// On 26 Oct one of your threads handed a daily clip lane to the Growth
// marketer and the Video producer, one minute apart. In under two hours that
// became 19 threads, 8 of the Growth marketer's and 11 of the Video
// producer's, counted off the store by their teammate labels. Every @mention
// from one to the other opened a new thread, a pass sent with an @mention
// opened two at once, and two runs of the Video producer rendered the same
// clip side by side. Two threads in Needs you asked you to pick between
// different posts about the same number.
//
// Now a teammate's words about work the other teammate already has a thread
// on go to that thread. They wait while it runs, are read on its next turn,
// and open a new thread only when that one is finished.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mjs';
import { loadStore } from '../main/store-modules.mjs';
import { Teammates } from '../main/teammates.mjs';
import { planWakes, runIdFor, seenKey, teammateLabel, teammateIdOf, workOf, DEFAULT_LIMIT } from '../shared/teammates.mjs';

const NOW = new Date(2026, 9, 26, 15, 43).getTime();
const base = { status: 'active', paused: false, served: '', limit: DEFAULT_LIMIT, works: null, product: 'kestrel', memory: [] };
const gm = { ...base, id: 't-growth', name: 'Growth marketer', letter: 'G' };
const vp = { ...base, id: 't-video', name: 'Video producer', letter: 'V' };
const YOURS = 'w-xaccount';
const OTHER = 'w-launchvid';

const handOff = (id, to, title, via = YOURS, ts = NOW) => ({ id, kind: 'pass', from: 'you', to: to.id, title, details: '', via, viaProduct: 'kestrel', ts });
const thread = (t, msgId, over = {}) => ({ id: runIdFor(`${msgId}>${t.id}`), product: 'kestrel', title: 'x', status: 'open', labels: ['founder', teammateLabel(t.id), 'hop:0'], createdAt: NOW, wrote: {}, ...over });
const asking = (ts = NOW + 1000) => ({ result: 'Pick A, B or C?', wrote: { result: { ts, source: 'agent' } } });
const say = (id, from, to, text, run, ts) => ({ id, kind: 'msg', from: from.id, to: [to.id], text, hop: 0, ...(run ? { run } : {}), ts });
const chat = (messages, seen = []) => ({ messages, seen: new Set(seen) });

// Both lanes, handed off from your thread, each with a thread asking you.
const lanes = [handOff('m-0', gm, 'Run a daily Factory-style feature clip'), handOff('m-1', vp, 'Work out with the Growth marketer how a clip a day gets made')];
const gmLane = (over) => thread(gm, 'm-0', { ...asking(), ...over });
const vpLane = (over) => thread(vp, 'm-1', { ...asking(), ...over });

describe('what a message is about', () => {
  it('is the thread of yours it traces back to, through every teammate it passed between', () => {
    const fromVp = say('m-2', vp, gm, '@Growth marketer here is the split', vpLane().id, NOW + 2000);
    const work = workOf(chat([...lanes, fromVp]));
    expect(work.ofRun(gmLane().id)).toBe(YOURS);
    expect(work.ofRun(vpLane().id)).toBe(YOURS);
    expect(work.ofMsg(fromVp)).toBe(YOURS);
    // A run from a schedule or your own chat words is its own.
    expect(work.ofRun('w-round')).toBe('w-round');
    expect(work.ofMsg({ id: 'm-y', kind: 'msg', from: 'you', to: [gm.id], text: 'hi' })).toBe('m-y');
    // A teammate's message from before runs were written on it is its own.
    expect(work.ofMsg(say('m-old', vp, gm, 'hi', null, NOW))).toBe('m-old');
  });
});

describe('a teammate writing about work the other already has a thread on', () => {
  it('goes to that thread while it waits on you, and opens no new one', () => {
    const m = say('m-2', vp, gm, '@Growth marketer hold every post with a bracket in it', vpLane().id, NOW + 2000);
    const acts = planWakes({ teammates: [gm, vp], chat: chat([...lanes, m], lanes.map((l) => seenKey(l.id, l.to))), items: [gmLane(), vpLane()], now: NOW + 3000 });
    expect(acts.filter((a) => a.type === 'run')).toEqual([]);
    expect(acts).toContainEqual({ type: 'seen', msg: 'm-2', teammate: gm.id, run: gmLane().id });
  });

  it('waits while that thread is running or about to, so the turn under way cannot lose it', () => {
    const m = say('m-2', vp, gm, '@Growth marketer the day one clip is rendered', vpLane().id, NOW + 2000);
    const seen = lanes.map((l) => seenKey(l.id, l.to));
    for (const busy of [gmLane({ status: 'claimed' }), thread(gm, 'm-0')]) {
      const acts = planWakes({ teammates: [gm, vp], chat: chat([...lanes, m], seen), items: [busy, vpLane()], now: NOW + 3000 });
      expect(acts.filter((a) => a.msg === 'm-2' || a.type === 'run')).toEqual([]);
    }
  });

  it('opens a new thread, as before, once the teammate has finished that one, so nothing is lost', () => {
    const m = say('m-2', vp, gm, '@Growth marketer the day one clip is rendered', vpLane().id, NOW + 2000);
    const finished = gmLane({ status: 'done', wrote: { ...asking().wrote, status: { ts: NOW + 1500, source: 'agent' } } });
    const acts = planWakes({ teammates: [gm, vp], chat: chat([...lanes, m], lanes.map((l) => seenKey(l.id, l.to))), items: [finished, vpLane()], now: NOW + 3000 });
    expect(acts.filter((a) => a.type === 'run')).toEqual([expect.objectContaining({ teammate: gm.id, id: runIdFor(`m-2>${gm.id}`) })]);
    // That new thread is on the same work, so the next word goes to it.
    expect(workOf(chat([...lanes, m])).ofRun(runIdFor(`m-2>${gm.id}`))).toBe(YOURS);
  });

  it('is not taken up when you closed that thread after it was written, and the chat says so', () => {
    const m = say('m-2', vp, gm, '@Growth marketer please retire your side of it', vpLane().id, NOW + 2000);
    const closed = gmLane({ status: 'done', wrote: { ...asking().wrote, status: { ts: NOW + 2500, source: 'founder' } } });
    const seen = lanes.map((l) => seenKey(l.id, l.to));
    const acts = planWakes({ teammates: [gm, vp], chat: chat([...lanes, m], seen), items: [closed, vpLane()], now: NOW + 3000 });
    expect(acts.filter((a) => a.type === 'run')).toEqual([]);
    expect(acts).toContainEqual({ type: 'seen', msg: 'm-2', teammate: gm.id, run: closed.id });
    expect(acts).toContainEqual({ type: 'dropped', teammate: gm.id, msg: 'm-2', from: vp.id, item: closed.id });
    // Written after you closed it, it is new work and opens a thread.
    const later = { ...m, id: 'm-3', ts: NOW + 2600 };
    const again = planWakes({ teammates: [gm, vp], chat: chat([...lanes, later], seen), items: [closed, vpLane()], now: NOW + 3000 });
    expect(again.filter((a) => a.type === 'run')).toHaveLength(1);
  });

  it('about other work opens a thread of its own, even with that one waiting', () => {
    const elsewhere = handOff('m-9', vp, 'Make the launch video', OTHER);
    const m = say('m-2', vp, gm, '@Growth marketer which post goes under the launch video?', thread(vp, 'm-9').id, NOW + 2000);
    const seen = [...lanes, elsewhere].map((l) => seenKey(l.id, l.to));
    const acts = planWakes({ teammates: [gm, vp], chat: chat([...lanes, elsewhere, m], seen), items: [gmLane(), vpLane(), thread(vp, 'm-9')], now: NOW + 3000 });
    expect(acts.filter((a) => a.type === 'run')).toEqual([expect.objectContaining({ teammate: gm.id, title: 'From Video producer: Which post goes under the launch video?' })]);
  });

  it('from before runs were written on messages, opens a thread each, as it always did', () => {
    const old = [say('m-2', vp, gm, '@Growth marketer one', null, NOW + 2000), say('m-3', vp, gm, '@Growth marketer two', null, NOW + 2100)];
    const acts = planWakes({ teammates: [gm, vp], chat: chat([...lanes, ...old], lanes.map((l) => seenKey(l.id, l.to))), items: [gmLane(), vpLane()], now: NOW + 3000 });
    expect(acts.filter((a) => a.type === 'run')).toHaveLength(2);
  });

  it('a pass and the @mention sent with it make one thread, and the mention is read on its first turn', () => {
    const pass = { id: 'm-p', kind: 'pass', from: gm.id, to: vp.id, title: 'The first daily feature clip', details: '', hop: 0, run: gmLane().id, ts: NOW + 2000 };
    const note = say('m-n', gm, vp, '@Video producer has the shot list', gmLane().id, NOW + 2001);
    const done = vpLane({ status: 'done', wrote: { ...asking().wrote, status: { ts: NOW + 1500, source: 'agent' } } });
    const acts = planWakes({ teammates: [gm, vp], chat: chat([...lanes, pass, note], lanes.map((l) => seenKey(l.id, l.to))), items: [gmLane(), done], now: NOW + 3000 });
    const runs = acts.filter((a) => a.type === 'run');
    expect(runs).toEqual([expect.objectContaining({ teammate: vp.id, id: runIdFor(`m-p>${vp.id}`) })]);
    expect(acts).toContainEqual({ type: 'seen', msg: 'm-n', teammate: vp.id, run: runs[0].id });
  });
});

// Replays the evening of 26 Oct: the two hand-offs, then the sixteen times the
// two teammates woke each other, in the order the store has them.
describe('the evening of 26 October, replayed', () => {
  const EVENING = [
    ['pass', gm, vp, 'The first daily feature clip: One at a time'], ['msg', gm, vp, 'With the shot list; four whole posts are waiting on your yes'],
    ['pass', gm, vp, 'Day one changed: Claude Code runs out, Codex picks the thread up'], ['msg', gm, vp, 'Has the new day one and is holding the old clip'],
    ['msg', vp, gm, 'The daily clip is built and the first one is rendered'], ['msg', gm, vp, 'That split is exactly the one written in marketing/daily-clips.md'],
    ['pass', gm, vp, 'Measure the speed run before we shoot it'], ['msg', gm, vp, 'Is measuring the speed run before anything gets shot'],
    ['msg', vp, gm, "Day five's One at a time clip is rendered"], ['msg', gm, vp, 'Your one-at-a-time clip is day two, not day five'],
    ['pass', gm, vp, 'The Hyperfocus clip: the scroll back, then one key each'], ['msg', vp, gm, 'Your three cards are on it word for word'],
    ['msg', vp, gm, 'Please stop handing me clips to build'], ['msg', vp, gm, 'Please retire your side of it'],
    ['msg', vp, gm, "It uses your three cards and the app's own sentence"], ['msg', vp, gm, 'Hold every post with a bracket in it'],
  ];

  // Each run, once made, ends its turn asking you, as these did.
  const replay = ({ withRuns }) => {
    const items = [];
    const messages = [];
    const seen = new Set();
    const tick = (now) => {
      for (const a of planWakes({ teammates: [gm, vp], chat: { messages, seen }, items, now })) {
        if (a.type === 'run') items.push({ id: a.id, product: 'kestrel', title: a.title, status: 'open', labels: ['founder', teammateLabel(a.teammate), `hop:${a.trigger.hop}`], createdAt: now, wrote: {} });
        if (a.type === 'seen') seen.add(seenKey(a.msg, a.teammate));
      }
      for (const i of items) if (!i.result) Object.assign(i, asking(now + 1));
    };
    messages.push(...lanes);
    tick(NOW);
    const home = (t) => items.find((i) => teammateIdOf(i) === t.id)?.id;
    EVENING.forEach(([kind, from, to, words], n) => {
      const ts = NOW + (n + 1) * 60_000;
      const run = withRuns ? { run: home(from) } : {};
      messages.push(kind === 'pass'
        ? { id: `m-e${n}`, kind, from: from.id, to: to.id, title: words, details: '', hop: 0, ...run, ts }
        : { id: `m-e${n}`, kind, from: from.id, to: [to.id], text: `@${to.name} ${words}`, hop: 0, ...run, ts });
      tick(ts + 1);
    });
    return { gm: items.filter((i) => teammateIdOf(i) === gm.id).length, vp: items.filter((i) => teammateIdOf(i) === vp.id).length, seen };
  };

  it('was one thread per hand-off and per mention: eighteen threads', () => {
    expect(replay({ withRuns: false })).toMatchObject({ gm: 8, vp: 10 });
  });

  it('is one thread each now, and every word reached the thread it was about', () => {
    const now = replay({ withRuns: true });
    expect(now).toMatchObject({ gm: 1, vp: 1 });
    EVENING.forEach(([, , to], n) => expect(now.seen.has(seenKey(`m-e${n}`, to.id))).toBe(true));
  });
});

describe('through the store', () => {
  let product; let dir; let mods; let team; let core; let work; let store;

  beforeEach(async () => {
    const home = appHome();
    process.env.STORE_ACCOUNT_ID = `acct-${Math.random().toString(36).slice(2, 8)}`;
    fs.mkdirSync(path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID), { recursive: true });
    const { resolveAccount } = await import('../mcp/core/account.mjs');
    resolveAccount();
    const { createProduct } = await import('../mcp/core/products.mjs');
    product = createProduct(`Shop ${Math.random().toString(36).slice(2, 8)}`);
    dir = path.join(home, 'accounts', process.env.STORE_ACCOUNT_ID, product.id);
    mods = await loadStore();
    work = mods.workItemsDisk;
    store = {
      config: { storeRoot: home, accountId: process.env.STORE_ACCOUNT_ID },
      modules: mods,
      listProducts: () => [{ slug: product.id, dir, name: product.name }],
      productDir: () => dir,
      listItems: (now) => work.readWorkItems(dir, now).map((i) => ({ ...i, product: product.id })),
    };
    team = new Teammates(store);
    core = await import('../mcp/core/teammates.mjs');
  });

  afterEach(() => {
    delete process.env.STORE_ACCOUNT_ID;
    delete process.env.ZERO_ITEM;
    delete process.env.ZERO_PRODUCT;
  });

  const onRun = (id) => { process.env.ZERO_ITEM = id; process.env.ZERO_PRODUCT = product.id; };
  const tick = (now) => team.tick({ items: store.listItems(now), now, deliver: async () => {} });

  it('a teammate\'s words carry the thread that wrote them, and the other\'s waiting thread reads them on its next turn', async () => {
    const growth = team.create({ name: 'Growth marketer' });
    const video = team.create({ name: 'Video producer' });
    const { writeChat } = await import('../main/store/teammates-files.mjs');
    const T = Date.now();
    writeChat(team.dir(), { kind: 'pass', from: 'you', to: growth.id, title: 'Run a daily clip', details: '', via: 'w-xaccount', viaProduct: product.id }, T);
    writeChat(team.dir(), { kind: 'pass', from: 'you', to: video.id, title: 'Work out how a clip a day gets made', details: '', via: 'w-xaccount', viaProduct: product.id }, T + 1);
    await tick(T + 2);
    const lane = store.listItems().find((i) => teammateIdOf(i) === growth.id);
    const clips = store.listItems().find((i) => teammateIdOf(i) === video.id);
    work.updateWorkItem(dir, lane.id, { result: 'Pick A, B or C?', status: 'open' }, { source: 'agent', now: T + 10 });

    onRun(clips.id);
    const said = 'hold every post with a bracket in it: the terminal half is not measured';
    core.teamPost({ text: `@Growth marketer ${said}` }, { now: T + 20 });
    expect(team.chat().messages.at(-1)).toMatchObject({ from: video.id, run: clips.id });

    await tick(T + 30);
    await tick(T + 40);
    expect(store.listItems().filter((i) => teammateIdOf(i) === growth.id).map((i) => i.id)).toEqual([lane.id]);
    const brief = team.briefFor(store.listItems().find((i) => i.id === lane.id), T + 50);
    expect(brief).toContain('## Written to you about this work while you waited');
    expect(brief).toContain(said);
    expect(brief).toMatch(/not the person's yes/);

    // Once its next turn has spoken, it is not read to it again; it stays in
    // the team chat every brief carries.
    work.updateWorkItem(dir, lane.id, { result: 'Held every post with a bracket.', status: 'open' }, { source: 'agent', now: T + 60 });
    expect(team.briefFor(store.listItems().find((i) => i.id === lane.id), T + 70)).not.toContain('## Written to you about this work while you waited');
  });

  it('words held for a thread you then closed open nothing, and the chat says why', async () => {
    const growth = team.create({ name: 'Growth marketer' });
    const video = team.create({ name: 'Video producer' });
    const { writeChat } = await import('../main/store/teammates-files.mjs');
    const T = Date.now();
    writeChat(team.dir(), { kind: 'pass', from: 'you', to: growth.id, title: 'Run a daily clip', details: '', via: 'w-xaccount', viaProduct: product.id }, T);
    writeChat(team.dir(), { kind: 'pass', from: 'you', to: video.id, title: 'Make the clips', details: '', via: 'w-xaccount', viaProduct: product.id }, T + 1);
    await tick(T + 2);
    const lane = store.listItems().find((i) => teammateIdOf(i) === growth.id);
    const clips = store.listItems().find((i) => teammateIdOf(i) === video.id);
    work.updateWorkItem(dir, lane.id, { status: 'claimed' }, { source: 'agent', now: T + 10 });
    onRun(clips.id);
    core.teamPost({ text: '@Growth marketer please retire your side of it' }, { now: T + 20 });
    await tick(T + 30);
    work.updateWorkItem(dir, lane.id, { status: 'done' }, { source: 'founder', now: T + 40 });
    await tick(T + 50);
    expect(store.listItems().filter((i) => teammateIdOf(i) === growth.id)).toHaveLength(1);
    expect(team.chat().messages.at(-1)).toMatchObject({ kind: 'act', from: growth.id, verb: 'dropped', text: 'Growth marketer did not act on Video producer\'s message, because you had closed “Run a daily clip”.' });
  });

  it('your own thread speaking for you still carries itself, not a run', async () => {
    const growth = team.create({ name: 'Growth marketer' });
    const yours = work.createWorkItem(dir, { title: 'Warming up the X account', labels: ['founder'] }, { source: 'founder' });
    onRun(yours.id);
    core.teamPass({ to: 'Growth marketer', title: 'Run a daily clip', details: '' }, { now: Date.now() });
    const last = team.chat().messages.at(-1);
    expect(last).toMatchObject({ from: 'you', via: yours.id });
    expect(last.run).toBeUndefined();
    expect(growth.id).toBeTruthy();
  });
});
