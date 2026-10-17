// From the 6 minutes of talk on 2026-10-17 01:42.
//
// TWO THINGS, both of them Neo talking or not talking at the wrong moment.
//
// She said "Oh". The Decisions API picked `next` at 0.12 — a guess — and
// because anything under UNSURE (0.4) becomes a question, Neo asked "Open the
// next thread that needs you?". Her words: "No, never mind. S- stop talking".
// A pick that low is not a near miss worth checking; it is noise, and the
// answer to noise is silence.
//
// And she said "Can we actually go back to that? I just- I just wanna read"
// and then "I asked you to go back to the previous task". Both came back
// `none` (0.47, 0.30) and Neo said nothing, because `back` is only on the
// list when the app says it can go back — so there was no option her words
// could match. Neo then improvised: "Nothing's coming through for me to open
// there". Being told plainly that there is nowhere to go back to is an
// answer; silence is not.
import { describe, expect, it, vi } from 'vitest';
import { runDecision, UNSURE, GUESS } from '../main/neo/decided.mjs';
import { buildOptions } from '../shared/neo-options.mjs';
import { neoSession } from '../shared/neo-tools.mjs';

const screen = {
  open: { id: 'w-a', title: 'UI redesign to match JARVIS/Neo', options: [], pictures: [], films: [], files: [] },
  rows: [{ id: 'w-a', title: 'UI redesign to match JARVIS/Neo' }, { id: 'w-b', title: 'JARVIS for Agentbox' }],
  commands: [],
  canGoBack: true,
};

function run({ choice, confidence, heard = 'Oh', canGoBack = true }) {
  const askMain = vi.fn(async (name) => (name === 'neo_screen'
    ? { ok: true, screen: { ...screen, canGoBack } }
    : { ok: true, said: 'Done.' }));
  const decideImpl = async () => ({ choice, confidence, runnersUp: [], ms: 100 });
  return runDecision({ heard, askMain, state: {}, decideImpl });
}

describe('a pick too low to be worth anything', () => {
  it('says nothing at all, instead of asking her about it', async () => {
    // "Oh" -> next 0.12, which is what made Neo ask and her say "stop talking".
    expect((await run({ choice: 'next', confidence: 0.12 })).say).toBe('');
  });

  it('is silent anywhere below the guess line', async () => {
    for (const c of [0, 0.05, 0.19]) {
      expect((await run({ choice: 'next', confidence: c })).say).toBe('');
    }
  });
});

describe('a pick it is merely unsure of', () => {
  it('still asks which she meant, between the guess line and sure', async () => {
    const r = await run({ choice: 'next', confidence: (GUESS + UNSURE) / 2 });
    expect(r.say).toMatch(/Not sure what the person meant/);
  });

  it('acts once it is sure', async () => {
    const r = await run({ choice: 'next', confidence: 0.9 });
    expect(r.say).not.toMatch(/Not sure/);
    expect(r.say).toBe('Done.');
  });

  it('keeps the guess line below the unsure line, or one of them does nothing', () => {
    expect(GUESS).toBeLessThan(UNSURE);
  });
});

describe('going back is always something she can ask for', () => {
  it('is on the list even when there is nowhere to go back to', () => {
    const list = buildOptions({ ...screen, canGoBack: false }).list;
    expect(list.find((o) => o.value === 'back')).toBeTruthy();
  });

  it('says so in its own words, so Neo can tell her plainly', () => {
    const d = buildOptions({ ...screen, canGoBack: false }).list.find((o) => o.value === 'back').description;
    expect(d).toMatch(/nowhere to go back|nothing to go back/i);
  });

  it('carries her phrasings either way', () => {
    for (const canGoBack of [true, false]) {
      const d = buildOptions({ ...screen, canGoBack }).list.find((o) => o.value === 'back').description;
      expect(d).toMatch(/go back/i);
    }
  });

  it('answers out loud rather than silently when it cannot go back', async () => {
    const r = await run({ choice: 'back', confidence: 0.9, heard: 'I asked you to go back to the previous task', canGoBack: false });
    expect(r.say).not.toBe('');
  });
});

// And the "one sec" that went nowhere. Twice Neo said "One sec." and then
// said nothing, because the decision was do-nothing. Her words: "You stuck",
// and later, describing it back: "when it wasn't able to do things it didn't
// like, really clarify, it just said one second it would pause and I'd have
// to clarify with it."
describe('a "one sec" is never left hanging', () => {
  it('tells the voice to say plainly when nothing could be done', () => {
    const note = neoSession({}).instructions;
    expect(note).toMatch(/nothing to say|nothing to do/i);
    expect(note).toMatch(/left waiting|hanging|could not do that/i);
  });

  it('tells it not to answer "are you stuck" by guessing at the screen', () => {
    expect(neoSession({}).instructions).toMatch(/are you stuck|about yourself/i);
  });
});
