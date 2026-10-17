// How Neo's window handles a live session's messages. Measured against the
// real service on 2026-10-16: a tool call arrives as a `response.event` whose
// inner event is `response.output_item.done` with a function_call item, and
// the answer goes back as `response.item.create` (function_call_output) then
// `response.create`, both WITHOUT a delegation_id (the service refused one:
// "Unknown parameter: 'delegation_id'"). The card shows only Neo's words, and
// starts fresh each time Neo starts a new turn after the person spoke.
import { describe, expect, it, vi } from 'vitest';
import { liveDriver } from '../renderer/src/neo/live-driver.ts';

function setup(toolResult = { ok: true, said: 'Done.' }) {
  const sent = [];
  const words = [];
  const usage = [];
  const tool = vi.fn(async () => toolResult);
  const d = liveDriver({ send: (e) => sent.push(e), tool, onWords: (w) => words.push(w), onUsage: (s) => usage.push(s), onClosed: () => {} });
  return { d, sent, words, usage, tool };
}

const call = (id, name = 'get_screen', args = '{}') => ({
  type: 'response.event', delegation_id: 'item_1',
  event: { type: 'response.output_item.done', item: { type: 'function_call', call_id: id, name, arguments: args } },
});

describe('a tool call from the session', () => {
  it('runs the tool and sends its answer back the way the service accepts', async () => {
    const { d, sent, tool } = setup({ ok: true, said: 'Opened it.' });
    await d.handle(call('call_1', 'next_thread'));
    expect(tool).toHaveBeenCalledWith('call_1', 'next_thread', '{}', '');
    expect(sent[0].type).toBe('response.item.create');
    expect(sent[0].item).toEqual({ type: 'function_call_output', call_id: 'call_1', output: JSON.stringify({ ok: true, said: 'Opened it.' }) });
    expect(sent[1].type).toBe('response.create');
    for (const e of sent) { expect(e).not.toHaveProperty('delegation_id'); expect(typeof e.event_id).toBe('string'); }
  });

  it('runs the same call only once if it arrives twice', async () => {
    const { d, sent, tool } = setup();
    await d.handle(call('call_1'));
    await d.handle(call('call_1'));
    expect(tool).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(2);
  });

  it('ignores the other response events and items that are not calls', async () => {
    const { d, sent, tool } = setup();
    await d.handle({ type: 'response.event', event: { type: 'response.created' } });
    await d.handle({ type: 'response.event', event: { type: 'response.output_item.done', item: { type: 'message' } } });
    expect(tool).not.toHaveBeenCalled();
    expect(sent).toHaveLength(0);
  });

  it('still answers when the tool throws, so the conversation does not hang', async () => {
    const sent = [];
    const d = liveDriver({ send: (e) => sent.push(e), tool: async () => { throw new Error('boom'); }, onWords: () => {}, onUsage: () => {}, onClosed: () => {} });
    await d.handle(call('call_9'));
    expect(JSON.parse(sent[0].item.output)).toMatchObject({ ok: false });
  });
});

describe('the words on the card', () => {
  it('collects Neo\'s words as they arrive', async () => {
    const { d, words } = setup();
    await d.handle({ type: 'session.output_transcript.delta', delta: ' The second' });
    await d.handle({ type: 'session.output_transcript.delta', delta: ' card is ready.' });
    expect(words.at(-1)).toBe('The second card is ready.');
  });

  it('starts fresh when Neo speaks again after the person did', async () => {
    const { d, words } = setup();
    await d.handle({ type: 'session.output_transcript.delta', delta: 'Three need you.' });
    await d.handle({ type: 'session.input_transcript.delta', delta: 'next' });
    await d.handle({ type: 'session.output_transcript.delta', delta: 'Opening the pricing one.' });
    expect(words.at(-1)).toBe('Opening the pricing one.');
  });

  it('never shows what the person said', async () => {
    const { d, words } = setup();
    await d.handle({ type: 'session.input_transcript.delta', delta: 'my secret thought' });
    expect(words.join(' ')).not.toMatch(/secret/);
  });
});

describe('usage', () => {
  it('reports the session\'s running seconds', async () => {
    const { d, usage } = setup();
    await d.handle({ type: 'session.usage.updated', usage: { seconds: 14 } });
    expect(usage).toEqual([14]);
  });
});

// The person's own last words travel with each tool call, so "option one"
// can be taken as the yes it is (renderer/src/neo/bridge.ts).
describe('what the person last said', () => {
  it('goes with the tool call, even after Neo said "one sec"', async () => {
    const { d, tool } = setup();
    await d.handle({ type: 'session.input_transcript.delta', delta: 'option' });
    await d.handle({ type: 'session.input_transcript.delta', delta: ' one' });
    await d.handle({ type: 'session.output_transcript.delta', delta: 'One sec.' });
    await d.handle(call('c1', 'pick_option', '{"id":"w-a","n":1}'));
    expect(tool).toHaveBeenCalledWith('c1', 'pick_option', '{"id":"w-a","n":1}', 'option one');
  });

  it('is only the latest thing they said', async () => {
    const { d, tool } = setup();
    await d.handle({ type: 'session.input_transcript.delta', delta: 'what is next' });
    await d.handle({ type: 'session.output_transcript.delta', delta: 'The pricing one.' });
    await d.handle({ type: 'session.input_transcript.delta', delta: 'do it' });
    await d.handle(call('c2', 'pick_option', '{"id":"w-a","n":1}'));
    expect(tool).toHaveBeenCalledWith('c2', 'pick_option', '{"id":"w-a","n":1}', 'do it');
  });
});

// "Listen in on our conversations, track our conversations, and as we run
// into issues ... patch them as we go" (her words, 2026-10-16). Each turn is
// handed out whole, so a transcript can be kept and read back.
describe('the transcript', () => {
  function logged() {
    const lines = [];
    const d = liveDriver({ send: () => {}, tool: async () => ({ ok: true, status: 'committed', said: 'Opened it.' }), onWords: () => {}, onUsage: () => {}, onClosed: () => {}, onLine: (l) => lines.push(l) });
    return { d, lines };
  }

  it('hands out what she said once Neo answers, and what Neo said once she speaks again', async () => {
    const { d, lines } = logged();
    await d.handle({ type: 'session.input_transcript.delta', delta: 'what needs' });
    await d.handle({ type: 'session.input_transcript.delta', delta: ' me?' });
    await d.handle({ type: 'session.output_transcript.delta', delta: 'Three things.' });
    await d.handle({ type: 'session.input_transcript.delta', delta: 'next' });
    expect(lines).toEqual([{ who: 'you', text: 'what needs me?' }, { who: 'neo', text: 'Three things.' }]);
  });

  it('logs each action with what came of it', async () => {
    const { d, lines } = logged();
    await d.handle(call('c1', 'open_thread', '{"id":"w-1"}'));
    expect(lines).toContainEqual({ who: 'tool', text: 'open_thread {"id":"w-1"} -> committed: Opened it.' });
  });

  it('hands out the last words when the session ends', async () => {
    const { d, lines } = logged();
    await d.handle({ type: 'session.output_transcript.delta', delta: 'Signing off.' });
    await d.handle({ type: 'session.closed' });
    expect(lines).toContainEqual({ who: 'neo', text: 'Signing off.' });
  });
});
