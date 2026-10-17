// From the 3 minutes of talk on 2026-10-17 02:55.
//
// An agent's option read "Build it, and approve w-ce8c1a9275 so 'I already
// have it' really works". Neo read the id aloud, and kept reading it through
// four interruptions:
//
//   neo: ...also approve W-ce
//   you: Yeah
//   neo: 8c1a9275.
//   you: Don't Yeah, hello
//   neo: Yeah. It's W-ce
//   you: Yeah, but
//   neo: 8c
//   you: I don't
//   neo: 1a9275.
//   you: Stop. Stop talking
//
// And then said it once more after that: "also approve w-ce8c1a9275."
//
// An id is for the app to act on, never for a person to hear. `spoken` already
// names a picture instead of spelling a link out; it does the same for an id.
import { describe, expect, it } from 'vitest';
import { spoken } from '../renderer/src/neo/bridge.ts';
import { neoSession } from '../shared/neo-tools.mjs';

describe('an id is never read aloud', () => {
  it('takes the id out of the option that caused this', () => {
    const said = spoken("Build it, and approve w-ce8c1a9275 so \"I already have it\" really works");
    expect(said).not.toMatch(/ce8c1a9275/);
    expect(said).toMatch(/Build it, and approve .* really works/);
  });

  it('handles a thread id on its own, and a repeat run id', () => {
    expect(spoken('Blocked by w-e217e577e5')).not.toMatch(/e217e577e5/);
    expect(spoken('See r-0d6c38b457-20261015 for yesterday')).not.toMatch(/0d6c38b457/);
  });

  it('says something a person can hear in its place', () => {
    expect(spoken('approve w-ce8c1a9275')).toMatch(/thread/i);
  });

  it('takes out every id in a sentence, not just the first', () => {
    const said = spoken('w-aaaaaaaaaa blocks w-bbbbbbbbbb');
    expect(said).not.toMatch(/aaaaaaaaaa|bbbbbbbbbb/);
  });

  // The case that must NOT match: ordinary words and real hyphenated text.
  it('leaves ordinary words alone', () => {
    for (const s of ['a well-known fix', 'the x-axis label', 'read-only mode', 'e-mail the agent', 'add a 10-minute snooze']) {
      expect(spoken(s)).toBe(s);
    }
  });

  it('still names a picture and unwraps a link, as it always did', () => {
    expect(spoken('![a chart](x.png)')).toBe('[picture: a chart]');
    expect(spoken('[the page](http://x)')).toBe('the page');
  });
});

describe('and the voice is told so too', () => {
  it('says never to read an id out', () => {
    expect(neoSession({}).instructions).toMatch(/never read (an|a thread) id|ids out loud|never say an id/i);
  });
});
