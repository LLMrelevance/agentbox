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
  onPhone = ['alpha'];
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
    onPhone = [];
    store.composeItem('alpha', { title: 'x', body: 'y' });
    await service.syncNow();
    expect(await phone.phoneThreads()).toEqual([]);
  });
});

describe('what her phone left goes through the window\'s own handlers', () => {
  it('a reply, a close, a snooze and a new thread, each to its handler', async () => {
    const a = store.composeItem('alpha', { title: 'Fix the login page', body: 'It loops.' });
    await phone.addPhoneCommand({ project: 'alpha', item: a.id, kind: 'reply', payload: { text: 'Use the new cookie.' } });
    await phone.addPhoneCommand({ project: 'alpha', item: a.id, kind: 'snooze', payload: { until: 1_900_000_000_000 } });
    await phone.addPhoneCommand({ project: 'alpha', item: a.id, kind: 'close' });
    await phone.addPhoneCommand({ project: 'alpha', kind: 'new', payload: { title: 'Ship it', body: 'today' } });
    await service.syncNow();
    expect(calls).toEqual([
      ['zero:answer', { product: 'alpha', id: a.id, answer: 'Use the new cookie.' }],
      ['zero:snooze', { product: 'alpha', id: a.id, snoozedUntil: 1_900_000_000_000 }],
      ['zero:answer', { product: 'alpha', id: a.id, status: 'done' }],
      ['zero:compose', { product: 'alpha', title: 'Ship it', body: 'today' }],
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
    await phone.addPhoneCommand({ project: 'private', item: p.id, kind: 'close' });
    await service.syncNow();
    expect(calls).toEqual([]);
    expect((await phone.phoneCommands())[0].outcome).toMatch(/^refused: /);
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
    expect(loadConfig(dir).phoneProducts).toEqual(['acme']);
    setProjectSetting({ config, supervisor: sup }, { product: 'acme', key: 'phone', value: false });
    expect(onPhoneNow()).toBe(false);
  });
});
