// AN ACCOUNT AT ITS LIMIT KEEPS ITS METERS.
//
// What broke (2026-10-23, w-ee98015b79): on the Claude Code page a second
// account at its limit drew "At its limit. Agents start again on their own
// when it resets." in place of its Session and Week meters, so the page hid
// the two things you look at an account at its limit for: which limit it is
// and when it resets. Measured in the fixtures' two-account world: the reading
// for that account was there (session 100%, back at 5:09pm; week 15%) and
// the tile drew none of it. Asked for: "It should just show 100% of whatever".
//
// A model-only weekly limit ("This week, Fable") can be the full one while
// Session and Week have room, so a full one is drawn as a meter of its own.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PlaceTiles, accountTile } from '../renderer/src/components/Settings';
import { meterPair } from '../renderer/src/account-words.ts';

const NOW = new Date(2026, 9, 23, 15, 30).getTime();
const at = (h, m = 0) => new Date(2026, 9, 23, h, m).getTime();
const AT_LIMIT = 'At its limit. Agents start again on their own when it resets.';
const session = (percent, extra = {}) => ({ span: 'session', qualifier: null, name: 'This session', percent, resetsText: null, resetsOn: null, resetsAt: at(17, 9), zone: null, ...extra });
const week = (percent, extra = {}) => ({ ...session(percent), span: 'week', name: 'This week', qualifier: 'all models', resetsAt: new Date(2026, 9, 29, 16).getTime(), ...extra });

const here = (extra = {}) => ({ profile: 'p2', email: 'second@example.test', plan: 'Max 20x', chosen: false, signedIn: true, trouble: AT_LIMIT, atLimit: true, dir: '/Users/x/.claude-2', ...extra });
const account = (extra = {}) => ({ key: 'p2', name: 'second@example.test', plan: 'Max 20x', here: here(), cloud: null, limits: [session(100), week(15)], checkedAt: NOW - 60_000, usageError: null, ...extra });
const tile = (a) => accountTile(a, { many: true, now: NOW, onUse: vi.fn() });
const draw = (t) => renderToStaticMarkup(React.createElement(PlaceTiles, { accounts: [t], now: NOW }));
const meters = (html) => [...html.matchAll(/<span class="acct-meter( full)?">.*?<span class="acct-meter-word">(.*?)<\/span>.*?<span class="acct-meter-pct">(.*?)<\/span><span class="acct-meter-when"[^>]*>(.*?)<\/span><\/span>/g)]
  .map(([, full, word, pct, when]) => `${word} ${pct} ${when}${full ? ' (full)' : ''}`);

describe('an account at its limit', () => {
  it('the reported case: its session is full, and the tile shows both meters and when each resets', () => {
    const html = draw(tile(account()));
    expect(meters(html)).toEqual(['Session 100% 5:09pm (full)', 'Week 15% Thu Oct 29, 4pm']);
    expect(html).not.toContain('Agents start again');
  });

  it('a full week shows the same way, with the session that still has room', () => {
    expect(meters(draw(tile(account({ limits: [session(30), week(100)] }))))).toEqual(['Session 30% 5:09pm', 'Week 100% Thu Oct 29, 4pm (full)']);
  });

  it('keeps the sentence when there is no reading to show', () => {
    const html = draw(tile(account({ limits: null, checkedAt: null })));
    expect(html).toContain(AT_LIMIT);
    expect(html).not.toContain('No usage reading yet');
  });

  it('still says it is at its limit when the meters it has do not show it', () => {
    const t = tile(account({ limits: [session(40), week(60)] }));
    expect(meters(draw(t))).toEqual(['Session 40% 5:09pm', 'Week 60% Thu Oct 29, 4pm']);
    expect(t.about).toEqual(['At its limit']);
  });

  it('must NOT say it is at its limit beside a meter that already does', () => {
    expect(tile(account()).about).toEqual([]);
  });

  it('must NOT trade a sentence that needs your hands for meters', () => {
    const out = 'Signed out. In a terminal run CLAUDE_CONFIG_DIR=~/.claude-2 claude, then type /login.';
    const html = draw(tile(account({ here: here({ trouble: out, atLimit: false }) })));
    expect(html).toContain('Signed out.');
    expect(meters(html)).toEqual([]);
  });
});

describe('a model-only weekly limit', () => {
  it('a full one is drawn after Session and Week, under its model’s name', () => {
    expect(meterPair([session(10), week(60), week(100, { qualifier: 'Fable', name: 'This week, Fable' })], NOW).map((m) => `${m.word} ${m.percent}`))
      .toEqual(['Session 10', 'Week 60', 'Fable 100']);
  });

  it('must NOT be drawn while it has room, at 99%', () => {
    expect(meterPair([session(10), week(60), week(99, { qualifier: 'Fable' })], NOW).map((m) => m.word)).toEqual(['Session', 'Week']);
  });

  it('must NOT be drawn from a window that has already reset', () => {
    expect(meterPair([session(10), week(60), week(100, { qualifier: 'Fable', resetsAt: at(15) })], NOW).map((m) => m.word)).toEqual(['Session', 'Week']);
  });
});
