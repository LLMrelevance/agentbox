// Teammates (w-4bd7b5548b), end to end on a throwaway store: you write to a
// teammate and its run appears; its agent, through the store tools, posts in
// the team chat, passes work to another teammate, keeps a preference and sets
// itself up; the tick turns the pass into the other teammate's run, queued
// behind any run it already has. And the boundaries: a session that is not a
// teammate's run cannot post, a teammate cannot pass to itself, and a run is
// never made twice for one message.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appHome } from '../main/store/home.mjs';
import { loadStore } from '../main/store-modules.mjs';
import { Teammates } from '../main/teammates.mjs';
import { teammateIdOf, passedFromOf, hopOf } from '../shared/teammates.mjs';
import { isCleanRun } from '../shared/repeats.mjs';
import { threadEvents } from '../renderer/src/thread-history';

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
    // The thread opens on your words, as yours: the power test found it
    // opening on the app's instructions, signed "The agent".
    expect(runs[0].body).toBe('Can you try checkout on a phone?');
    const lines = work.readLinesFrom(dir).lines.filter((l) => l.id === runs[0].id);
    const opening = threadEvents(lines).find((e) => e.field === 'body');
    expect(opening).toMatchObject({ who: 'you', words: 'Can you try checkout on a phone?' });
    const brief = team.briefFor(runs[0]);
    expect(brief).toContain('You are Ada, the Quality lead');
    expect(brief).toContain('Can you try checkout on a phone?');
    expect(brief).toContain(`"teammate:${ada.id}"`);
    // How to answer is the brief's, not the thread's.
    expect(brief).toMatch(/If the person wrote to you/);
    expect(runs[0].body).not.toMatch(/team_post/);
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
    // A teammate's work is not your words.
    const lines = work.readLinesFrom(dir).lines.filter((l) => l.id === felixRun.id);
    expect(threadEvents(lines).find((e) => e.field === 'body')?.who).not.toBe('you');
    expect(felixRun.body).not.toMatch(/team_post/);
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
    expect(run.body).toBe('Keep the help pages right whenever the app changes');
    expect(team.briefFor(run)).toContain('still being set up');
    expect(team.briefFor(run)).toMatch(/team_setup/);
    onRun(run.id);
    core.teamSetup({ name: 'Dana', role: 'Docs writer', every: 'weekday', at: '10:00', ready: true });
    const after = team.get(teammate.id);
    expect(after).toMatchObject({ name: 'Dana', role: 'Docs writer', letter: 'D', status: 'active', works: { every: 'weekday', at: '10:00' } });
    expect(() => core.teamSetup({ every: 'sometimes' })).toThrow(/every is one of/);
  });

  // Labels replace the whole list when an agent writes them, and a run that
  // closed with ["done", "clean"] would have stopped being its teammate's run:
  // gone from its page, its queue and its count. Those labels are kept.
  it('a run keeps the labels that say whose it is, whatever labels its agent writes', async () => {
    const ada = team.create({ starter: 'quality' });
    const felix = team.create({ starter: 'maintainer' });
    team.post({ text: 'go', to: [ada.id] });
    await tick(Date.now());
    const adaRun = store.listItems().find((i) => teammateIdOf(i) === ada.id);
    onRun(adaRun.id);
    core.teamPass({ to: 'Felix', title: 'Fix it', details: 'steps' });
    await tick(Date.now());
    const felixRun = store.listItems().find((i) => teammateIdOf(i) === felix.id);
    const { updateItem } = await import('../mcp/core/work.mjs');
    updateItem(felixRun.id, { labels: ['clean'], status: 'done' }, { product: product.id });
    const after = store.listItems().find((i) => i.id === felixRun.id);
    expect(after.labels).toEqual(expect.arrayContaining(['clean', 'founder', `teammate:${felix.id}`, 'hop:1', `from:${ada.id}`]));
    expect(isCleanRun(after)).toBe(true);
    // A thread that is no teammate's run gets exactly the labels written.
    const plain = work.createWorkItem(dir, { title: 'plain', labels: ['x'] }, { source: 'agent' });
    updateItem(plain.id, { labels: ['y'] }, { product: product.id });
    expect(store.listItems().find((i) => i.id === plain.id).labels).toEqual(['y']);
  });

  // A failed hand-off used to be followed by its "seen" marker all the same,
  // so your message was dropped without a word. Now it is tried again on the
  // next tick, and the failure shows on the teammates page.
  it('a message whose hand-off fails is tried again, and the failure is said, not swallowed', async () => {
    const ada = team.create({ starter: 'quality' });
    team.post({ text: 'first', to: [ada.id] });
    await tick(Date.now());
    const run = store.listItems().find((i) => teammateIdOf(i) === ada.id);
    work.updateWorkItem(dir, run.id, { result: 'Which page?', status: 'open' }, { source: 'agent', now: Date.now() });
    team.post({ text: 'The checkout page', to: [ada.id] });
    const failing = async () => { throw new Error('the session did not answer'); };
    await team.tick({ items: store.listItems(), now: Date.now(), deliver: failing });
    expect(team.view(store.listItems()).trouble).toMatch(/the session did not answer/);
    const got = [];
    await team.tick({ items: store.listItems(), now: Date.now(), deliver: async (p, id, text) => { got.push(text); } });
    expect(got).toEqual(['The checkout page']);
    // And once it is through, never again.
    await team.tick({ items: store.listItems(), now: Date.now(), deliver: async (p, id, text) => { got.push(text); } });
    expect(got).toEqual(['The checkout page']);
  });

  // The power test's founder had Company (docs, no code), Product and Website,
  // and all three starters landed on Company, the first in the list.
  it('works where you say, and unnamed, in a project with code rather than the first one listed', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-tm-where-'));
    const listed = [{ slug: 'company', dir: root, name: 'Company', repoPath: null }, { slug: 'product', dir: root, name: 'Product', repoPath: '/r' }, { slug: 'practice', dir: root, name: 'Practice', practice: true, repoPath: '/p' }];
    const here = new Teammates({ config: { storeRoot: root, accountId: 'acct-where' }, modules: mods, listProducts: () => listed, listItems: () => [] });
    expect(here.create({ starter: 'quality' }).product).toBe('product');
    expect(here.create({ starter: 'maintainer', product: 'company' }).product).toBe('company');
    expect(here.create({ starter: 'support', product: 'practice' }).product).toBe('product');
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
