// "it's not responding when i ask it for things, just says "one sec" then goes
// silent" and "when i ask it questions about a sepcific thing it starts with
// like "32 need you"" (2026-10-16). Read from her transcript and measured live:
// - A pick of "none" sent Live `thinking.append`, which ends the turn after
//   "One sec." with nothing more (scripts/scratch/neo/silence-probe.mjs).
// - Two requests in one breath ("go into the task JARVIS and open the reply
//   field", "full screen it and then start at the top") picked none.
// - A summary or a question was answered from the whole inbox, which starts
//   "Needs you: 32 threads".
// - "Play the video" played one far up the thread: films were numbered oldest
//   first, unlike pictures.
// - Her last words could arrive after the hand-off (0 ms apart, measured).
import { describe, expect, it, vi } from 'vitest';
import { runDecision } from '../main/neo/decided.mjs';
import { buildOptions } from '../shared/neo-options.mjs';
import { liveDriver } from '../renderer/src/neo/live-driver.ts';
import { neoBridge } from '../renderer/src/neo/bridge.ts';

const SCREEN = {
  open: { id: 'w-d', title: 'Agentbox discoverability in search and AI', options: [{ n: 1, text: 'Push it live (recommended)' }], pictures: [], films: [], files: [] },
  rows: [{ id: 'w-j', title: 'JARVIS for Agentbox' }, { id: 'w-p', title: 'Pricing page copy' }],
  commands: [{ id: 'reply', label: 'Reply', hint: 'R' }], canGoBack: false,
};

// `picks`: what the Decisions API answers, in order.
function setup(picks, { results = {}, state = {} } = {}) {
  const calls = [];
  const askMain = vi.fn(async (name, args = {}) => {
    if (name === 'neo_screen') return { ok: true, screen: SCREEN };
    calls.push([name, args]);
    return results[name] ?? { ok: true, status: 'committed', said: `did ${name}` };
  });
  const queue = [...picks];
  const decideImpl = vi.fn(async () => queue.shift() ?? { choice: 'none', confidence: 0.9, runnersUp: [] });
  const answer = vi.fn(async ({ question, context }) => `Say this: answer to ${question} from ${context}`);
  const run = (heard) => runDecision({ heard, askMain, decideImpl, state, now: () => 0, answer });
  return { run, calls, decideImpl, answer, state };
}
const pick = (choice, confidence = 0.9, runnersUp = []) => ({ choice, confidence, runnersUp, ms: 100 });

describe('Neo always says something after "one sec"', () => {
  it('an unsure "nothing" asks which she meant, naming the likeliest', async () => {
    const t = setup([pick('none', 0.12, [{ value: 'next', probability: 0.3 }])]);
    const r = await t.run('can you full screen Agentbox and start at the top');
    expect(r.say).toMatch(/Open the next thread/);
    expect(t.calls).toEqual([]);
  });

  it('an unsure "nothing" with nothing likelier asks her to say it again', async () => {
    const t = setup([pick('none', 0.2, [])]);
    expect((await t.run('mm the thing')).say).toMatch(/say it again/i);
  });

  it('a question with nothing to do is answered, knowing what Neo last did', async () => {
    const t = setup([pick('open:w-p'), pick('none'), pick('none', 0.93)], { results: { open_thread: { ok: true, status: 'committed', said: 'Opened Pricing page copy.' }, describe_open: { ok: true, said: 'Open thread: Pricing page copy' } } });
    await t.run('open the pricing one');
    const r = await t.run('so did you do it');
    expect(r.say).toMatch(/answer to so did you do it/);
    expect(t.answer.mock.calls[0][0].context).toMatch(/Opened Pricing page copy/);
  });

  it('plain talk with nothing to do gets a one-word answer, not silence', async () => {
    const t = setup([pick('none', 0.95)]);
    expect((await t.run('okay cool')).say).toMatch(/Okay/);
  });

  it('the voice is never sent an empty answer', async () => {
    const sent = [];
    const d = liveDriver({ send: (e) => sent.push(e), tool: vi.fn(), onWords: () => {}, onUsage: () => {}, onClosed: () => {}, onDelegate: async () => ({ say: '' }) });
    await d.handle({ type: 'session.delegation.created', delegation: { id: 'i1', target: 'client' } });
    expect(sent).toEqual([expect.objectContaining({ type: 'session.commentary.append', delegation_id: 'i1' })]);
  });
});

describe('a question about a thread is answered from that thread', () => {
  it('a summary reads the open thread only, not the inbox', async () => {
    const t = setup([pick('summary'), pick('none')], { results: { describe_open: { ok: true, said: 'Open thread: Agentbox discoverability. Latest from the agent: five pages built.' } } });
    const r = await t.run('summarize this task');
    expect(t.calls.map(([n]) => n)).toEqual(['describe_open']);
    expect(r.say).toMatch(/five pages built/);
    expect(r.say).not.toMatch(/Needs you/);
  });

  it('the bridge describes the open thread without the inbox', async () => {
    const act = neoBridge({
      rows: () => [{ id: 'w-a', product: 'p', title: 'A' }, { id: 'w-b', product: 'p', title: 'B' }], focused: () => ({ id: 'w-b', product: 'p', title: 'B', result: 'Five pages built.' }),
      outside: () => false, options: () => [{ n: 1, text: 'Push it live' }], summary: (r) => r.result ?? '', projects: () => [],
      open: vi.fn(), pick: vi.fn(), reply: vi.fn(), close: vi.fn(), compose: vi.fn(), undo: vi.fn(), glow: vi.fn(),
    });
    const r = await act('describe_open', {});
    expect(r.said).toMatch(/Open thread: B/);
    expect(r.said).toMatch(/Five pages built/);
    expect(r.said).not.toMatch(/Needs you/);
  });
});

describe('two requests in one breath', () => {
  it('does the first, then the second it asked for', async () => {
    const t = setup([pick('open:w-j'), pick('cmd:reply'), pick('a')]);
    const r = await t.run('go into the task Jarvis for agent box and open the reply field');
    expect(t.calls.map(([n, a]) => [n, a.id])).toEqual([['open_thread', 'w-j'], ['run_command', 'reply']]);
    expect(r.say).toMatch(/did open_thread.*did run_command/s);
  });

  it('a move said first goes first, even when the other half was picked first', async () => {
    const t = setup([pick('cmd:reply', 0.6), pick('open:w-j'), pick('b')]);
    await t.run('go into the task Jarvis and open the reply field');
    expect(t.calls.map(([n, a]) => [n, a.id])).toEqual([['open_thread', 'w-j'], ['run_command', 'reply']]);
    expect(t.decideImpl.mock.calls[2][0].instructions).toMatch(/first/);
  });

  it('"push it live and go next" picks, then moves', async () => {
    const t = setup([pick('pick:1'), pick('next'), pick('a')], { results: { brief_open: { ok: false, said: 'Nothing new is open.' } } });
    await t.run('push it live and go next');
    expect(t.calls.map(([n]) => n)).toEqual(['pick_option', 'brief_open', 'next_thread']);
  });

  it('the second question says what was already done, and does not offer yes or no', async () => {
    const t = setup([pick('open:w-j'), pick('none')]);
    await t.run('go into jarvis');
    expect(t.decideImpl).toHaveBeenCalledTimes(2);
    const second = t.decideImpl.mock.calls[1][0];
    expect(second.input).toMatch(/just done.*Open the thread "JARVIS for Agentbox"/s);
    expect(second.instructions).toMatch(/not done yet/);
  });

  it('split between the two halves, it moves first and then does the other', async () => {
    const t = setup([pick('cmd:reply', 0.38, [{ value: 'open:w-j', probability: 0.4 }]), pick('b')]);
    await t.run('go into the task Jarvis for agent box and open the reply field');
    expect(t.calls.map(([n, a]) => [n, a.id])).toEqual([['open_thread', 'w-j'], ['run_command', 'reply']]);
  });

  it('split between two threads, it asks rather than open both', async () => {
    const t = setup([pick('open:w-j', 0.38, [{ value: 'open:w-p', probability: 0.4 }])]);
    expect((await t.run('open the one about pricing or jarvis')).say).toMatch(/Not sure/);
    expect(t.calls).toEqual([]);
  });

  it('split between two things that are not a move, it asks', async () => {
    const t = setup([pick('close', 0.38, [{ value: 'later', probability: 0.4 }])]);
    const r = await t.run('close or snooze it');
    expect(t.calls).toEqual([]);
    expect(r.say).toMatch(/Not sure/);
  });

  it('a second half the API is unsure of is left alone', async () => {
    const t = setup([pick('open:w-j'), pick('cmd:reply', 0.2)]);
    await t.run('go into jarvis and um');
    expect(t.calls.map(([n]) => n)).toEqual(['open_thread']);
  });

  it('the same action twice runs once', async () => {
    const t = setup([pick('next'), pick('next')]);
    await t.run('next');
    expect(t.calls.map(([n]) => n)).toEqual(['next_thread']);
  });

  it('"close this and go to the next" does not skip a thread: closing already moved on', async () => {
    const t = setup([pick('close'), pick('next'), pick('a')], { results: { brief_open: { ok: true, said: 'Now open: Pricing page copy.' } } });
    await t.run('close this and go to the next one');
    expect(t.calls.map(([n]) => n)).toEqual(['close_thread', 'brief_open']);
  });

  it('a first half that waits on a yes stops there', async () => {
    const t = setup([pick('pick:1'), pick('next'), pick('a')], { results: { pick_option: { ok: false, status: 'needs_yes', said: 'Ask the person to say yes.' } } });
    const r = await t.run('push it live and go next');
    expect(t.calls.map(([n]) => n)).toEqual(['pick_option']);
    expect(r.say).toMatch(/say yes/);
  });

  it('a failed first half stops there', async () => {
    const t = setup([pick('open:w-j'), pick('cmd:reply'), pick('a')], { results: { open_thread: { ok: false, status: 'refused', said: 'No thread with that id.' } } });
    await t.run('go into jarvis and open the reply');
    expect(t.calls.map(([n]) => n)).toEqual(['open_thread']);
  });
});

describe('films come from the latest message first', () => {
  it('the latest message\'s film is "the video"; earlier ones say so', () => {
    const { list } = buildOptions({ ...SCREEN, open: { ...SCREEN.open, films: [{ n: 1, name: 'final.mp4' }, { n: 2, name: 'v1.mp4', earlier: true }] } });
    expect(list.find((o) => o.value === 'play:1').description).toMatch(/latest message.*"the video"/);
    expect(list.find((o) => o.value === 'play:2').description).toMatch(/earlier in the thread/);
  });
});

describe('her last words reach the decision', () => {
  function driver() {
    const onDelegate = vi.fn(async () => ({ say: 'ok' }));
    const d = liveDriver({ send: () => {}, tool: vi.fn(), onWords: () => {}, onUsage: () => {}, onClosed: () => {}, onDelegate });
    return { d, onDelegate };
  }
  const heard = (delta) => ({ type: 'session.input_transcript.delta', delta });
  const delegated = (id) => ({ type: 'session.delegation.created', delegation: { id, target: 'client' } });

  it('words that land just after the hand-off are still in it', async () => {
    const { d, onDelegate } = driver();
    await d.handle(heard('open the'));
    const going = d.handle(delegated('i1'));
    await d.handle(heard(' pricing one'));
    await going;
    expect(onDelegate).toHaveBeenCalledWith('i1', 'open the pricing one');
  });

  it('the next request starts fresh even if Neo said nothing between', async () => {
    const { d, onDelegate } = driver();
    await d.handle(heard('next'));
    await d.handle(delegated('i1'));
    await d.handle(heard('close it'));
    await d.handle(delegated('i2'));
    expect(onDelegate).toHaveBeenLastCalledWith('i2', 'close it');
  });
});
