// CHOOSING AN OPTION OUT LOUD IS THE APPROVAL (w-5520063011).
//
// Her words on the first Neo alpha: "when I chose option one, it repeated the
// option and asked for approval even though my instruction should already have
// counted as approval". The option picked read "Ship it so you can press
// Allow", and the plan review's rule (2026-10-16) made any option whose words
// say ship, merge, delete or push come back `needs_yes` first. So one decision
// cost two turns, and the whole point of the voice is that it costs one.
//
// A pick is now exactly as safe as pressing the option's number on the
// keyboard, which is the standard the rest of Neo is held to: it acts, it says
// what it did, and Z takes it back. What still holds is the part that was
// never about asking twice: the thread is named, and a thread that has gone,
// an option it does not offer, or a question the app puts up itself all stop
// the pick.
import { describe, expect, it, vi } from 'vitest';
import { neoBridge } from '../renderer/src/neo/bridge.ts';

const rows = [
  { id: 'w-a', product: 'p1', productName: 'Agentbox', title: 'Microphone button' },
  { id: 'w-b', product: 'p1', productName: 'Agentbox', title: 'Phone pictures' },
];

// The thread it happened on, with the words that made Neo ask twice.
const OPTIONS = {
  'w-a': [{ n: 1, text: 'Ship it so you can press Allow (recommended)' }, { n: 2, text: 'Wait until you have talked to Neo' }],
  'w-b': [{ n: 1, text: 'Delete the old folder' }],
};

function setup({ pick } = {}) {
  const calls = [];
  const deps = {
    rows: () => rows,
    focused: () => rows[0],
    outside: () => false,
    options: (r) => OPTIONS[r.id] ?? [],
    summary: () => '',
    projects: () => [{ slug: 'p1', name: 'Agentbox' }],
    open: vi.fn(), reply: vi.fn(), close: vi.fn(), compose: vi.fn(), undo: vi.fn(), films: () => [],
    pick: pick ?? vi.fn(async (r, n) => { calls.push(['pick', r.id, n]); }),
    glow: vi.fn(),
  };
  return { act: neoBridge(deps), calls, deps };
}

describe('a pick lands on the first try', () => {
  it('ships on "option one" without asking for a yes', async () => {
    const { act, calls } = setup();
    const r = await act('pick_option', { id: 'w-a', n: 1 });
    expect(r).toMatchObject({ ok: true, status: 'committed' });
    expect(r.said).toMatch(/Ship it/);
    expect(calls).toEqual([['pick', 'w-a', 1]]);
  });

  it('picks a harmless option the same way, in one turn', async () => {
    const { act, calls } = setup();
    expect(await act('pick_option', { id: 'w-a', n: 2 })).toMatchObject({ ok: true });
    expect(calls).toEqual([['pick', 'w-a', 2]]);
  });

  it('never answers needs_yes, whatever the option says', async () => {
    const { act } = setup();
    for (const [id, opts] of Object.entries(OPTIONS)) {
      for (const o of opts) {
        expect((await act('pick_option', { id, n: o.n })).status).not.toBe('needs_yes');
      }
    }
  });
});

describe('what still stops a pick', () => {
  it('refuses a thread that has left the inbox', async () => {
    const { act, calls } = setup();
    expect(await act('pick_option', { id: 'w-gone', n: 1 })).toMatchObject({ ok: false, status: 'refused' });
    expect(calls).toEqual([]);
  });

  it('refuses an option number the thread does not offer', async () => {
    const { act, calls } = setup();
    expect(await act('pick_option', { id: 'w-a', n: 3 })).toMatchObject({ ok: false, status: 'refused' });
    expect(calls).toEqual([]);
  });

  it('does not claim a pick the app stopped to ask its own question about', async () => {
    const { act } = setup({ pick: async () => 'asked' });
    expect(await act('pick_option', { id: 'w-a', n: 1 })).toMatchObject({ ok: false, said: expect.stringMatching(/on screen/) });
  });
});
