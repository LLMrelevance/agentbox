// From the 6 minutes of talk on 2026-10-17 01:42.
//
// She said "Can we actually go back to that? I just- I just wanna read" and
// then "I asked you to go back to the previous task". Both came back `none`
// (0.47, 0.30) and Neo said nothing, because `back` was only on the list when
// the app said it could go back — so there was no option her words could
// match. Neo improvised: "Nothing's coming through for me to open there".
// Being told plainly that there is nowhere to go back to is an answer;
// silence is not. She had to ask, twice, whether it was stuck.
//
// (The faint-guess half of this round is main's: a pick under 0.2 on three
// words or fewer answers "Okay." rather than asking — main/neo/decided.mjs.)
import { describe, expect, it } from 'vitest';
import { buildOptions } from '../shared/neo-options.mjs';
import { neoSession } from '../shared/neo-tools.mjs';

const screen = {
  open: { id: 'w-a', title: 'UI redesign to match JARVIS/Neo', options: [], pictures: [], films: [], files: [] },
  rows: [{ id: 'w-a', title: 'UI redesign to match JARVIS/Neo' }, { id: 'w-b', title: 'JARVIS for Agentbox' }],
  commands: [],
  canGoBack: true,
};

const backFor = (canGoBack) => buildOptions({ ...screen, canGoBack }).list.find((o) => o.value === 'back');

describe('going back is always something she can ask for', () => {
  it('is on the list even when there is nowhere to go back to', () => {
    expect(backFor(false)).toBeTruthy();
  });

  it('says so in its own words, so Neo can tell her plainly', () => {
    expect(backFor(false).description).toMatch(/nowhere to go back/i);
  });

  it('says no such thing when there really is somewhere to go', () => {
    expect(backFor(true).description).not.toMatch(/nowhere to go back/i);
  });

  it('carries her phrasings either way', () => {
    for (const canGoBack of [true, false]) {
      expect(backFor(canGoBack).description).toMatch(/go back/i);
    }
  });

  it('still points at the same action either way', () => {
    expect(backFor(false).act).toEqual(backFor(true).act);
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
