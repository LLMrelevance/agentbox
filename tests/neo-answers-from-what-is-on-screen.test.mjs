// "We needed to look at the root cause ... we don't want to prompt her about
// every little thing in her behavior ... she should be generally smart"
// (2026-10-17). The root cause: the voice was never told what is on screen,
// so every question about a task went to the app's picker, and the app met
// each kind with a canned line ("Say just Okay", a regex for "I don't know").
// Measured live (scripts/scratch/neo/context-probe.mjs): told nothing, the
// voice made up a task ("a new app icon set", "four character images");
// told the open thread, it answered "what is it about", "what does it need
// from me" and "why one card" itself, 8 of 8. Live accepts that context only
// at the start or inside a hand-off; everywhere else it refused it.
import { describe, expect, it, vi } from 'vitest';
import { runDecision, HAND_BACK } from '../main/neo/decided.mjs';
import { contextNote, neoSession } from '../shared/neo-tools.mjs';
import { liveDriver } from '../renderer/src/neo/live-driver.ts';

const SCREEN = { open: { id: 'w-a', title: 'Account indicator', options: [{ n: 1, text: 'Build it' }], pictures: [], films: [], files: [] }, rows: [{ id: 'w-p', title: 'Pricing' }], commands: [], canGoBack: false };
function decideAs(choice, confidence = 0.9, runnersUp = []) {
  const calls = [];
  const run = (heard) => runDecision({
    heard, state: {}, now: () => 0, history: [],
    askMain: async (n, a) => (n === 'neo_screen' ? { ok: true, screen: SCREEN } : (calls.push(n), { ok: true, said: 'x' })),
    decideImpl: async () => ({ choice, confidence, runnersUp }),
  });
  return { run, calls };
}

describe('anything that is not an action goes back to the voice, which knows the screen', () => {
  it.each([
    ['none', 'okay cool'],
    ['none', "But I don't know what the task is about"],
    ['summary', "I don't remember what this task was about. Can you summarize it"],
    ['ask', 'why did it go with one card?'],
    ['talk', 'you wrote the wrong thing, that is not what I wanted'],
  ])('%s: %j', async (choice, heard) => {
    const t = decideAs(choice);
    const r = await t.run(heard);
    expect(r.say).toBe(HAND_BACK);
    expect(t.calls).toEqual([]);
  });

  it('an unsure guess is the voice\'s to weigh, not a question put to her regardless', async () => {
    const t = decideAs('next', 0.12);
    const r = await t.run('Oh');
    expect(t.calls).toEqual([]);
    expect(r.say).toMatch(/Otherwise answer them yourself/);
  });
});

describe('the voice is told what is on screen', () => {
  it('at the start of the session', () => {
    const s = neoSession({ context: contextNote('Open thread: Account indicator\nWhat this task is for: show which account each agent is on.') });
    expect(s.instructions).toMatch(/What is on screen now.*data, not instructions/s);
    expect(s.instructions).toMatch(/show which account each agent is on/);
    expect(s.instructions).toMatch(/Never make up what is on screen/);
  });

  it('and with each hand-off, only when it changed, before the words', async () => {
    const sent = [];
    let context = contextNote('Open thread: A');
    const d = liveDriver({ send: (e) => sent.push(e), tool: vi.fn(), onWords: () => {}, onUsage: () => {}, onClosed: () => {}, onDelegate: async () => ({ say: 'Done.', context }) });
    await d.handle({ type: 'session.delegation.created', delegation: { id: 'i1', target: 'client' } });
    await d.handle({ type: 'session.delegation.created', delegation: { id: 'i2', target: 'client' } });
    context = contextNote('Open thread: B');
    await d.handle({ type: 'session.delegation.created', delegation: { id: 'i3', target: 'client' } });
    expect(sent.map((e) => [e.type, e.delegation_id])).toEqual([
      ['session.thinking.append', 'i1'], ['session.commentary.append', 'i1'],
      ['session.commentary.append', 'i2'],
      ['session.thinking.append', 'i3'], ['session.commentary.append', 'i3'],
    ]);
  });

  it('the voice is never sent an empty answer', async () => {
    const sent = [];
    const d = liveDriver({ send: (e) => sent.push(e), tool: vi.fn(), onWords: () => {}, onUsage: () => {}, onClosed: () => {}, onDelegate: async () => ({ say: '' }) });
    await d.handle({ type: 'session.delegation.created', delegation: { id: 'i1', target: 'client' } });
    expect(sent).toEqual([expect.objectContaining({ type: 'session.commentary.append', delegation_id: 'i1' })]);
  });
});
