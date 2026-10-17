// Neo on the Decisions API, live (2026-10-16: "no we want to test now. we
// don't have time to test and then switch, people will be using this in 1-2
// days"). Each request she makes: the app lists what is on screen, the
// Decisions API picks one, and the app does it through the same checked
// actions as before (renderer/src/neo/bridge.ts), then tells the voice what
// happened. Measured on scripts/neo-decide-bench.mjs: 31/32 right, ~130 ms.
import { describe, expect, it, vi } from 'vitest';
import { runDecision, UNSURE } from '../main/neo/decided.mjs';

const SCREEN = {
  open: { id: 'w-j', title: 'JARVIS for Agentbox', options: [{ n: 1, text: 'Ship it all (recommended)' }, { n: 2, text: 'Change the layouts first' }], pictures: [{ n: 1, name: 'a.png' }, { n: 2, name: 'b.png' }, { n: 3, name: 'c.png' }], films: [], files: [{ n: 1, name: 'page.html' }] },
  rows: [{ id: 'w-p', title: 'Pricing page copy' }], commands: [{ id: 'pause', label: 'Pause agents' }], canGoBack: true,
};
const NOW = new Date('2026-10-16T15:00:00').getTime();

function setup(choice, { confidence = 0.95, results = {}, runnersUp = [] } = {}) {
  const calls = [];
  const askMain = vi.fn(async (name, args = {}, heard = '') => {
    if (name === 'neo_screen') return { ok: true, screen: SCREEN };
    calls.push([name, args, heard]);
    return results[name] ?? { ok: true, status: 'committed', said: `did ${name}` };
  });
  const decideImpl = vi.fn(async ({ options }) => ({ choice: typeof choice === 'function' ? choice(options) : choice, confidence, runnersUp, ms: 120 }));
  const state = {};
  const run = (heard) => runDecision({ heard, askMain, decideImpl, state, now: () => NOW, answer: async ({ question }) => `answer to ${question}` });
  return { run, calls, decideImpl, state };
}

describe('what a pick does', () => {
  it.each([
    ['open:w-p', 'open the pricing one', ['open_thread', { id: 'w-p' }]],
    ['close', 'close it', ['close_thread', { id: 'w-j' }]],
    ['pick:2', 'go with the second', ['pick_option', { id: 'w-j', n: 2 }]],
    ['next', 'next', ['next_thread', {}]],
    ['back', 'go back', ['go_back', {}]],
    ['scroll:up', 'scroll up', ['scroll', { where: 'up' }]],
    ['show:1', 'full screen the picture', ['show', { pictures: [1], layout: 'full_screen' }]],
    ['compare', 'compare one and three', ['show', { pictures: [1, 3], layout: 'side_by_side' }]],
    ['hide', 'hide the pictures', ['show', { layout: 'close' }]],
    ['cmd:pause', 'pause the agents', ['run_command', { id: 'pause' }]],
    ['undo', 'undo that', ['undo', {}]],
    ['file:1', 'open the design page', ['open_file', { n: 1 }]],
  ])('%s', async (choice, heard, [name, args]) => {
    const t = setup(choice);
    await t.run(heard);
    expect(t.calls[0].slice(0, 2)).toEqual([name, args]);
    expect(t.calls[0][2]).toBe(heard);
  });

  it('a reply sends what she said to send, with the screenshot unless she said not to', async () => {
    const t = setup('reply');
    await t.run('Tell the agent the orb should go higher, without the screenshot.');
    expect(t.calls[0].slice(0, 2)).toEqual(['reply', { id: 'w-j', text: 'The orb should go higher.', attach: false }]);
  });

  it('putting off takes the time she said', async () => {
    const t = setup('later');
    await t.run('snooze this for ten minutes');
    expect(t.calls[0].slice(0, 2)).toEqual(['later', { id: 'w-j', minutes: 10 }]);
  });

  it('putting off with no time asks how long, and does nothing', async () => {
    const t = setup('later');
    const r = await t.run('snooze this');
    expect(t.calls).toEqual([]);
    expect(r.say).toMatch(/how long/i);
  });

  it('says what the app said happened', async () => {
    const t = setup('open:w-p', { results: { open_thread: { ok: true, status: 'committed', said: 'Opened Pricing page copy.' } } });
    expect((await t.run('open the pricing one')).say).toMatch(/Opened Pricing page copy/);
  });

  it('nothing to do is nothing done and nothing said', async () => {
    const t = setup('none');
    const r = await t.run('hmm');
    expect(t.calls).toEqual([]);
    expect(r.say).toBe('');
  });

  it('a question about the thread is answered from what is on screen', async () => {
    const t = setup('ask', { results: { get_screen: { ok: true, said: 'Open thread: JARVIS ... Latest from the agent: three designs.' } } });
    const r = await t.run('why did it pick design two?');
    expect(r.say).toMatch(/answer to why did it pick design two/);
    expect(t.calls.map((c) => c[0])).toEqual(['get_screen']);
  });
});

describe('when unsure, ask', () => {
  it('a low-confidence pick asks which she meant, naming the two, and does nothing', async () => {
    const t = setup('close', { confidence: UNSURE - 0.05, runnersUp: [{ value: 'later', probability: 0.3 }] });
    const r = await t.run('do the thing');
    expect(t.calls).toEqual([]);
    expect(r.say).toMatch(/Close the open thread/);
    expect(r.say).toMatch(/off until later/);
  });
});

describe('a yes is asked for, then given', () => {
  it('a pick that needs a yes asks, and her yes does it', async () => {
    const t = setup('pick:1', { results: { pick_option: { ok: false, status: 'needs_yes', said: 'Option 1 is "Ship it all". Ask the person to say yes before picking it.' } } });
    const r = await t.run('the first one');
    expect(r.say).toMatch(/say yes/i);
    expect(t.state.pending).toMatchObject({ name: 'pick_option', args: { id: 'w-j', n: 1 } });

    const yes = setup((options) => (options.some((o) => o.value === 'yes') ? 'yes' : 'none'));
    yes.state.pending = t.state.pending;
    await yes.run('yes go ahead');
    expect(yes.calls[0].slice(0, 2)).toEqual(['pick_option', { id: 'w-j', n: 1, confirmed: true }]);
    expect(yes.state.pending).toBeFalsy();
  });

  it('her no drops it', async () => {
    const t = setup((options) => (options.some((o) => o.value === 'no') ? 'no' : 'none'));
    t.state.pending = { name: 'pick_option', args: { id: 'w-j', n: 1 }, about: 'Ship it all' };
    const r = await t.run('no, leave it');
    expect(t.calls).toEqual([]);
    expect(t.state.pending).toBeFalsy();
    expect(r.say).toMatch(/left/i);
  });

  it('offers yes and no only while something is waiting on one', async () => {
    const t = setup('none');
    await t.run('hmm');
    const offered = t.decideImpl.mock.calls[0][0].options.map((o) => o.value);
    expect(offered).not.toContain('yes');
  });
});
