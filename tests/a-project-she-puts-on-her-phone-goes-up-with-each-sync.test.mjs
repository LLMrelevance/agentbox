// What broke: nothing yet. Step 1 of docs/cloud/PHONE-PLAN.md needs three
// things joined up: a switch on a project that puts it on her phone, the
// signed-in Mac sending it up on every sync, and what her phone left being
// done by the very handlers the window uses. Measured with a real store, the
// team service and the in-memory cloud: what the phone reads after one sync,
// and which handler got which command.
import { it, expect, describe, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as disk from '../main/store/work-items.mjs';
import { Store } from '../main/store.mjs';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createTeamService } from '../main/team/index.mjs';
import { memorySession } from '../main/team/session.mjs';
import { applyThrough } from '../main/phone-inbox.mjs';
import { loadConfig } from '../main/config.mjs';
import { readSettings, setProjectSetting } from '../main/settings.mjs';
import { Supervisor } from '../main/supervisor.mjs';

let cloud, me, store, service, onPhone, calls, dir, phone;

beforeEach(async () => {
  disk._internals.forgetFolds();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-sync-'));
  const accountRoot = path.join(dir, 'accounts', 'a');
  fs.mkdirSync(accountRoot, { recursive: true });
  store = await new Store({ storeRoot: dir, accountId: 'a', accountRoot, products: [] }).init();
  store.createProduct({ name: 'Alpha' });
  store.createProduct({ name: 'Private' });
  cloud = createMemoryCloud();
  me = signUpMemory(cloud, { email: 'owner@example.com' });
  phone = memoryBackend(cloud, me);
  // Her yes, with her id on it, as Settings writes it.
  onPhone = { owner: me, slugs: ['alpha'] };
  calls = [];
  const channels = new Map([
    ['zero:answer', async (_e, args) => { calls.push(['zero:answer', args]); return { id: args.id }; }],
    ['zero:snooze', async (_e, args) => { calls.push(['zero:snooze', args]); return { id: args.id }; }],
    ['zero:compose', async (_e, args) => { calls.push(['zero:compose', args]); return { id: 'w-new' }; }],
  ]);
  service = createTeamService({
    session: memorySession(() => memoryBackend(cloud, me)),
    store, disk, accountRoot, stateFile: path.join(dir, '.team-sync.json'), intervalMs: 3_600_000,
    phone: { projects: () => onPhone, apply: applyThrough(channels), stateFile: path.join(dir, '.phone-inbox.json') },
  });
  await service.signIn();
});
// The id this computer's projects carry online, read the way her phone reads it.
const device = async () => {
  await service.syncNow();
  return (await phone.phoneProjects())[0].device;
};
afterEach(async () => { await service.signOut(); fs.rmSync(dir, { recursive: true, force: true }); });

describe('the signed-in Mac sends up what she put on her phone', () => {
  it('sends the threads of a project she turned on, with no team at all', async () => {
    const a = store.composeItem('alpha', { title: 'Fix the login page', body: 'It loops.' });
    store.composeItem('private', { title: 'Board notes', body: 'secret' });
    await service.syncNow();
    expect(service.state().team).toBeNull();
    const threads = await phone.phoneThreads();
    expect(threads.map((t) => [t.project, t.item, t.snapshot.item.title])).toEqual([['alpha', a.id, 'Fix the login page']]);
    expect((await phone.phoneProjects()).map((p) => p.name)).toEqual(['Alpha']);
  });

  it('sends nothing when no project is on her phone', async () => {
    onPhone = null;
    store.composeItem('alpha', { title: 'x', body: 'y' });
    await service.syncNow();
    expect(await phone.phoneThreads()).toEqual([]);
  });
});

// Codex's review of step 1, finding 1: her yes was the computer's, so whoever
// signed in next had her projects sent to their account.
describe('her yes is hers', () => {
  it('somebody else signing in on this computer gets none of her projects', async () => {
    store.composeItem('alpha', { title: 'Fix the login page', body: 'It loops.' });
    await service.signOut();
    const other = signUpMemory(cloud, { email: 'other@example.com' });
    const theirs = memoryBackend(cloud, other);
    const next = createTeamService({
      session: memorySession(() => memoryBackend(cloud, other)),
      store, disk, accountRoot: path.join(dir, 'accounts', 'a'), stateFile: path.join(dir, '.team-sync.json'), intervalMs: 3_600_000,
      phone: { projects: () => onPhone, apply: async () => {}, stateFile: path.join(dir, '.phone-inbox.json') },
    });
    await next.signIn();
    await next.syncNow();
    expect(await theirs.phoneThreads()).toEqual([]);
    expect(await theirs.phoneProjects()).toEqual([]);
    await next.signOut();
    await service.signIn();
  });
});

describe('what her phone left goes through the window\'s own handlers', () => {
  it('a reply, a close, a snooze and a new thread, each to its handler', async () => {
    const a = store.composeItem('alpha', { title: 'Fix the login page', body: 'It loops.' });
    await phone.addPhoneCommand({ device: await device(), project: 'alpha', item: a.id, kind: 'reply', payload: { text: 'Use the new cookie.' } });
    await phone.addPhoneCommand({ device: await device(), project: 'alpha', item: a.id, kind: 'snooze', payload: { until: 1_900_000_000_000 } });
    await phone.addPhoneCommand({ device: await device(), project: 'alpha', item: a.id, kind: 'close' });
    await phone.addPhoneCommand({ device: await device(), project: 'alpha', kind: 'new', payload: { title: 'Ship it', body: 'today' } });
    await service.syncNow();
    expect(calls).toEqual([
      ['zero:answer', { product: 'alpha', id: a.id, answer: 'Use the new cookie.', fromPhone: expect.any(String) }],
      ['zero:snooze', { product: 'alpha', id: a.id, snoozedUntil: 1_900_000_000_000 }],
      ['zero:answer', { product: 'alpha', id: a.id, status: 'done' }],
      ['zero:compose', { product: 'alpha', title: 'Ship it', body: 'today', fromPhone: expect.any(String) }],
    ]);
    expect((await phone.phoneCommands()).map((c) => c.outcome)).toEqual(['done', 'done', 'done', 'done']);
  });

  it('marks refused what a handler turned down', async () => {
    const refusing = applyThrough(new Map([['zero:answer', async () => ({ ok: false })]]));
    await expect(refusing({ project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'hi' } })).rejects.toThrow(/turned it down/);
    await expect(refusing({ project: 'alpha', item: 'w-1', kind: 'snooze', payload: { until: 1 } })).rejects.toThrow(/cannot/);
  });

  it('never acts on a project she did not put on her phone', async () => {
    const p = store.composeItem('private', { title: 'Board notes', body: 'secret' });
    await phone.addPhoneCommand({ device: await device(), project: 'private', item: p.id, kind: 'close' });
    await service.syncNow();
    expect(calls).toEqual([]);
    expect((await phone.phoneCommands())[0].outcome).toMatch(/^refused: /);
  });
});

// Codex's third review, finding 5: what a phone command writes carries its id.
describe('the line a phone command writes', () => {
  it('carries the command\'s id, on a reply and on a new thread, and nothing that is not one', () => {
    const a = store.composeItem('alpha', { title: 'Fix it', body: 'now', fromPhone: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d' });
    expect(store.readItem('alpha', a.id).fromPhone).toBe('0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d');
    // On the very line that makes the row (Codex's fourth review): a crash
    // after it leaves no row without its command's id.
    expect(store.readHistory('alpha', a.id)[0].patch).toMatchObject({ title: 'Fix it', fromPhone: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d' });
    store.answerItem('alpha', a.id, { answer: 'and this', fromPhone: '11111111-2222-4333-8444-555555555555' });
    expect(store.readHistory('alpha', a.id).at(-1).patch).toMatchObject({ answer: 'and this', fromPhone: '11111111-2222-4333-8444-555555555555' });
    store.answerItem('alpha', a.id, { answer: 'from the window' });
    expect(store.readHistory('alpha', a.id).at(-1).patch.fromPhone).toBeUndefined();
    store.answerItem('alpha', a.id, { answer: 'odd', fromPhone: '<script>' });
    expect(store.readHistory('alpha', a.id).at(-1).patch.fromPhone).toBeUndefined();
  });
});

describe('the switch on a project', () => {
  const fake = { listItems: () => [], listProducts: () => [{ slug: 'acme', name: 'Acme', dir: '/tmp/acme' }], isDue: () => true, readInstructions: () => '' };
  it('turns on, reads back, and turns off', () => {
    const config = loadConfig(dir);
    const sup = new Supervisor(config, fake, dir);
    const onPhoneNow = () => readSettings({ config: loadConfig(dir), supervisor: sup, store: fake }).projects.find((p) => p.slug === 'acme').onPhone;
    expect(onPhoneNow()).toBe(false);
    setProjectSetting({ config, supervisor: sup }, { product: 'acme', key: 'phone', value: true });
    expect(onPhoneNow()).toBe(true);
    expect(loadConfig(dir).phoneProducts).toEqual({ owner: me, slugs: ['acme'] });
    setProjectSetting({ config, supervisor: sup }, { product: 'acme', key: 'phone', value: false });
    expect(onPhoneNow()).toBe(false);
  });
  it('is kept under the person signed in, reads off for anybody else, and needs somebody signed in', () => {
    const config = loadConfig(dir);
    const sup = new Supervisor(config, fake, dir);
    const was = process.env.AGENTBOX_PERSON_ID;
    try {
      setProjectSetting({ config, supervisor: sup }, { product: 'acme', key: 'phone', value: true });
      expect(loadConfig(dir).phoneProducts).toEqual({ owner: was, slugs: ['acme'] });
      process.env.AGENTBOX_PERSON_ID = 'someone-else';
      expect(readSettings({ config: loadConfig(dir), supervisor: sup, store: fake }).projects[0].onPhone).toBe(false);
      delete process.env.AGENTBOX_PERSON_ID;
      expect(() => setProjectSetting({ config, supervisor: sup }, { product: 'acme', key: 'phone', value: true })).toThrow(/sign in/);
    } finally { process.env.AGENTBOX_PERSON_ID = was; }
  });
});
