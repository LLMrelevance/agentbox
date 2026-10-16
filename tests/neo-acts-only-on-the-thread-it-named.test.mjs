// What Neo's tool calls do in the inbox (renderer/src/neo/bridge.ts). The
// plan review (2026-10-16) found the way a voice assistant goes wrong here: it
// acts on whatever row is open by the time the call lands rather than the one
// it was talking about. So every action names a thread id and is refused if
// that thread is gone.
//
// The second rule it found, a second yes before an option that says merge or
// ship, is gone (w-5520063011): naming the option is the decision. The pick's
// own cases live in tests/choosing-an-option-out-loud-is-the-approval.
import { describe, expect, it, vi } from 'vitest';
import { neoBridge, describeScreen } from '../renderer/src/neo/bridge.ts';

const rows = [
  { id: 'w-a', product: 'p1', productName: 'Agentbox', title: 'Pricing page copy', status: 'open', result: 'Two drafts ready. Which one?\n\n## Options\n1. Ship draft A (recommended)\n2. Rewrite' },
  { id: 'w-b', product: 'p1', productName: 'Agentbox', title: 'Fix the login bug', status: 'open', result: 'Fixed.' },
  { id: 'w-c', product: 'p2', productName: 'Site', title: 'New hero image', status: 'open' },
];

function setup({ focused = null, list = rows } = {}) {
  const calls = [];
  const rec = (name) => vi.fn(async (...a) => { calls.push([name, ...a]); });
  const deps = {
    rows: () => list,
    focused: () => focused,
    outside: () => false,
    options: (r) => (r.id === 'w-a' ? [{ n: 1, text: 'Ship draft A (recommended)' }, { n: 2, text: 'Rewrite' }] : []),
    summary: (r) => (r.result ?? '').split('\n')[0],
    projects: () => [{ slug: 'p1', name: 'Agentbox' }, { slug: 'p2', name: 'Site' }],
    films: () => [],
    open: rec('open'), pick: rec('pick'), reply: rec('reply'), close: rec('close'),
    compose: vi.fn(async (text, product) => { calls.push(['compose', text, product]); return { id: 'w-new' }; }),
    undo: vi.fn(async () => { calls.push(['undo']); return 'done'; }),
    glow: rec('glow'),
  };
  return { act: neoBridge(deps), calls, deps };
}

describe('acting on a named thread', () => {
  it('opens the thread it named and lights it up', async () => {
    const { act, calls } = setup();
    const r = await act('open_thread', { id: 'w-b' });
    expect(r).toMatchObject({ ok: true, status: 'committed' });
    expect(calls).toContainEqual(['open', rows[1]]);
    expect(calls.some(([n]) => n === 'glow')).toBe(true);
  });

  it('refuses a thread that is no longer in the inbox, and touches nothing', async () => {
    const { act, calls } = setup();
    const r = await act('reply', { id: 'w-gone', text: 'hi' });
    expect(r).toMatchObject({ ok: false, status: 'refused' });
    expect(calls).toEqual([]);
  });

  it('replies on the named thread, not on the one that is open', async () => {
    const { act, calls } = setup({ focused: rows[0] });
    await act('reply', { id: 'w-b', text: 'Thanks, close it after the test.' });
    expect(calls).toContainEqual(['reply', rows[1], 'Thanks, close it after the test.']);
  });

  it('closes the named thread', async () => {
    const { act, calls } = setup();
    expect(await act('close_thread', { id: 'w-c' })).toMatchObject({ ok: true });
    expect(calls).toContainEqual(['close', rows[2]]);
  });

  it('does not claim a close the app stopped to ask about', async () => {
    const { act, deps } = setup();
    deps.close = async () => 'asked';
    expect(await act('close_thread', { id: 'w-c' })).toMatchObject({ ok: false, said: expect.stringMatching(/on screen/) });
  });
});

describe('picking an option', () => {
  it('picks on the thread it named, not the one that is open', async () => {
    const list = [rows[0], { ...rows[1], id: 'w-z' }];
    const { act, calls, deps } = setup({ list, focused: list[1] });
    deps.options = () => [{ n: 1, text: 'Ship draft A (recommended)' }];
    expect(await act('pick_option', { id: 'w-a', n: 1 })).toMatchObject({ ok: true });
    expect(calls).toContainEqual(['pick', rows[0], 1]);
  });

  it('says so when the app asked its own question instead of picking', async () => {
    const { act, deps } = setup();
    deps.pick = async () => 'asked';
    expect(await act('pick_option', { id: 'w-a', n: 2 })).toMatchObject({ ok: false, said: expect.stringMatching(/on screen/) });
  });

  it('refuses an option number the thread does not offer', async () => {
    const { act, calls } = setup();
    expect(await act('pick_option', { id: 'w-a', n: 3 })).toMatchObject({ ok: false, status: 'refused' });
    expect(await act('pick_option', { id: 'w-b', n: 1 })).toMatchObject({ ok: false, status: 'refused' });
    expect(calls.some(([n]) => n === 'pick')).toBe(false);
  });
});

describe('moving through the inbox', () => {
  it('opens the first thread when none is open', async () => {
    const { act, calls } = setup();
    await act('next_thread', {});
    expect(calls).toContainEqual(['open', rows[0]]);
  });

  it('opens the one after the open thread', async () => {
    const { act, calls } = setup({ focused: rows[0] });
    await act('next_thread', {});
    expect(calls).toContainEqual(['open', rows[1]]);
  });

  it('says so at the end of the inbox rather than wrapping round', async () => {
    const { act, calls } = setup({ focused: rows[2] });
    const r = await act('next_thread', {});
    expect(r).toMatchObject({ ok: false, status: 'refused' });
    expect(calls.some(([n]) => n === 'open')).toBe(false);
  });
});

describe('a new thread', () => {
  it('goes to the project named, by name or slug', async () => {
    const { act, calls } = setup();
    await act('new_thread', { text: 'Make the hero warmer', project: 'site' });
    expect(calls).toContainEqual(['compose', 'Make the hero warmer', 'p2']);
  });

  it('goes to the open thread\'s project when none is named', async () => {
    const { act, calls } = setup({ focused: rows[2] });
    await act('new_thread', { text: 'Another one' });
    expect(calls).toContainEqual(['compose', 'Another one', 'p2']);
  });

  it('refuses a project that does not exist rather than guessing', async () => {
    const { act, calls } = setup();
    expect(await act('new_thread', { text: 'x', project: 'Nope' })).toMatchObject({ ok: false, status: 'refused' });
    expect(calls).toEqual([]);
  });
});

describe('what Neo is told the screen shows', () => {
  it('lists the inbox with ids, and the open thread with its summary and options', () => {
    const { deps } = setup({ focused: rows[0] });
    const s = describeScreen(deps);
    expect(s).toMatch(/w-a/);
    expect(s).toMatch(/Fix the login bug/);
    expect(s).toMatch(/Open thread: Pricing page copy/);
    expect(s).toMatch(/1\. Ship draft A/);
  });

  it('says when nothing is waiting', () => {
    const { deps } = setup({ list: [] });
    expect(describeScreen(deps)).toMatch(/nothing waiting/i);
  });

  it('keeps a long inbox short', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `w-${i}`, product: 'p1', productName: 'A', title: `Thread ${i}`, status: 'open' }));
    const { deps } = setup({ list: many });
    const s = describeScreen(deps);
    expect(s).toMatch(/Thread 0\b/);
    expect(s).not.toMatch(/Thread 39/);
    expect(s).toMatch(/40 threads/);
  });

  it('get_screen answers with the same description', async () => {
    const { act, deps } = setup();
    const r = await act('get_screen', {});
    expect(r).toMatchObject({ ok: true, said: describeScreen(deps) });
  });
});

describe('undo', () => {
  it('undoes the last thing, and says when there is nothing to undo', async () => {
    const { act, deps } = setup();
    expect(await act('undo', {})).toMatchObject({ ok: true });
    deps.undo.mockResolvedValueOnce('none');
    expect(await act('undo', {})).toMatchObject({ ok: false, said: expect.stringMatching(/nothing/) });
  });

  it('leaves an old action for the person to take back with Z', async () => {
    const { act, deps } = setup();
    deps.undo.mockResolvedValueOnce('old');
    expect(await act('undo', {})).toMatchObject({ ok: false, said: expect.stringMatching(/press Z/) });
  });
});
