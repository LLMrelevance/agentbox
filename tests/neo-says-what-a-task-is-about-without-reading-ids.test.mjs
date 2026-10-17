// 2026-10-17 02:52: "I don't remember what this task was about. Can you
// summarize it for me" got the agent's latest message ("Five pictures in,
// nothing built ... Build it?"), which assumes she remembers the task, and Neo
// read a thread id aloud ("W-ce 8c 1a9275") while she said "Stop talking".
// Then "But I don't know what the task is about" got "Okay."
import { describe, expect, it, vi } from 'vitest';
import { describeOpen, neoBridge, spoken } from '../renderer/src/neo/bridge.ts';
import { runDecision } from '../main/neo/decided.mjs';
import { buildOptions } from '../shared/neo-options.mjs';

const row = { id: 'w-e217e577e5', product: 'p', productName: 'Agentbox Team', title: 'Account indicator for running agents', problem: 'Show which Claude account each running agent is on, so she can see when one is near its limit.', result: 'Five pictures in, nothing built. Also approve w-ce8c1a9275 first. Build it?' };
const deps = {
  rows: () => [row], focused: () => row, outside: () => false,
  options: () => [{ n: 1, text: 'Build it (recommended)' }, { n: 2, text: 'Approve w-ce8c1a9275 first' }],
  summary: (r) => r.result, about: (r) => r.problem, projects: () => [],
  open: vi.fn(), pick: vi.fn(), reply: vi.fn(), close: vi.fn(), compose: vi.fn(), undo: vi.fn(), glow: vi.fn(),
};

describe('what a task is about comes first', () => {
  it('the open thread is described by what it is for, then the latest', () => {
    const said = describeOpen(deps, row);
    expect(said).toMatch(/What this task is for: Show which Claude account/);
    expect(said.indexOf('What this task is for')).toBeLessThan(said.indexOf('Latest from the agent'));
  });

  it('opening a thread briefs what it is for too', async () => {
    const r = await neoBridge(deps)('open_thread', { id: 'w-e217e577e5' });
    expect(r.said).toMatch(/What this task is for: Show which Claude account/);
  });

  it('a summary asks for what the task is, then what it needs', async () => {
    const r = await runDecision({
      heard: "I don't remember what this task was about. Can you summarize it", state: {}, now: () => 0,
      askMain: async (n) => (n === 'neo_screen' ? { ok: true, screen: { open: { id: row.id, title: row.title, options: [] }, rows: [], commands: [] } } : { ok: true, said: describeOpen(deps, row) }),
      decideImpl: async () => ({ choice: 'summary', confidence: 0.6, runnersUp: [] }),
    });
    expect(r.say).toMatch(/what the task is for/);
    expect(r.say).toMatch(/Show which Claude account/);
  });
});

describe('ids are never read aloud', () => {
  it.each(['w-ce8c1a9275', 'W-CE8C1A9275', 'r-0d6c38b457-20261015'])('%s is dropped', (id) => {
    expect(spoken(`Approve ${id} first.`)).toBe('Approve another thread first.');
  });

  it('nor the open thread\'s own id', () => {
    expect(describeOpen(deps, row)).not.toMatch(/w-e217e577e5/);
    expect(describeOpen(deps, row)).not.toMatch(/w-ce8c1a9275/);
  });

  it('nor in the options the decision is told about', () => {
    const { list } = buildOptions({ open: { id: row.id, title: row.title, options: [{ n: 1, text: 'Approve w-ce8c1a9275 first' }] }, rows: [], commands: [] });
    expect(list.find((o) => o.value === 'pick:1').description).not.toMatch(/ce8c1a9275/);
  });
});

describe('"I don\'t know what this is about" is a question', () => {
  const ask = (heard, confidence = 0.56) => {
    const answer = vi.fn(async () => 'It is about the account indicator.');
    return runDecision({
      heard, state: {}, now: () => 0, answer,
      askMain: async (n) => (n === 'neo_screen' ? { ok: true, screen: { open: { id: row.id, title: row.title, options: [] }, rows: [], commands: [] } } : { ok: true, said: 'Open thread: Account indicator' }),
      decideImpl: async () => ({ choice: 'none', confidence, runnersUp: [] }),
    }).then((r) => ({ r, answer }));
  };

  it('a sentence picked as nothing is answered, not met with "Okay"', async () => {
    const { r, answer } = await ask("But I don't know what the task is about");
    expect(answer).toHaveBeenCalled();
    expect(r.say).toMatch(/account indicator/);
  });

  it('thinking aloud is not answered', async () => {
    const { answer } = await ask('hmm let me just look at the pictures for a moment', 0.9);
    expect(answer).not.toHaveBeenCalled();
  });

  it('a short acknowledgement is still just "Okay"', async () => {
    const { r, answer } = await ask('okay cool', 0.95);
    expect(answer).not.toHaveBeenCalled();
    expect(r.say).toBe('Say just "Okay."');
  });

  it('the summary option names how she asks', () => {
    const { list } = buildOptions({ open: { id: row.id, title: row.title, options: [] }, rows: [], commands: [] });
    expect(list.find((o) => o.value === 'summary').description).toMatch(/what this task is about/);
  });
});
