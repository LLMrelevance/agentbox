// What broke: nothing yet. Her phone only worked while the Mac was awake (it
// talked to the Mac itself, main/phone-link.mjs). Step 1 of
// docs/cloud/PHONE-PLAN.md: the Mac writes a copy of each thread of a project
// she put on her phone to her own rows online, and takes the replies, new
// threads, snoozes and closes her phone left there while it was shut.
// Measured with the in-memory cloud, which keeps the database's rules: what
// reaches the phone, what the Mac does with each command and in what order,
// that a command is done once even when marking it fails, and that a stranger
// sees none of it.
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryCloud, signUpMemory, memoryBackend } from '../main/team/memory-cloud.mjs';
import { createPhoneInbox } from '../main/phone-inbox.mjs';
import { threadSnapshot, threadsWorthCarrying, checkCommand, SNAPSHOT_LIMITS } from '../shared/phone-snapshot.mjs';

const DAY = 24 * 3600_000;
const NOW = Date.parse('2026-10-14T12:00:00Z');

function setup({ items = {}, chosen = [{ slug: 'alpha', name: 'Alpha' }], apply } = {}) {
  const cloud = createMemoryCloud();
  const me = signUpMemory(cloud, { email: 'owner@example.com' });
  const stranger = signUpMemory(cloud, { email: 'stranger@example.com' });
  const mac = memoryBackend(cloud, me);
  const phone = memoryBackend(cloud, me);
  const other = memoryBackend(cloud, stranger);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-inbox-'));
  const applied = [];
  const state = { chosen, items };
  const inbox = createPhoneInbox({
    backend: mac,
    projects: () => state.chosen,
    listItems: (slug) => state.items[slug] ?? [],
    historyOf: (slug, id) => [{ id, ts: NOW, source: 'founder', patch: { body: `brief of ${id}` } }],
    apply: apply ?? (async (cmd) => { applied.push(cmd); }),
    stateFile: path.join(dir, 'phone-inbox.json'),
    now: () => NOW,
  });
  return { cloud, mac, phone, other, inbox, applied, state, stateFile: path.join(dir, 'phone-inbox.json') };
}

const item = (id, extra = {}) => ({ id, title: `Thread ${id}`, status: 'open', updatedAt: NOW - 1000, ...extra });

describe('the Mac puts her threads on her phone', () => {
  it('sends each thread of a chosen project once, and again only when it changes', async () => {
    const t = setup({ items: { alpha: [item('w-1'), item('w-2')] } });
    expect((await t.inbox.syncOnce()).sent).toBe(2);
    const seen = await t.phone.phoneThreads();
    expect(seen.map((r) => r.item).sort()).toEqual(['w-1', 'w-2']);
    expect(seen[0].snapshot.history[0]).toMatchObject({ source: 'founder', patch: { body: expect.stringMatching(/^brief of/) } });
    expect((await t.phone.phoneProjects()).map((p) => p.name)).toEqual(['Alpha']);

    expect((await t.inbox.syncOnce()).sent).toBe(0);
    t.state.items.alpha[0] = item('w-1', { result: 'Done, it works.' });
    expect((await t.inbox.syncOnce()).sent).toBe(1);
  });

  it('carries nothing from a project she did not choose', async () => {
    const t = setup({ items: { alpha: [item('w-1')], private: [item('w-9')] } });
    await t.inbox.syncOnce();
    expect((await t.phone.phoneThreads()).map((r) => r.item)).toEqual(['w-1']);
  });

  it('takes a thread off the phone when it is gone, and a project when she turns it off', async () => {
    const t = setup({ items: { alpha: [item('w-1'), item('w-2')] } });
    await t.inbox.syncOnce();
    t.state.items.alpha = [item('w-2')];
    await t.inbox.syncOnce();
    expect((await t.phone.phoneThreads()).map((r) => r.item)).toEqual(['w-2']);
    t.state.chosen = [];
    await t.inbox.syncOnce();
    expect(await t.phone.phoneThreads()).toEqual([]);
    expect(await t.phone.phoneProjects()).toEqual([]);
  });

  it('carries open threads and the last fortnight of finished ones, not older', () => {
    const rows = threadsWorthCarrying([
      item('open-old', { updatedAt: NOW - 90 * DAY }),
      item('done-recent', { status: 'done', updatedAt: NOW - 13 * DAY }),
      item('done-old', { status: 'done', updatedAt: NOW - 15 * DAY }),
      item('agent-row', { agent: true }),
    ], { now: NOW });
    expect(rows.map((r) => r.id).sort()).toEqual(['done-recent', 'open-old']);
  });

  it('keeps a long thread to its latest lines, cuts long text, and says how many it left behind', () => {
    const history = Array.from({ length: SNAPSHOT_LIMITS.lines + 5 }, (_, i) => ({ id: 'w-1', ts: i, source: 'agent', patch: { result: `line ${i}` } }));
    history[history.length - 1].patch.result = 'x'.repeat(SNAPSHOT_LIMITS.textChars + 10);
    const snap = threadSnapshot(item('w-1', { body: 'y'.repeat(SNAPSHOT_LIMITS.textChars + 1) }), history);
    expect(snap.history).toHaveLength(SNAPSHOT_LIMITS.lines);
    expect(snap.history[0].patch.result).toBe('line 5');
    expect(snap.history.at(-1).patch.result).toHaveLength(SNAPSHOT_LIMITS.textChars + 1);
    expect(snap.item.body.endsWith('…')).toBe(true);
    expect(snap.olderLines).toBe(5);
    const huge = Array.from({ length: SNAPSHOT_LIMITS.lines }, (_, i) => ({ id: 'w-2', ts: i, source: 'agent', patch: { result: 'z'.repeat(SNAPSHOT_LIMITS.textChars), note: 'q'.repeat(SNAPSHOT_LIMITS.textChars) } }));
    const fits = threadSnapshot(item('w-2'), huge);
    expect(JSON.stringify(fits).length).toBeLessThanOrEqual(SNAPSHOT_LIMITS.bytes);
    expect(fits.history.at(-1).ts).toBe(SNAPSHOT_LIMITS.lines - 1);
  });
});

describe('the Mac takes what her phone left', () => {
  let t;
  beforeEach(() => { t = setup({ items: { alpha: [item('w-1')] } }); });

  it('does each command in the order she made it, then marks it done', async () => {
    t.cloud.now = () => NOW;
    await t.phone.addPhoneCommand({ project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'first' } });
    t.cloud.now = () => NOW + 1000;
    await t.phone.addPhoneCommand({ project: 'alpha', kind: 'new', payload: { title: 'second' } });
    expect((await t.inbox.syncOnce()).taken).toBe(2);
    expect(t.applied.map((c) => c.kind)).toEqual(['reply', 'new']);
    const after = await t.phone.phoneCommands();
    expect(after.every((c) => c.takenAt && c.outcome === 'done')).toBe(true);
    expect(await t.phone.waitingPhoneCommands()).toEqual([]);
  });

  it('refuses, and says why, a command it may not do', async () => {
    await t.phone.addPhoneCommand({ project: 'private', item: 'w-9', kind: 'reply', payload: { text: 'x' } });
    await t.phone.addPhoneCommand({ project: 'alpha', item: 'w-404', kind: 'close' });
    await t.phone.addPhoneCommand({ project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: '   ' } });
    await t.inbox.syncOnce();
    expect(t.applied).toEqual([]);
    expect((await t.phone.phoneCommands()).map((c) => c.outcome)).toEqual([
      'refused: that project is not on your phone',
      'refused: that thread is not on your phone',
      'refused: an empty reply',
    ]);
  });

  it('marks a command the app itself refused, and carries on with the next', async () => {
    const u = setup({ items: { alpha: [item('w-1')] }, apply: async (cmd) => { if (cmd.payload.text === 'bad') throw new Error('thread is running'); } });
    await u.phone.addPhoneCommand({ project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'bad' } });
    await u.phone.addPhoneCommand({ project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'good' } });
    await u.inbox.syncOnce();
    expect((await u.phone.phoneCommands()).map((c) => c.outcome)).toEqual(['refused: thread is running', 'done']);
  });

  it('never does a command twice when marking it fails', async () => {
    await t.phone.addPhoneCommand({ project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'once' } });
    const mark = t.mac.markPhoneCommand;
    t.mac.markPhoneCommand = async () => { throw new Error('offline'); };
    await expect(t.inbox.syncOnce()).rejects.toThrow('offline');
    t.mac.markPhoneCommand = mark;
    await t.inbox.syncOnce();
    expect(t.applied).toHaveLength(1);
    expect((await t.phone.phoneCommands())[0].outcome).toBe('done');
  });

  it('remembers a done command across a restart of the Mac', async () => {
    await t.phone.addPhoneCommand({ project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'once' } });
    t.mac.markPhoneCommand = async () => { throw new Error('offline'); };
    await expect(t.inbox.syncOnce()).rejects.toThrow();
    const again = createPhoneInbox({
      backend: memoryBackend(t.cloud, (await t.phone.me()).id),
      projects: () => t.state.chosen,
      listItems: (slug) => t.state.items[slug] ?? [],
      historyOf: () => [],
      apply: async (cmd) => { t.applied.push(cmd); },
      stateFile: t.stateFile,
      now: () => NOW,
    });
    await again.syncOnce();
    expect(t.applied).toHaveLength(1);
  });
});

describe('her phone rows are hers alone', () => {
  it('a stranger reads none of her threads or commands, and marking one changes nothing', async () => {
    const t = setup({ items: { alpha: [item('w-1')] } });
    await t.inbox.syncOnce();
    const cmd = await t.phone.addPhoneCommand({ project: 'alpha', item: 'w-1', kind: 'close' });
    expect(await t.other.phoneThreads()).toEqual([]);
    expect(await t.other.phoneProjects()).toEqual([]);
    expect(await t.other.waitingPhoneCommands()).toEqual([]);
    await t.other.markPhoneCommand(cmd.id, 'done');
    expect((await t.phone.waitingPhoneCommands()).map((c) => c.id)).toEqual([cmd.id]);
  });

  it('a command already marked keeps its first outcome', async () => {
    const t = setup();
    const cmd = await t.phone.addPhoneCommand({ project: 'alpha', kind: 'new', payload: { title: 'x' } });
    await t.mac.markPhoneCommand(cmd.id, 'done');
    await t.mac.markPhoneCommand(cmd.id, 'refused: late');
    expect((await t.phone.phoneCommands())[0].outcome).toBe('done');
  });
});

describe('what the phone may ask', () => {
  const ctx = { projects: ['alpha'], hasItem: (p, id) => id === 'w-1' };
  it('takes the four things and nothing else', () => {
    expect(checkCommand({ project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'hi' } }, ctx)).toBeNull();
    expect(checkCommand({ project: 'alpha', kind: 'new', payload: { body: 'hi' } }, ctx)).toBeNull();
    expect(checkCommand({ project: 'alpha', item: 'w-1', kind: 'snooze', payload: { until: NOW + DAY } }, ctx)).toBeNull();
    expect(checkCommand({ project: 'alpha', item: 'w-1', kind: 'close' }, ctx)).toBeNull();
    expect(checkCommand({ project: 'alpha', item: 'w-1', kind: 'delete' }, ctx)).toMatch(/not something/);
    expect(checkCommand({ project: 'alpha', item: 'w-1', kind: 'snooze', payload: {} }, ctx)).toMatch(/time/);
    expect(checkCommand({ project: 'alpha', kind: 'new', payload: { title: ' ' } }, ctx)).toMatch(/words/);
  });
});

describe('the database keeps the same rules', () => {
  const sql = fs.readFileSync(new URL('../cloud/supabase/migrations/20261014000000_phone_inbox.sql', import.meta.url), 'utf8');
  it('turns on row level security for every phone table, owner-only', () => {
    for (const t of ['phone_projects', 'phone_threads', 'phone_commands']) {
      expect(sql).toContain(`alter table public.${t} enable row level security`);
    }
    expect(sql.match(/owner = auth\.uid\(\)/g).length).toBeGreaterThanOrEqual(6);
  });
  it('lets a command change only in the two columns that mark it taken', () => {
    expect(sql).toContain('grant update (taken_at, outcome) on public.phone_commands to authenticated');
    expect(sql).not.toMatch(/grant [^;]*update[^(;]*on public\.phone_commands to authenticated/);
    expect(sql).toMatch(/revoke all on [^;]*phone_commands from anon/);
  });
});
