// 2026-10-17 02:31: she gave Neo feedback ("one of the most valuable things
// ... it shows me in real time the relevant artifacts ... it showed me the
// last image while it was describing the first"), Neo answered it as talk to
// Neo, and her "just respond with that in this task" went out as "Respond
// with that in this task." With her real last twelve lines the writer got
// it right 1 time in 5 (scripts/scratch/neo/that-probe-2.mjs): twice the
// words "respond with that", twice Neo's own restatement.
import { describe, expect, it, vi } from 'vitest';
import { composeReply } from '../main/neo/decide.mjs';
import { buildOptions } from '../shared/neo-options.mjs';

const answering = (output_text) => vi.fn(async () => ({ ok: true, json: async () => ({ output_text }) }));
const write = (out) => composeReply({ heard: 'just respond with that in this task', getKey: async () => 'k', fetchImpl: answering(out) });

describe('a message that only points at something is never sent', () => {
  it.each([
    'Respond with that in this task.',
    'Yeah, just respond with that in this task.',
    'Respond with that feedback in this task.',
    'Please send that.',
    'Send it to this task.',
    'Reply with this.',
  ])('%j sends nothing', async (out) => {
    expect(await write(out)).toEqual({ send: null, unresolved: true });
  });

  it('a real message that starts the same way still goes', async () => {
    expect(await write('Respond with the error text to the user, not a code.')).toEqual({ send: 'Respond with the error text to the user, not a code.' });
  });

  it('the writer is told "that" means the person\'s own words, not Neo\'s restatement', async () => {
    const fetchImpl = answering('x');
    await composeReply({ heard: 'send that', getKey: async () => 'k', fetchImpl });
    const { instructions } = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(instructions).toMatch(/the person's own words.*not Neo's/s);
  });
});

describe('feedback she asks Neo to pass on is a reply, not talk to Neo', () => {
  it('the options say so on both sides', () => {
    const { list } = buildOptions({ open: { id: 'w-j', title: 'JARVIS', options: [] }, rows: [], commands: [] });
    expect(list.find((o) => o.value === 'talk').description).toMatch(/feedback .*is a reply/i);
    expect(list.find((o) => o.value === 'reply').description).toMatch(/feedback about Neo/);
  });
});

describe('when "that" cannot be found, Neo says so and asks', async () => {
  const { runDecision } = await import('../main/neo/decided.mjs');
  it('nothing is sent and she is asked what to send', async () => {
    const calls = [];
    const r = await runDecision({
      heard: 'just respond with that in this task', state: {}, now: () => 0, history: [],
      askMain: async (n, a) => (n === 'neo_screen' ? { ok: true, screen: { open: { id: 'w-j', title: 'JARVIS', options: [] }, rows: [], commands: [] } } : (calls.push(n), { ok: true, said: 'x' })),
      decideImpl: async () => ({ choice: 'reply', confidence: 0.9, runnersUp: [] }),
      compose: async () => ({ send: null, unresolved: true }),
    });
    expect(calls).not.toContain('reply');
    expect(r.say).toMatch(/which words/i);
  });
});
