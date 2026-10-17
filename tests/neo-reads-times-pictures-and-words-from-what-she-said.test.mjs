// The picker chooses the action and its thread; the details come from her own
// words and are checked here (plans/neo-decisions.md, Codex's review: "use
// choices for action and target selection, then validated parameters for
// arbitrary snooze times, reply content and image subsets"). Each case is a
// way she has actually talked to Neo, or its near miss.
import { describe, expect, it } from 'vitest';
import { laterFrom, picturesFrom, replyFrom } from '../shared/neo-params.mjs';

const NOW = new Date('2026-10-16T15:00:00').getTime();
const at = (s) => new Date(s).getTime();

describe('how long to put a thread off', () => {
  it.each([
    ['snooze this thread for ten minutes', NOW + 10 * 60_000],
    ['snooze it for 10 minutes', NOW + 10 * 60_000],
    ['later, in half an hour', NOW + 30 * 60_000],
    ['put it off for two hours', NOW + 2 * 3600_000],
    ['remind me in an hour', NOW + 3600_000],
    ['snooze it until tomorrow', at('2026-10-17T08:00:00')],
    ['tomorrow at 9', at('2026-10-17T09:00:00')],
    ['until 4pm', at('2026-10-16T16:00:00')],
    ['this evening', at('2026-10-16T18:00:00')],
    ['next week', at('2026-10-19T08:00:00')],
  ])('"%s"', (said, ts) => {
    expect(laterFrom(said, NOW)?.ts).toBe(ts);
  });

  it('a time already gone today means tomorrow', () => {
    expect(laterFrom('until 9am', NOW)?.ts).toBe(at('2026-10-17T09:00:00'));
  });

  it('says nothing when no time was said, rather than guessing one', () => {
    expect(laterFrom('snooze this', NOW)).toBeNull();
    expect(laterFrom('later', NOW)).toBeNull();
  });

  it('carries words to say it back', () => {
    expect(laterFrom('snooze it for ten minutes', NOW).label).toBe('in 10 minutes');
  });
});

describe('which pictures', () => {
  it.each([
    ['compare one and three', 3, [1, 3]],
    ['show designs 1 and 3 side by side', 4, [1, 3]],
    ['compare the first and second', 3, [1, 2]],
    ['compare them all', 3, [1, 2, 3]],
    ['compare all of them', 5, [1, 2, 3, 4]],
    ['compare two, three and four', 4, [2, 3, 4]],
  ])('"%s" of %i', (said, count, want) => {
    expect(picturesFrom(said, count)).toEqual(want);
  });

  it('leaves out numbers the thread does not have', () => {
    expect(picturesFrom('compare one and seven', 3)).toEqual([1]);
  });

  it('with no number named, compares the first two', () => {
    expect(picturesFrom('compare them', 3)).toEqual([1, 2]);
  });
});

describe('what to send', () => {
  it('sends what she said to send, not the instruction around it', () => {
    expect(replyFrom('Tell the agent the picture stayed up after snoozing.').text).toBe('The picture stayed up after snoozing.');
    expect(replyFrom('Put this in the chat as feedback: Neo opened the wrong thread.').text).toBe('Neo opened the wrong thread.');
    expect(replyFrom('Reply saying looks good, ship it.').text).toBe('Looks good, ship it.');
  });

  it('keeps her words as she said them otherwise', () => {
    expect(replyFrom('The orb should be able to go higher on the screen.').text).toBe('The orb should be able to go higher on the screen.');
  });

  it('sends her screenshot unless she says not to, and does not send those words', () => {
    expect(replyFrom('Tell it the card is too dark.').attach).toBe(true);
    const r = replyFrom('Tell it the card is too dark, without the screenshot.');
    expect(r).toEqual({ text: 'The card is too dark.', attach: false });
  });
});
