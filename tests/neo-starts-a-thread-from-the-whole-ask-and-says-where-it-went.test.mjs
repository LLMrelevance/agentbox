// From the 9 minutes with Neo on 2026-10-17.
//
// The ask was a repo: "tell it to, uh have a repo in my private repositories,
// stand up better. If it doesn't exist, to make one, push it, and then delete
// it" — and then, still finishing the sentence, "For" ... "Elys" ... "ian",
// with Neo talking across it ("Okay," / "doing" / "that."). Neo had already
// called new_thread. The task that reached the inbox reads "Tell it to have a
// repo in my private repositories, stand up better..." and "for Elysian" is
// nowhere in it, so the one fact saying whose repo it is was dropped.
//
// No Elysian project exists in this store, so routing could not have saved
// it; the words themselves had to survive. So Neo waits for the end of the
// ask before it delegates, and a thread it starts carries every word.
// The project was defaulted silently too, and "I passed it to the Agentbox
// Team" sounded like a choice rather than the open thread's project, so the
// answer now says a guessed project is a guess.
import { describe, expect, it, vi } from 'vitest';
import { neoBridge } from '../renderer/src/neo/bridge.ts';
import { neoSession, NEO_TOOLS } from '../shared/neo-tools.mjs';

const session = neoSession({});
const voice = session.instructions;
const backend = session.delegation.responses.instructions;
const newThread = NEO_TOOLS.find((t) => t.name === 'new_thread');

const open = { id: 'w-b3a', product: 'p1', productName: 'Agentbox Team', title: 'Account status display', status: 'open' };

function setup({ focused = open } = {}) {
  const calls = [];
  const deps = {
    rows: () => [open],
    focused: () => focused,
    outside: () => false,
    options: () => [],
    summary: () => '',
    projects: () => [{ slug: 'p1', name: 'Agentbox Team' }, { slug: 'p2', name: 'Personal' }],
    open: vi.fn(), pick: vi.fn(), reply: vi.fn(), close: vi.fn(), undo: vi.fn(), glow: vi.fn(),
    compose: vi.fn(async (text, product) => { calls.push(['compose', text, product]); return { id: 'w-new' }; }),
  };
  return { act: neoBridge(deps), calls, deps };
}

describe('Neo waits for the end of the ask before it starts a thread', () => {
  it('tells the voice not to act on a sentence she has not finished', () => {
    // Not just "do not talk over her", which it already said while it went
    // ahead and delegated half an ask.
    expect(voice).toMatch(/not your turn to act|before you delegate|until they have finished/i);
  });

  it('tells the backend a new thread carries every word of the ask', () => {
    expect(backend).toMatch(/new_thread/);
    expect(backend).toMatch(/new_thread[^.]*(all of|every word|word for word|exactly)/i);
  });

  it('says on the tool itself that the task is her words, not a summary', () => {
    expect(newThread.description).toMatch(/never summarise|not a summary|word for word|exactly as/i);
  });

  it('keeps who or what the work is for, which is the part that was lost', () => {
    expect(backend).toMatch(/who|what it is for|for whom|which repo|the project it is for/i);
  });
});

describe('where a new thread went', () => {
  it('says the project was its own guess when she did not name one', async () => {
    const { act, calls } = setup();
    const r = await act('new_thread', { text: 'Stand the repo up better, for Elysian' });
    expect(calls).toContainEqual(['compose', 'Stand the repo up better, for Elysian', 'p1']);
    expect(r.said).toMatch(/Agentbox Team/);
    expect(r.said).toMatch(/no project was named|open thread's project/i);
  });

  it('an empty project name is no name at all, not a project called nothing', async () => {
    const { act, calls } = setup();
    const r = await act('new_thread', { text: 'Stand the repo up better', project: '' });
    expect(r).toMatchObject({ ok: true });
    expect(calls).toContainEqual(['compose', 'Stand the repo up better', 'p1']);
    expect(r.said).toMatch(/no project was named|open thread's project/i);
  });

  it('says it plainly, with no hedging, when she did name the project', async () => {
    const { act, calls } = setup();
    const r = await act('new_thread', { text: 'Book the flights', project: 'Personal' });
    expect(calls).toContainEqual(['compose', 'Book the flights', 'p2']);
    expect(r.said).toBe('Started it in Personal.');
  });

  it('still refuses a project that does not exist rather than guessing', async () => {
    const { act, calls } = setup();
    expect(await act('new_thread', { text: 'x', project: 'Elysian' })).toMatchObject({ ok: false, status: 'refused' });
    expect(calls).toEqual([]);
  });
});
