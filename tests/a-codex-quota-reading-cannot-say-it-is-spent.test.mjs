// THE PANEL CANNOT SAY "YOU ARE OUT", BECAUSE THE FIELD THAT SAYS SO IS DROPPED
// (w-36c51443df).
//
// MEASURED 2026-10-09 on codex-cli 0.160.0. A real `codex app-server` on her
// own `~/.codex`, one real turn, and the `account/rateLimits/updated` push
// caught at `onNotification` -- the one channel main/codex-usage.mjs draws the
// corner from. Repeat with `node scripts/qa-codex-live.mjs usage`.
//
//   { "rateLimits": {
//       "limitId": "codex", "limitName": null, "normalModelSlug": null,
//       "primary": { "usedPercent": 49, "windowDurationMins": 10080,
//                    "resetsAt": 1792001987 },
//       "secondary": null,
//       "credits": { "hasCredits": false, "unlimited": false, "balance": "0" },
//       "individualLimit": null,
//       "spendControlReached": null,
//       "planType": "prolite",
//       "rateLimitReachedType": null } }
//
// `shared/codex-usage.mjs` reads `primary` and `secondary`. The other eight
// fields are thrown away, and two of them are the only things in the payload
// that could ever say the limit has been REACHED rather than merely be a
// percentage near a hundred. `planType` is the plan, which the corner has no
// way to name. `credits` says she is carrying a balance of "0", so there is
// nothing behind the weekly window when it goes.
//
// AND A PERCENTAGE CANNOT STAND IN FOR IT, which is the point of the rounding
// test below: 99.6% draws as "100%", so "100%" does not mean spent and nothing
// means spent.
//
// These are TRIPWIRES. They pin what is read and what is dropped, so that the
// moment somebody widens the reader this file fails and says what the widening
// was for. The fix is filed rather than taken here.
import { describe, expect, it } from 'vitest';
import { codexLimits, mergeRateLimits, windowSpan } from '../shared/codex-usage.mjs';

/** The payload above, verbatim, as the live push delivered it. */
const MEASURED = Object.freeze({
  limitId: 'codex',
  limitName: null,
  normalModelSlug: null,
  primary: { usedPercent: 49, windowDurationMins: 10080, resetsAt: 1792001987 },
  secondary: null,
  credits: { hasCredits: false, unlimited: false, balance: '0' },
  individualLimit: null,
  spendControlReached: null,
  planType: 'prolite',
  rateLimitReachedType: null,
});

describe('what the corner is given, out of what arrived', () => {
  it('draws the weekly window the push really carried', () => {
    expect(codexLimits(MEASURED)).toEqual([{
      span: 'week',
      qualifier: null,
      name: 'This week',
      percent: 49,
      resetsText: null,
      resetsOn: null,
      resetsAt: 1792001987000,
      zone: null,
    }]);
  });

  it('draws one line and not two, because the five-hour window is never sent', () => {
    // `secondary: null` on every record of hers on disk and on every live push
    // caught. Not a bug in this file -- a fact about this plan -- but it means
    // the corner's second line is dead code on this account.
    expect(MEASURED.secondary).toBeNull();
    expect(codexLimits(MEASURED)).toHaveLength(1);
    expect(codexLimits(MEASURED)[0].span).toBe('week');
    expect(windowSpan(10080)).toEqual(['week', 'This week']);
  });

  it('keeps nothing that could say the limit has been reached', () => {
    // THE DEFECT, PINNED. Every window in the reading is a span and a
    // percentage; there is no field for "spent", because the two the provider
    // sends for it never arrive here.
    const drawn = codexLimits(MEASURED);
    const fields = Object.keys(drawn[0]).sort();
    expect(fields).toEqual(['name', 'percent', 'qualifier', 'resetsAt', 'resetsOn', 'resetsText', 'span', 'zone']);
    expect(fields).not.toContain('reached');
    expect(fields).not.toContain('plan');
    expect(fields).not.toContain('credits');
  });

  it('cannot name her plan, though the push did', () => {
    expect(MEASURED.planType).toBe('prolite');
    const drawn = JSON.stringify(codexLimits(MEASURED));
    expect(drawn).not.toContain('prolite');
  });

  it('cannot say there are no credits behind the window, though the push did', () => {
    expect(MEASURED.credits).toEqual({ hasCredits: false, unlimited: false, balance: '0' });
    const drawn = JSON.stringify(codexLimits(MEASURED));
    expect(drawn).not.toContain('credits');
    expect(drawn).not.toContain('balance');
  });

  it('would draw the very same line if the provider said the limit was reached', () => {
    // The whole of the consequence in one assertion: a payload that differs
    // ONLY in the two fields that mean "you are out" produces an identical
    // reading. There is no state the corner can enter that says so.
    const spent = { ...MEASURED, rateLimitReachedType: 'primary', spendControlReached: true };
    expect(codexLimits(spent)).toEqual(codexLimits(MEASURED));
  });
});

describe('the percentage at the top of its range', () => {
  const week = (used) => codexLimits({ primary: { used_percent: used, window_minutes: 10080, resets_at: 1792001987 } })[0].percent;

  it('says a hundred before a hundred is spent', () => {
    // 99.6% of a weekly window still has work left in it, and the corner calls
    // it 100%. So "100%" is not a reading anybody may act on, and the honest
    // signal has to come from `rateLimitReachedType` instead.
    expect(week(99)).toBe(99);
    expect(week(99.4)).toBe(99);
    expect(week(99.6)).toBe(100);
    expect(week(100)).toBe(100);
  });

  it('never draws a figure outside nought to a hundred', () => {
    // Clamping is right and stays right: a provider that over- or under-reports
    // must not put an impossible number on her screen.
    expect(week(120)).toBe(100);
    expect(week(-5)).toBe(0);
    expect(week(0)).toBe(0);
  });
});

describe('a rolling update folds in rather than replacing', () => {
  it('keeps the week when a push carries only the shorter window', () => {
    // Measured behaviour this campaign relied on: her weekly figure survived
    // every push, and the pushes never carried a secondary at all.
    const first = mergeRateLimits(null, MEASURED);
    expect(first.primary.usedPercent).toBe(49);
    const onlyShort = mergeRateLimits(first, { secondary: { usedPercent: 3, windowDurationMins: 300, resetsAt: 1 } });
    expect(onlyShort.primary.usedPercent).toBe(49);
    expect(onlyShort.secondary.usedPercent).toBe(3);
  });

  it('keeps both when a push carries neither', () => {
    const both = mergeRateLimits(MEASURED, { secondary: { usedPercent: 3, windowDurationMins: 300, resetsAt: 1 } });
    const empty = mergeRateLimits(both, {});
    expect(empty.primary.usedPercent).toBe(49);
    expect(empty.secondary.usedPercent).toBe(3);
  });
});
