// From the 6 minutes of talk on 2026-10-17 01:42, the worst of it.
//
// Neo asked "What should it say?". She answered "I just told you what it
// should say" — a complaint about Neo, not a message for the agent. The
// Decisions API picked reply (0.41), replyFrom took the whole sentence, and
// the app sent it. Then it did the same again (0.78). Her words:
//
//   "No, no, no, no. Stop that [breath] You- You wrote, I just told you what
//    it should say. That's not what I wanted."
//
// A sentence aimed AT Neo, correcting it or telling it to stop, is never the
// body of a message to an agent. There is nothing to send, so Neo asks.
import { describe, expect, it } from 'vitest';
import { replyFrom } from '../shared/neo-params.mjs';

describe('words aimed at Neo are not a message', () => {
  for (const said of [
    'I just told you what it should say',
    "That's not what I wanted",
    'No, no, no, no. Stop that',
    'you wrote, I just told you what it should say',
    'that is not what I asked',
    'no, never mind',
    'stop talking',
    "you didn't do so",
  ]) {
    it(`has nothing to send in ${JSON.stringify(said)}`, () => {
      expect(replyFrom(said).text).toBe('');
    });
  }
});

describe('what she does want sent still goes', () => {
  for (const [said, want] of [
    ['tell it the four decibel quieter version wins', 'The four decibel quieter version wins.'],
    ['reply saying I like the full screen version', 'I like the full screen version.'],
    ['tell it it can do whatever it thinks is best. It has full autonomy', 'It can do whatever it thinks is best. It has full autonomy.'],
  ]) {
    it(`sends ${JSON.stringify(want)}`, () => {
      expect(replyFrom(said).text).toBe(want);
    });
  }

  // The boundary either side: a message that merely mentions her stopping
  // something, or says "no" about the work rather than to Neo, still sends.
  it('still sends a message that is about the work, not about Neo', () => {
    expect(replyFrom('tell it no, the crash part is too dramatic').text).toBe('No, the crash part is too dramatic.');
  });

  it('still sends when she says stop as part of the instruction to the agent', () => {
    expect(replyFrom('tell it to stop working on the video').text).toBe('To stop working on the video.');
  });
});
