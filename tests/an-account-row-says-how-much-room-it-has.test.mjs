// AN ACCOUNT ROW SAYS HOW MUCH ROOM IT HAS, AND A CLOUD ROW SAYS IT IS THE CLOUD'S.
//
// What broke (2026-10-16): Settings named one login at the top of Usage and
// listed the rest under Signed in with nothing but their plan, so with the work
// login at 5% and the Gmail one at 100% nothing on the page said which had
// room. And the cloud's own logins, the ones cloud runs actually used, were not
// on the Claude Code page at all.
import { describe, it, expect } from 'vitest';
import { cloudAccountState, cloudPlaceLine, hourWords, sessionUse } from '../renderer/src/account-words.ts';

const at = (h, m = 0) => new Date(2026, 9, 16, h, m).getTime();
const session = (percent, extra = {}) => ({ span: 'session', qualifier: null, name: 'This session', percent, resetsText: null, resetsOn: null, resetsAt: null, zone: null, ...extra });

describe('a login on this Mac', () => {
  it('her case: the full one says so and when it is back', () => {
    expect(sessionUse([session(100, { resetsText: '5:09pm' })])).toBe('100% of this session used, back at 5:09pm');
  });

  it('one with room says only how much is used', () => {
    expect(sessionUse([session(5, { resetsText: '8pm' })])).toBe('5% of this session used');
    expect(sessionUse([session(99, { resetsText: '8pm' })])).toBe('99% of this session used');
  });

  it('a reset known only as a moment is printed as a clock', () => {
    expect(sessionUse([session(100, { resetsAt: at(17, 10) })])).toBe('100% of this session used, back at 5:10pm');
  });

  it('must NOT make up a number: no reading, or only a weekly one, says nothing', () => {
    expect(sessionUse(null)).toBeNull();
    expect(sessionUse([{ ...session(40), span: 'week' }])).toBeNull();
  });
});

describe('a login in the cloud', () => {
  const a = (extra) => ({ engine: 'claude', key: 'a1', name: null, ready: true, ...extra });

  it('her case: at its limit until 5:10pm', () => {
    expect(cloudAccountState(a({ state: 'limited', limitedUntil: at(17, 10) }), at(15, 30))).toBe('At its limit, back at 5:10pm');
  });

  it('a limit that has passed reads as ready', () => {
    expect(cloudAccountState(a({ state: 'ready', limitedUntil: at(17, 10) }), at(17, 11))).toBe('Ready');
  });

  it('a broken sign-in says where to fix it', () => {
    expect(cloudAccountState(a({ state: 'broken' }))).toMatch(/cloud menu/);
  });

  it('the first row says when threads go there and on which accounts', () => {
    expect(cloudPlaceLine({ mode: 'full' }, 2)).toBe('Threads start here when this computer is full, on these accounts in turn.');
    expect(cloudPlaceLine({ mode: 'all' }, 1)).toBe('Threads start here first, on this account.');
  });

  it('must NOT promise cloud runs while it is off', () => {
    expect(cloudPlaceLine({ mode: 'mac' }, 2)).toMatch(/^Off, so every thread runs on this computer/);
  });

  it('noon and midnight', () => {
    expect(hourWords(at(12))).toBe('12pm');
    expect(hourWords(at(0, 10))).toBe('12:10am');
  });
});
