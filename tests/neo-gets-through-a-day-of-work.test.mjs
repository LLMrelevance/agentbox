// Daily-work replay, 2026-10-17: exercise the real decision runner and bridge
// together. Snooze follow-ups, opening then picking, stale targets and going
// back exposed gaps that isolated picker tests never exercised.
import { describe, expect, it, vi } from 'vitest';
import { runDecision } from '../main/neo/decided.mjs';
import { neoBridge, screenFor } from '../renderer/src/neo/bridge.ts';
import { laterFrom } from '../shared/neo-params.mjs';

function inbox() {
  const rows = [
    { id: 'w-a', product: 'alpha', title: 'Landing page', options: [{ n: 1, text: 'Ship it' }, { n: 2, text: 'Revise the headline' }] },
    { id: 'w-b', product: 'beta', title: 'Billing export', options: [{ n: 1, text: 'Keep the CSV' }] },
    { id: 'w-c', product: 'alpha', title: 'Daily report', options: [] },
  ];
  let focused = rows[0];
  const effects = [];
  const deps = {
    rows: () => rows.filter((r) => !r.done), threadsAnywhere: () => rows,
    focused: () => focused, outside: () => false, options: (r) => r.options,
    summary: () => 'Ready to review.', projects: () => [{ slug: 'alpha', name: 'Alpha' }, { slug: 'beta', name: 'Beta' }],
    open: async (r) => { focused = r; effects.push(['open', r.id]); },
    pick: async (r, n) => { effects.push(['pick', r.id, n]); r.done = true; focused = deps.rows()[0] ?? null; },
    reply: async (r, text) => { effects.push(['reply', r.id, text]); },
    close: async (r) => { effects.push(['close', r.id]); r.done = true; focused = deps.rows()[0] ?? null; },
    later: async (r, ts) => { effects.push(['later', r.id, ts]); r.done = true; focused = deps.rows()[0] ?? null; },
    compose: async (text, product) => { effects.push(['new', product, text]); return { id: 'w-new' }; },
    undo: async () => 'none', glow: () => {}, show: async (ns, layout) => { effects.push(['show', layout]); return true; },
    now: () => new Date('2026-10-17T09:00:00').getTime(),
  };
  const act = neoBridge(deps);
  const state = {};
  const askMain = async (name, args = {}, heard = '') => name === 'neo_screen'
    ? { ok: true, screen: screenFor(deps, act.canGoBack()) }
    : act(name, args, { heard });
  const run = (heard, picks, extra = {}) => {
    const queue = [...picks];
    return runDecision({ heard, askMain, state, now: deps.now, decideImpl: async () => ({ choice: queue.shift() ?? 'none', confidence: 0.95, runnersUp: [] }), ...extra });
  };
  return { deps, effects, run, state, focus: (r) => { focused = r; }, rows };
}

describe('a day of work through the decision runner and real bridge', () => {
  it('remembers which thread a snooze duration answers', async () => {
    const t = inbox();
    expect((await t.run('Snooze this.', ['later'])).say).toMatch(/how long/i);
    await t.run('Ten minutes.', ['later']);
    expect(t.effects).toContainEqual(['later', 'w-a', t.deps.now() + 600_000]);
  });

  it('offers the waiting snooze request to the picker on the next turn', async () => {
    const t = inbox();
    await t.run('Put it off.', ['later']);
    const decideImpl = vi.fn(async () => ({ choice: 'none', confidence: 0.95 }));
    await t.run('Ten minutes.', [], { decideImpl });
    expect(decideImpl.mock.calls[0][0].input).toMatch(/waiting.*(?:time|duration)|(?:time|duration).*waiting/i);
  });

  it('opens a thread from the inbox and then offers its options', async () => {
    const t = inbox();
    t.focus(null);
    const decideImpl = vi.fn(async ({ instructions, options }) => {
      if (/first of them/.test(instructions)) return { choice: 'open:w-a', confidence: 0.95 };
      return { choice: options.some((o) => o.value === 'pick:2') ? 'pick:2' : 'none', confidence: 0.95 };
    });
    await t.run('Open the landing page task and go with option two.', [], { decideImpl });
    expect(t.effects).toContainEqual(['pick', 'w-a', 2]);
  });

  it('does not close a different thread when the screen changes during a decision', async () => {
    const t = inbox();
    const decideImpl = vi.fn(async () => { t.focus(t.rows[1]); return { choice: 'close', confidence: 0.95 }; });
    await t.run('Close this.', [], { decideImpl });
    expect(t.effects.filter(([kind]) => kind === 'close')).toEqual([]);
  });

  it('puts away the previous thread pictures when going back', async () => {
    const t = inbox();
    await t.run('Open billing export.', ['open:w-b']);
    t.effects.length = 0;
    await t.run('Go back.', ['back']);
    expect(t.effects).toContainEqual(['show', 'close']);
    expect(t.deps.focused().id).toBe('w-a');
  });

  it('cancels the waiting snooze if the person moves to another thread', async () => {
    const t = inbox();
    await t.run('Snooze this.', ['later']);
    t.focus(t.rows[1]);
    await t.run('Ten minutes.', ['none']);
    expect(t.effects.filter(([kind]) => kind === 'later')).toEqual([]);
    expect(t.state.pending).toBeFalsy();
  });

  it('can add new work to a named project', async () => {
    const t = inbox();
    await t.run('Add a new task: check the receipts.', ['new:beta']);
    expect(t.effects).toContainEqual(['new', 'beta', 'check the receipts.']);
  });

  it.each([
    ['Start a new task in Beta: check receipts.', 'check receipts.'],
    ['Start a new task: Beta release notes need work.', 'Beta release notes need work.'],
  ])('keeps the new message separate from its project: %s', async (heard, text) => {
    const t = inbox();
    await t.run(heard, ['new:beta']);
    expect(t.effects).toContainEqual(['new', 'beta', text]);
  });

  it('completes close-and-next without skipping the newly opened thread', async () => {
    const t = inbox();
    await t.run('Close this and go next.', ['close', 'next', 'a']);
    expect(t.deps.focused().id).toBe('w-b');
    expect(t.effects.filter(([kind]) => kind === 'close')).toEqual([['close', 'w-a']]);
  });

  it('answers an app close confirmation by voice, on that same thread only', async () => {
    const t = inbox();
    t.deps.close = vi.fn(async (r, confirmed) => {
      if (!confirmed) return { asked: 'The agent is waiting for your answer. Close anyway?' };
      t.effects.push(['close', r.id]);
      r.done = true;
      t.focus(t.rows[1]);
      return 'done';
    });
    expect((await t.run('Close this.', ['close'])).say).toMatch(/Close anyway/);
    expect(t.effects.filter(([kind]) => kind === 'close')).toEqual([]);
    await t.run('Yes.', ['yes']);
    expect(t.effects).toContainEqual(['close', 'w-a']);
    expect(t.deps.close).toHaveBeenLastCalledWith(t.rows[0], true);
  });
});

describe('times people say during their day', () => {
  const now = new Date('2026-10-17T09:00:00').getTime();
  it.each(['until 99pm', 'until 4:99pm', 'for zero minutes', 'for 0 hours'])('refuses an invalid time: %s', (said) => {
    expect(laterFrom(said, now)).toBeNull();
  });
  it.each(['tomorrow at 9', 'in ten minutes', 'until 4pm'])('accepts a real time: %s', (said) => {
    expect(laterFrom(said, now)?.ts).toBeGreaterThan(now);
  });
});
