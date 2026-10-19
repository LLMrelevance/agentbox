// From her 9 minutes with Neo on 2026-10-17, measured against the live
// service with scripts/scratch/neo-exact-words.mjs.
//
// She said: "let's go back to the Jarvis task 'cause that's basically where I
// give all the feedback... if you can please add that feedback to the agent,
// that'd be great." Neo opened a thread and stopped: "Okay. Switching over to
// add that. I'm back, but I couldn't..." On the same words the backend model
// opened the thread and never sent anything in 3 of 5 live runs. One ask with
// two halves is both halves.
//
// And on talking: Neo read the options out as a list ("Three options: Option…
// option one- rows with cloud login and usage details, then review. Option
// two-") until she cut in twice, and then spoke into her pause ("neo: What?").
// She also heard Neo claim work it was only passing on: "Okay, I'll add
// screenshot sharing."
import { describe, expect, it } from 'vitest';
import { neoSession } from '../shared/neo-tools.mjs';

const session = neoSession({});
const voice = session.instructions;
const backend = neoSession({ engine: 'tools' }).delegation.responses.instructions;

describe('an ask with two halves', () => {
  it('tells the backend to carry on and send after it has opened the thread', () => {
    expect(backend).toMatch(/open[^.]*then[^.]*repl|carry on|do both|same turn/i);
  });

  it('tells the voice not to say it could not when it only stopped halfway', () => {
    expect(voice).toMatch(/both|carry on|until it is done/i);
  });
});

describe('how Neo talks', () => {
  // Not "never read the options" any more. On 2026-10-17 she asked for the
  // opposite for artifacts — "can you show me them one by one as you go, as
  // you explain the options" — so Neo goes through them one at a time and the
  // app puts each up as it is named. What is still true is that it stops
  // there rather than reading everything out.
  it('says to go through pictures one at a time as it names them', () => {
    expect(voice).toMatch(/one at a time/i);
    expect(voice).toMatch(/never read long text verbatim/i);
  });

  it('still says to tell her what the decision is', () => {
    expect(voice).toMatch(/what they need to decide/i);
  });

  it('says not to speak into a pause or ask what she meant', () => {
    expect(voice).toMatch(/pause/i);
  });

  it('says to pass her words on, not to claim the work as its own', () => {
    expect(voice).toMatch(/passing it on|pass it on|not yours to do|never say you will/i);
  });
});
