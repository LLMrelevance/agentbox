// "neo keeps just taking my words and failing at what i asked it to do"
// (2026-10-17). From the transcript she filed:
// - "can you ask it to like go through the last few minutes of audio and
//   identify all things that went wrong" was sent word for word, "can you ask
//   it to like" and all.
// - Asked "what should it say?", her "I just told you what it should say" was
//   sent as the message, and then her complaint about that was sent too.
// - "Can we go back to that?" after a reply moved the inbox on: Neo had no way
//   back, because only its own moves were remembered.
// - "Oh" got "Open the next thread that needs you?".
// - After Neo asked "Send a message to JARVIS?", her "Yes" did nothing.
import { describe, expect, it, vi } from 'vitest';
import { runDecision } from '../main/neo/decided.mjs';
import { buildOptions } from '../shared/neo-options.mjs';
import { neoBridge } from '../renderer/src/neo/bridge.ts';

const SCREEN = {
  open: { id: 'w-j', title: 'JARVIS for Agentbox', options: [], pictures: [], films: [], files: [] },
  rows: [{ id: 'w-p', title: 'Pricing page copy' }], commands: [], canGoBack: true,
};
const pick = (choice, confidence = 0.9, runnersUp = []) => ({ choice, confidence, runnersUp, ms: 100 });

function setup(picks, { compose, history = [], results = {} } = {}) {
  const calls = [];
  const askMain = vi.fn(async (name, args = {}) => {
    if (name === 'neo_screen') return { ok: true, screen: SCREEN };
    calls.push([name, args]);
    return results[name] ?? { ok: true, status: 'committed', said: 'Sent.' };
  });
  const queue = [...picks];
  const decideImpl = vi.fn(async () => queue.shift() ?? pick('none'));
  const state = {};
  const answer = vi.fn(async ({ question }) => `Say this: about ${question}`);
  const run = (heard) => runDecision({ heard, askMain, decideImpl, state, now: () => 0, answer, compose, history });
  return { run, calls, state, answer };
}

describe('a reply is the message she asked for', () => {
  it('sends what the composer wrote from her request, not her words to Neo', async () => {
    const compose = vi.fn(async () => ({ send: 'Go through the last few minutes of transcripts and fix everything that went wrong.' }));
    const t = setup([pick('reply')], { compose });
    await t.run('so can you ask it to like go through the last few minutes of audio and identify all things that went wrong');
    expect(t.calls[0]).toEqual(['reply', { id: 'w-j', text: 'Go through the last few minutes of transcripts and fix everything that went wrong.' }]);
  });

  it('the composer is given the conversation, so "I just told you" means what she told it', async () => {
    const history = [{ who: 'you', text: 'tell it the orb should sit higher' }, { who: 'neo', text: 'What should it say?' }];
    const compose = vi.fn(async () => ({ send: 'The orb should sit higher.' }));
    const t = setup([pick('reply')], { compose, history });
    await t.run('I just told you what it should say');
    expect(compose.mock.calls[0][0]).toMatchObject({ heard: 'I just told you what it should say', history, thread: 'JARVIS for Agentbox' });
    expect(t.calls[0][1].text).toBe('The orb should sit higher.');
  });

  it('words meant for Neo, not the agent, send nothing and are answered', async () => {
    const compose = vi.fn(async () => ({ send: null }));
    const t = setup([pick('reply')], { compose });
    const r = await t.run('No, no, no. You wrote the wrong thing, that is not what I wanted');
    expect(t.calls.filter(([n]) => n === 'reply')).toEqual([]);
    expect(r.say).toMatch(/nothing was sent/i);
  });

  it('without a composer her words go as before', async () => {
    const t = setup([pick('reply')]);
    await t.run('tell the agent the orb should go higher');
    expect(t.calls[0][1].text).toBe('The orb should go higher.');
  });

  it('a picture goes along quietly; it is only mentioned when she asked for one', async () => {
    const t = setup([pick('reply'), pick('none'), pick('reply'), pick('none')]);
    await t.run('tell it the orb is too low');
    expect(t.calls[0][1]).not.toHaveProperty('attach');
    await t.run('tell it the orb is too low, with the screenshot');
    expect(t.calls.filter(([n]) => n === 'reply')[1][1].attach).toBe(true);
  });
});

describe('talk to Neo about Neo', () => {
  it('is its own option, apart from replying', () => {
    const o = buildOptions(SCREEN).list.find((x) => x.value === 'talk');
    expect(o.description).toMatch(/Neo itself/);
    expect(o.description).toMatch(/not words for the agent/);
  });

  it('is answered knowing the conversation, and nothing is sent', async () => {
    const t = setup([pick('talk')], { history: [{ who: 'neo', text: 'Done. It sent.' }] });
    const r = await t.run('you wrote I just told you what it should say, that is not what I wanted');
    expect(t.calls.map(([n]) => n)).not.toContain('reply');
    expect(r.say).toMatch(/about you wrote/);
    expect(t.answer.mock.calls[0][0].toNeo).toBe(true);
    expect(t.answer.mock.calls[0][0].context).toMatch(/Done\. It sent\./);
  });
});

describe('Neo\'s own question can be answered yes', () => {
  it('"Send a message to JARVIS?" then "yes" sends what she first said', async () => {
    const compose = vi.fn(async ({ heard }) => ({ send: `from: ${heard}` }));
    const t = setup([pick('reply', 0.31)], { compose });
    const asked = await t.run('ask it to go through the transcripts');
    expect(asked.say).toMatch(/Not sure/);
    expect(t.calls).toEqual([]);
    const yes = setup([], { compose });
    yes.state.pending = t.state.pending;
    const queue = [pick('yes')];
    const r = await runDecision({ heard: 'Yes', askMain: async (n, a) => (n === 'neo_screen' ? { ok: true, screen: SCREEN } : (yes.calls.push([n, a]), { ok: true, said: 'Sent.' })), decideImpl: async () => queue.shift() ?? pick('none'), state: yes.state, now: () => 0, compose, history: [] });
    expect(yes.calls[0]).toEqual(['reply', { id: 'w-j', text: 'from: ask it to go through the transcripts' }]);
    expect(r.say).toMatch(/Sent/);
  });
});

describe('a bare sound is not a question', () => {
  it('"Oh" with a faint guess gets "Okay", not "open the next thread?"', async () => {
    const t = setup([pick('next', 0.12)]);
    expect((await t.run('Oh')).say).toBe('Say just "Okay."');
    expect(t.calls).toEqual([]);
  });
});

describe('back goes to where she was, however she left it', () => {
  const rows = [{ id: 'w-a', product: 'p', title: 'Discoverability' }, { id: 'w-b', product: 'p', title: 'Personal to-dos' }];
  it('after the inbox moved on by itself, back returns to the thread before', async () => {
    let focused = rows[0];
    const open = vi.fn(async (r) => { focused = r; });
    const act = neoBridge({ rows: () => rows, focused: () => focused, outside: () => false, options: () => [], summary: () => '', projects: () => [], open, pick: vi.fn(), reply: vi.fn(), close: vi.fn(), compose: vi.fn(), undo: vi.fn(), glow: vi.fn() });
    await act('get_screen', {});
    focused = rows[1]; // a reply sent her on, or she clicked
    expect(act.canGoBack()).toBe(true);
    const r = await act('go_back', {});
    expect(r).toMatchObject({ ok: true });
    expect(open).toHaveBeenCalledWith(rows[0]);
  });
});

describe('the message writer', async () => {
  const { composeReply } = await import('../main/neo/decide.mjs');
  const answering = (output_text) => vi.fn(async () => ({ ok: true, json: async () => ({ output_text }) }));

  it.each([['NOTHING', null], ['', null], ['The orb should sit higher.', 'The orb should sit higher.']])('%j comes back as %j', async (out, send) => {
    expect(await composeReply({ heard: 'x', getKey: async () => 'k', fetchImpl: answering(out) })).toEqual({ send });
  });

  it('is quick, is given the conversation, and leaves pictures to the app', async () => {
    const fetchImpl = answering('ok');
    await composeReply({ heard: 'I just told you', history: [{ who: 'you', text: 'tell it the orb is low' }], thread: 'JARVIS', getKey: async () => 'k', fetchImpl });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.reasoning).toEqual({ effort: 'low' });
    expect(body.input).toMatch(/person: tell it the orb is low/);
    expect(body.instructions).toMatch(/screenshots or pictures; the app handles that/);
  });
});

// Codex's review of the day's changes (2026-10-17), each confirmed by a probe.
describe('what Codex found', () => {
  const A = { ...SCREEN, open: { ...SCREEN.open, id: 'w-a', title: 'A', options: [{ n: 1, text: 'Ship it' }] } };
  const B = { ...SCREEN, open: { ...SCREEN.open, id: 'w-b', title: 'B', options: [] } };
  function on(screens, picks, { compose, results = {} } = {}) {
    const calls = [];
    let at = 0;
    const askMain = vi.fn(async (name, args = {}) => {
      if (name === 'neo_screen') return { ok: true, screen: screens[Math.min(at, screens.length - 1)] };
      calls.push([name, args]);
      if (name === 'open_thread') at++;
      return results[name] ?? { ok: true, status: 'committed', said: `did ${name}` };
    });
    const queue = [...picks];
    const state = {};
    const run = (heard) => runDecision({ heard, askMain, decideImpl: async () => queue.shift() ?? pick('none'), state, now: () => 0, compose, history: [] });
    return { run, calls, state, move: () => { at++; } };
  }

  it('a second part missing from the new thread is not done on the old one', async () => {
    const t = on([{ ...A, rows: [{ id: 'w-b', title: 'B' }] }, B], [pick('open:w-b'), pick('pick:1'), pick('a')]);
    const r = await t.run('open B and pick option one');
    expect(t.calls.map(([n, a]) => [n, a.id])).toEqual([['open_thread', 'w-b']]);
    expect(r.say).toMatch(/not on this thread/);
  });

  it('a yes after the screen moved to another thread does nothing', async () => {
    const t = on([A, B], [pick('close', 0.3), pick('yes')]);
    await t.run('close this');
    t.move();
    const r = await t.run('yes');
    expect(t.calls).toEqual([]);
    expect(r.say).toMatch(/changed/);
  });

  it('a question waiting on a yes is dropped once she asks for something else', async () => {
    const t = on([A], [pick('close', 0.3), pick('scroll:up'), pick('none')]);
    await t.run('close this');
    await t.run('scroll up');
    expect(t.state.pending).toBeFalsy();
  });

  it('when the writer fails, nothing is sent', async () => {
    const t = on([A], [pick('reply')], { compose: async () => { throw new Error('down'); } });
    const r = await t.run('send the feedback I just gave you');
    expect(t.calls.filter(([n]) => n === 'reply')).toEqual([]);
    expect(r.say).toMatch(/nothing was sent/i);
  });

  it('"don\'t attach the screenshot" anywhere means no screenshot', async () => {
    const { pictureWanted } = await import('../shared/neo-params.mjs');
    expect(pictureWanted("Don't attach the screenshot, tell it to fix the layout")).toBe(false);
    expect(pictureWanted('tell it to fix the layout without the picture please')).toBe(false);
    expect(pictureWanted('tell it to fix the layout, with the screenshot')).toBe(true);
  });

  it('a reply that moved the inbox on does not then skip a thread for "next"', async () => {
    const t = on([A], [pick('reply'), pick('next'), pick('a')], { compose: async () => ({ send: 'Looks good.' }), results: { brief_open: { ok: true, said: 'Now open: B.' } } });
    await t.run('tell it looks good and go next');
    expect(t.calls.map(([n]) => n)).toEqual(['reply', 'brief_open']);
  });

  it('goodbye as the second part still signs off', async () => {
    const t = on([A], [pick('scroll:top'), pick('signoff')]);
    expect(await t.run('scroll to the top, then goodbye')).toMatchObject({ signoff: true });
  });
});

// "I don't understand this part of what you said" got "one sec" and a command
// lookup (2026-10-17): the voice was told to hand every request to the app.
// Measured live (scripts/scratch/neo/followup-probe.mjs): with this rule a
// follow-up was answered by the voice in 3 of 3 runs, and "close it" was
// still handed over in 3 of 3.
describe('Neo talks things through itself', () => {
  it('the voice answers follow-ups itself and hands over only what needs the app', async () => {
    const { neoSession } = await import('../shared/neo-tools.mjs');
    const said = neoSession({}).instructions;
    expect(said).toMatch(/Do not delegate a question the conversation already answers/);
    expect(said).toMatch(/I don't understand that part/);
    expect(said).not.toMatch(/you hand every request to it/);
  });

  it('an answer comes back bare, with no label for the voice to read out', async () => {
    const { answerQuestion } = await import('../main/neo/decide.mjs');
    const fetchImpl = async () => ({ ok: true, json: async () => ({ output_text: 'It is the page title.' }) });
    expect(await answerQuestion({ question: 'what is an H1', context: '', getKey: async () => 'k', fetchImpl })).toBe('It is the page title.');
  });
});
