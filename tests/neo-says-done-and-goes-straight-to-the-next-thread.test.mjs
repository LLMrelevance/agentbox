// "after it completes a task it'll say like done, and it'll take a while to
// describe what it is ... after we've already moved on to the next task ...
// maybe done-done is a good like feedback or some like one word super quick
// feedback. But then I want it to like quickly introduce the next thing"
// (2026-10-16). Neo read back "Closed X" or "Moved X to Later, it comes back
// in ten minutes" while the inbox had already moved on to the next thread.
// Now a close, a put-off or a pick says "Done." and briefs what is open next.
import { describe, expect, it, vi } from 'vitest';
import { runDecision } from '../main/neo/decided.mjs';
import { neoBridge } from '../renderer/src/neo/bridge.ts';

const SCREEN = {
  open: { id: 'w-j', title: 'JARVIS for Agentbox', options: [{ n: 1, text: 'Ship it all (recommended)' }, { n: 2, text: 'Change the layouts first' }], pictures: [], films: [], files: [] },
  rows: [{ id: 'w-p', title: 'Pricing page copy' }], commands: [], canGoBack: false,
};

function decided(choice, briefed = { ok: true, status: 'committed', said: 'Now open: Pricing page copy. Latest from the agent: two drafts.' }) {
  const calls = [];
  const askMain = vi.fn(async (name, args = {}) => {
    if (name === 'neo_screen') return { ok: true, screen: SCREEN };
    calls.push([name, args]);
    if (name === 'brief_open') return briefed;
    return { ok: true, status: 'committed', said: 'Closed JARVIS for Agentbox.' };
  });
  const run = (heard) => runDecision({ heard, askMain, state: {}, decideImpl: async () => ({ choice, confidence: 0.95, runnersUp: [], ms: 100 }), now: () => Date.parse('2026-10-16T15:00:00') });
  return { run, calls };
}

describe('a finished action is one word, then the next thread', () => {
  it.each([['close', 'close it'], ['later', 'snooze this for ten minutes'], ['pick:2', 'go with the second']])('%s says Done and briefs what is open now', async (choice, heard) => {
    const t = decided(choice);
    const r = await t.run(heard);
    expect(r.say).toMatch(/^Done\./);
    expect(r.say).not.toMatch(/Closed|Moved|Picked/);
    expect(r.say).toMatch(/Pricing page copy/);
    expect(t.calls.at(-1)).toEqual(['brief_open', { from: 'w-j' }]);
  });

  it('with nothing new open, it is just Done', async () => {
    const t = decided('close', { ok: false, status: 'refused', said: 'Nothing new is open.' });
    expect((await t.run('close it')).say).toBe('Done.');
  });

  it('a failure is still said in full, and nothing is briefed', async () => {
    const calls = [];
    const askMain = async (name) => {
      if (name === 'neo_screen') return { ok: true, screen: SCREEN };
      calls.push(name);
      return { ok: false, status: 'refused', said: 'JARVIS for Agentbox is still in the inbox, so it was not put off.' };
    };
    const r = await runDecision({ heard: 'snooze this for ten minutes', askMain, state: {}, decideImpl: async () => ({ choice: 'later', confidence: 0.95, runnersUp: [], ms: 1 }), now: () => 0 });
    expect(r.say).toMatch(/still in the inbox/);
    expect(calls).not.toContain('brief_open');
  });

  it('opening, a reply and a question are not cut short', async () => {
    const t = decided('open:w-p');
    expect((await t.run('open the pricing one')).say).toBe('Closed JARVIS for Agentbox.');
    expect(t.calls.map(([n]) => n)).not.toContain('brief_open');
  });
});

describe('the app briefs the thread it moved on to', () => {
  const rows = [
    { id: 'w-a', product: 'p', title: 'JARVIS for Agentbox', status: 'open' },
    { id: 'w-b', product: 'p', title: 'Pricing page copy', status: 'open', result: 'Two drafts ready.' },
  ];
  const bridge = (focused) => neoBridge({
    rows: () => rows, focused, outside: () => false,
    options: (r) => (r.id === 'w-b' ? [{ n: 1, text: 'Draft A' }] : []),
    summary: (r) => r.result ?? '', projects: () => [],
    open: vi.fn(), pick: vi.fn(), reply: vi.fn(), close: vi.fn(), compose: vi.fn(), undo: vi.fn(), glow: vi.fn(),
  });

  it('names the new thread, what it says and its options', async () => {
    const r = await bridge(() => rows[1])('brief_open', { from: 'w-a' });
    expect(r).toMatchObject({ ok: true });
    expect(r.said).toMatch(/Pricing page copy/);
    expect(r.said).toMatch(/Two drafts ready/);
    expect(r.said).toMatch(/1\. Draft A/);
  });

  it('waits a moment for the inbox to move on', async () => {
    let now = rows[0];
    setTimeout(() => { now = rows[1]; }, 100);
    const r = await bridge(() => now)('brief_open', { from: 'w-a' });
    expect(r.said).toMatch(/Pricing page copy/);
  });

  it('says nothing new is open when the same thread, or none, still is', async () => {
    expect(await bridge(() => rows[0])('brief_open', { from: 'w-a' })).toMatchObject({ ok: false });
    expect(await bridge(() => null)('brief_open', { from: 'w-a' })).toMatchObject({ ok: false });
  });
});
