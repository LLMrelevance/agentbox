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
  it('distinguishes an answered proposal from a decision still waiting', async () => {
    const answered = { ...deps, options: () => [], answer: () => 'Keep testing smaller accounts.',
      summary: () => 'Ready to ship.\n\n## Options\n1. Ship it\n2. Keep testing' };
    const text = describeOpen(answered, row);
    expect(text).toContain('Previous agent message: Ready to ship.');
    expect(text).toContain('The person already replied: Keep testing smaller accounts.');
    expect(text).toContain('No options are currently waiting');
    expect(text).not.toContain('1. Ship it');
    const brief = await neoBridge(answered)('open_thread', { id: row.id });
    expect(brief.said).toContain('The person already replied');
  });
  it('the open thread is described by what it is for, then the latest', () => {
    const said = describeOpen(deps, row);
    expect(said).toMatch(/What this task is for: Show which Claude account/);
    expect(said.indexOf('What this task is for')).toBeLessThan(said.indexOf('Latest from the agent'));
  });

  it('opening a thread briefs what it is for too', async () => {
    const r = await neoBridge(deps)('open_thread', { id: 'w-e217e577e5' });
    expect(r.said).toMatch(/What this task is for: Show which Claude account/);
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
