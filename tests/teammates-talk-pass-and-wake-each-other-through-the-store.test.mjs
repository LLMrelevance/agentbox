// Teammates (w-4bd7b5548b), end to end on a throwaway store: you write to a
// teammate and its run appears; its agent, through the store tools, posts in
// the team chat, passes work to another teammate, keeps a preference and sets
// itself up; the tick turns the pass into the other teammate's run, queued
// behind any run it already has. And the boundaries: a session that is not a
// teammate's run cannot post, a teammate cannot pass to itself, and a run is
// never made twice for one message.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { appHome } from '../main/store/home.mjs';
import { loadStore } from '../main/store-modules.mjs';
import { Teammates } from '../main/teammates.mjs';
import { teammateIdOf, passedFromOf, hopOf } from '../shared/teammates.mjs';
import { isCleanRun } from '../shared/repeats.mjs';

describe('teammates through the store', () => {
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

  it('your message to a teammate becomes its run, once, briefed with its job and the chat', async () => {
    const ada = team.create({ starter: 'quality' });
    team.post({ text: 'Can you try checkout on a phone?', to: [ada.id] });
    await tick(Date.now());
    await tick(Date.now());
    const runs = store.listItems().filter((i) => teammateIdOf(i) === ada.id);
    expect(runs).toHaveLength(1);
    expect(runs[0].labels).toEqual(expect.arrayContaining(['founder', `teammate:${ada.id}`, 'hop:0']));
    expect(runs[0].body).toContain('Can you try checkout on a phone?');
    const brief = team.briefFor(runs[0]);
    expect(brief).toContain('You are Ada, the Quality lead');
    expect(brief).toContain('Can you try checkout on a phone?');
    expect(brief).toContain(`"teammate:${ada.id}"`);
  });

  it('a teammate posts, passes work, and the tick makes the other teammate\'s run with where it came from', async () => {
    const ada = team.create({ starter: 'quality' });
    const felix = team.create({ starter: 'maintainer' });
    team.post({ text: 'go', to: [ada.id] });
    await tick(Date.now());
    const adaRun = store.listItems().find((i) => teammateIdOf(i) === ada.id);
    onRun(adaRun.id);

    const posted = core.teamPost({ text: 'Found one: Buy twice charges twice.' });
    expect(posted.to).toEqual([]);
    const passed = core.teamPass({ to: 'Felix', title: 'Buy twice charges twice', details: 'Tap Buy twice on a slow connection.' });
    expect(passed.to).toBe('Felix');

    await tick(Date.now());
    const felixRun = store.listItems().find((i) => teammateIdOf(i) === felix.id);
    expect(felixRun.title).toBe('Buy twice charges twice');
    expect(passedFromOf(felixRun)).toBe(ada.id);
    expect(hopOf(felixRun)).toBe(1);
    expect(felixRun.body).toContain('Tap Buy twice on a slow connection.');
  });

  it('keeps a preference, says so in the chat, and briefs every later run with it', async () => {
    const ada = team.create({ starter: 'quality' });
    team.post({ text: 'go', to: [ada.id] });
    await tick(Date.now());
    const run = store.listItems().find((i) => teammateIdOf(i) === ada.id);
    onRun(run.id);
    expect(core.teamRemember({ text: 'Check the dark theme first' }).remembered).toBe(true);
    expect(core.teamRemember({ text: 'check the dark theme first' }).remembered).toBe(false);
    expect(team.get(ada.id).memory.map((m) => m.text)).toEqual(['Check the dark theme first']);
    expect(team.chat().messages.some((m) => m.kind === 'act' && m.verb === 'learned')).toBe(true);
    expect(team.briefFor(run)).toContain('- Check the dark theme first');
  });

  it('a described teammate sets itself up and is started by ready', async () => {
    const { teammate } = team.describe({ text: 'Keep the help pages right whenever the app changes' });
    expect(teammate.status).toBe('draft');
    await tick(Date.now());
    const run = store.listItems().find((i) => teammateIdOf(i) === teammate.id);
    expect(run.body).toContain('still being set up');
    onRun(run.id);
    core.teamSetup({ name: 'Dana', role: 'Docs writer', every: 'weekday', at: '10:00', ready: true });
    const after = team.get(teammate.id);
    expect(after).toMatchObject({ name: 'Dana', role: 'Docs writer', letter: 'D', status: 'active', works: { every: 'weekday', at: '10:00' } });
    expect(() => core.teamSetup({ every: 'sometimes' })).toThrow(/every is one of/);
  });

  it('refuses: a session that is no teammate\'s run, passing to yourself, and a name nobody has', async () => {
    const ada = team.create({ starter: 'quality' });
    const plain = work.createWorkItem(dir, { title: 'an ordinary task', labels: ['founder'] });
    onRun(plain.id);
    expect(() => core.teamPost({ text: 'hi' })).toThrow(/not a teammate/);
    team.post({ text: 'go', to: [ada.id] });
    await tick(Date.now());
    onRun(store.listItems().find((i) => teammateIdOf(i) === ada.id).id);
    expect(() => core.teamPass({ to: 'Ada', title: 'x' })).toThrow(/not to yourself/);
    expect(() => core.teamPass({ to: 'Zelda', title: 'x' })).toThrow(/no teammate called Zelda/);
  });

  it('a second pass while the teammate is busy is queued, then released when it is free', async () => {
    const ada = team.create({ starter: 'quality' });
    const felix = team.create({ starter: 'maintainer' });
    team.post({ text: 'go', to: [ada.id] });
    await tick(Date.now());
    onRun(store.listItems().find((i) => teammateIdOf(i) === ada.id).id);
    core.teamPass({ to: 'Felix', title: 'first', details: '' });
    core.teamPass({ to: 'Felix', title: 'second', details: '' });
    await tick(Date.now());
    const runs = store.listItems().filter((i) => teammateIdOf(i) === felix.id).sort((a, b) => a.createdAt - b.createdAt);
    expect(runs.map((r) => [r.title, r.start ?? 'now'])).toEqual([['first', 'now'], ['second', 'later']]);
    work.updateWorkItem(dir, runs[0].id, { status: 'done', labels: [...runs[0].labels, 'clean'] }, { source: 'agent' });
    expect(isCleanRun(store.listItems().find((i) => i.id === runs[0].id))).toBe(true);
    await new Promise((r) => setTimeout(r, 5));
    await tick(Date.now());
    expect(store.listItems().find((i) => i.id === runs[1].id).start).toBe('now');
  });
});
