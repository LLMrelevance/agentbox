// A LIMIT ON ONE LOGIN LANDED ON THE WRONG ROW, PARKED THE TASK, AND RESET
// SEVEN HOURS LATE. Measured 2026-10-16 off ~/Zero/.zero-supervisor.json and
// the real home folder, three faults in one incident (w-4338a63da6).
//
// 1. THE WRONG ROW. Trouble is filed per FOLDER and the Accounts page lists one
//    row per SUBSCRIPTION (`effectiveProfiles` drops a second folder holding an
//    account it already has). ~/.claude-3 and ~/.claude hold one subscription,
//    accountUuid 8fe4a357; the limit was filed on ~/.claude-3, which is on no
//    row, so it was drawn nowhere, while that subscription's row went on
//    showing an "organization has turned Claude Code off" filed five days
//    earlier on ~/.claude. The newest fact about the account was the invisible
//    one.
//
// 2. THE PARKED TASK. The limit benched the login until its reset -- and then
//    `liftBrakeForHer`, which runs on every reply, Resume and reopened row,
//    zeroed that bench. Measured in the state file: ~/.claude-3 carried
//    at-limit with a resetsAt of 2026-10-17T07:10Z and a cooldown of 0. A
//    cooldown of 0 is a live login, so `_pickProfile` handed it the next spawn
//    and `_profileCannotHoldAChat` kept the chat on it, with two astral.now
//    logins idle. Her hand resets a sign-in; it does not reset a usage limit.
//
// 3. THE HOUR. Claude Code printed "resets 12:10am (UTC)" and the zone was
//    thrown away: `limitResetMoment` read 12:10am as a local clock time, so on
//    a Mac set to Pacific the fleet waited until 07:10Z, seven hours late.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { readSettings } from '../main/settings.mjs';
import { forgetDiscovery } from '../main/account-discovery.mjs';
import { limitResetsAt, limitResetMoment, deadRunSentence } from '../shared/spawn-trouble.mjs';

// The line Claude Code printed on the login that hit the limit, copied off the
// run that started this.
const LIMIT = "You've hit your session limit · resets 12:10am (UTC)";
// 3:15pm PDT on 2026-10-16, the moment it printed.
const FROM = Date.UTC(2026, 9, 16, 22, 15, 2);

/* =================== 3. the hour, in the zone it printed ================== */

describe('the hour a limit names is read in the zone the CLI printed', () => {
  it('reads "(UTC)" as UTC, not as this Mac s clock', () => {
    expect(limitResetMoment(LIMIT, FROM)).toBe(Date.UTC(2026, 9, 17, 0, 10));
  });

  // The boundary on the near side: a zoned hour still ahead of `from` on the
  // same UTC day is today's, not tomorrow's.
  it('does not roll a zoned hour that has not passed yet into tomorrow', () => {
    expect(limitResetMoment("limit · resets 11:30pm (UTC)", FROM)).toBe(Date.UTC(2026, 9, 16, 23, 30));
  });

  // And the far side: asked again after midnight UTC, the same line names the
  // same minute rather than the next day's.
  it('still names the same minute when asked just before it', () => {
    const justBefore = Date.UTC(2026, 9, 17, 0, 5);
    expect(limitResetMoment(LIMIT, justBefore)).toBe(Date.UTC(2026, 9, 17, 0, 10));
  });

  it('honours an offset the CLI spells out', () => {
    expect(limitResetMoment("limit · resets 9:00am (UTC+2)", FROM)).toBe(Date.UTC(2026, 9, 17, 7, 0));
  });

  // THE CASE THAT MUST NOT MATCH. With no zone printed, the hour is this Mac's
  // own clock, which is what every line before this one meant and what every
  // other test here asserts.
  it('leaves an unzoned hour on the local clock', () => {
    const local = new Date(2026, 9, 16, 14, 10).getTime();
    expect(limitResetMoment('limit · resets 6pm', local)).toBe(new Date(2026, 9, 16, 18, 0).getTime());
  });

  // WHAT THE ROW SAYS, which has to name the same moment. "at 12:10am" on a
  // Pacific Mac is the one sentence on her screen about when work resumes.
  it('says the reset in this Mac s own words when the CLI named a zone', () => {
    const at = new Date(limitResetMoment(LIMIT, FROM));
    const hour = at.getHours() % 12 || 12;
    const mins = at.getMinutes();
    const expected = `${hour}${mins ? `:${String(mins).padStart(2, '0')}` : ''}${at.getHours() < 12 ? 'am' : 'pm'}`;
    expect(limitResetsAt(LIMIT, FROM)).toBe(expected);
  });

  it('quotes the CLI word for word when no zone was printed', () => {
    expect(limitResetsAt('limit · resets 6pm')).toBe('6pm');
  });
});

/* ================== 1. the limit shows on its own account ================= */

const signIn = (dir, email, uuid) => {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: email, accountUuid: uuid } }));
};

/** A Mac with one subscription in two folders and a second subscription in a
 *  third, which is the shape that produced the wrong row. */
const twoSubscriptionsInThreeFolders = () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'limit-rows-'));
  signIn(path.join(home, '.claude'), 'first@example.com', 'uuid-first');
  signIn(path.join(home, '.claude-3'), 'first@example.com', 'uuid-first');
  signIn(path.join(home, '.claude-2'), 'second@example.com', 'uuid-second');
  forgetDiscovery();
  const store = { listItems: () => [], listProducts: () => [], isDue: () => true };
  const config = {
    home, storeRoot: home, accountRoot: home, appDir: home,
    claudeBin: '/nonexistent/claude', maxConcurrentSessions: 3,
    authProfiles: ['default'], sessionArgs: [],
  };
  const supervisor = new Supervisor(config, store, home);
  return {
    home, supervisor,
    rows: () => readSettings({ config, supervisor, store }).workspace.accounts,
  };
};

describe('a limit shows on the login that hit it', () => {
  it('draws it on that subscription s row even when another folder of it ran', () => {
    const { home, supervisor, rows } = twoSubscriptionsInThreeFolders();
    supervisor._noteProfileTrouble('default', 'Your organization has disabled Claude subscription access for Claude Code');
    supervisor._profileTrouble.default.at = FROM - 5 * 86_400_000;
    supervisor._noteProfileTrouble(path.join(home, '.claude-3'), LIMIT);
    supervisor._profileTrouble[path.join(home, '.claude-3')].at = FROM;

    const mine = rows().find((r) => r.email === 'first@example.com');
    expect(mine.trouble?.cause).toBe('at-limit');
    expect(mine.trouble.note).toContain('At its limit');
  });

  // THE CASE THAT MUST NOT MATCH: the other subscription is fine and says so.
  it('leaves the other subscription alone', () => {
    const { home, supervisor, rows } = twoSubscriptionsInThreeFolders();
    supervisor._noteProfileTrouble(path.join(home, '.claude-3'), LIMIT);
    expect(rows().find((r) => r.email === 'second@example.com').trouble).toBe(null);
  });

  // The boundary on the other side: with nothing newer filed anywhere else, the
  // row goes on saying exactly what its own folder said.
  it('keeps the older reason when it is the only one', () => {
    const { supervisor, rows } = twoSubscriptionsInThreeFolders();
    supervisor._noteProfileTrouble('default', 'Your organization has disabled Claude subscription access for Claude Code');
    expect(rows().find((r) => r.email === 'first@example.com').trouble?.cause).toBe('org-blocked');
  });

  // And it is the NEWEST fact that wins, not whichever folder is listed: a row
  // whose own folder was marked after the unlisted one keeps its own.
  it('shows the newest of the two, whichever folder it was filed on', () => {
    const { home, supervisor, rows } = twoSubscriptionsInThreeFolders();
    supervisor._noteProfileTrouble(path.join(home, '.claude-3'), LIMIT);
    supervisor._profileTrouble[path.join(home, '.claude-3')].at = FROM - 86_400_000;
    supervisor._noteProfileTrouble('default', 'Your organization has disabled Claude subscription access for Claude Code');
    supervisor._profileTrouble.default.at = FROM;
    expect(rows().find((r) => r.email === 'first@example.com').trouble?.cause).toBe('org-blocked');
  });
});

/* ================== 2. the task moves to a login with room ================ */

const SECOND = '/Users/her/.claude-second';

const bare = (config = {}) => {
  const s = Object.create(Supervisor.prototype);
  s.config = {
    home: '/nonexistent-home-with-no-second-account',
    authProfiles: ['default', SECOND], codexProfiles: ['default'],
    maxConcurrentSessions: 3, ...config,
  };
  s._profileCooldown = {};
  s._profileStrikes = {};
  s._profileTrouble = {};
  s._saveState = () => {};
  return s;
};

const hitTheLimit = (s, profile = 'default') => s.noteExitForBackoff({
  engine: 'claude', profile, startedAt: Date.now() - 300_000,
  result: LIMIT, resultIsError: true, tail: [],
});

describe('a task leaves a login that has hit its limit', () => {
  it('benches the capped login until its reset', () => {
    const s = bare();
    hitTheLimit(s);
    expect(s._profileTrouble.default?.cause).toBe('at-limit');
    expect(s._profileResting('default')).toBe(true);
  });

  // THE ONE THAT WAS WRONG. Every reply, Resume and reopened row calls this,
  // and it threw the bench away, so the next spawn went straight back.
  it('keeps the bench when she replies, because her hand does not reset a limit', () => {
    const s = bare();
    hitTheLimit(s);
    s.liftBrakeForHer();
    expect(s._profileResting('default')).toBe(true);
    expect(s._pickProfile('claude')).toBe(SECOND);
    expect(s._profileCannotHoldAChat('default', 'claude')).toBe(true);
  });

  // THE CASE THAT MUST NOT MATCH, and it is the reason the lift exists: with
  // nowhere else to go, her hand still buys the row one try.
  it('lifts it when the capped login is the only one', () => {
    const s = bare({ authProfiles: ['default'] });
    hitTheLimit(s);
    s.liftBrakeForHer();
    expect(s._profileResting('default')).toBe(false);
  });

  // The boundary on the other side: a second login that is itself capped is
  // not somewhere with room, so the first one is lifted as it always was.
  it('lifts it when every login is capped', () => {
    const s = bare();
    hitTheLimit(s);
    hitTheLimit(s, SECOND);
    s.liftBrakeForHer();
    expect(s._profileResting('default')).toBe(false);
  });

  // A signed-out login is unchanged by any of this: her hand IS what mends it.
  it('still lifts a signed-out login when it is the only one', () => {
    const s = bare({ authProfiles: ['default'] });
    s.noteExitForBackoff({
      engine: 'claude', profile: 'default', startedAt: Date.now() - 1_000,
      result: 'Failed to authenticate: OAuth session expired', resultIsError: true, tail: [],
    });
    s.liftBrakeForHer();
    expect(s._profileResting('default')).toBe(false);
  });
});

describe('the row says where the work went', () => {
  /** The row the supervisor writes on when a run dies having said nothing. */
  const whatTheRowReads = (s) => {
    let wrote = null;
    s.store = { recordSessionResult: (product, id, patch) => { wrote = patch.result; return { wrote: { result: { ts: 1 } } }; } };
    s._fruitless = { 'p:w-1': { runs: 1 } };
    s._engineFor = () => 'claude';
    const session = { engine: 'claude', profile: 'default', result: LIMIT, resultIsError: true, tail: [] };
    s.noteExitForBackoff(session);
    s.sayTheRunDied({ id: 'w-1', product: 'p' }, session);
    return wrote;
  };

  // AND WHICH LOGIN EACH ONE IS (w-e1a42f6b21). With two subscriptions the
  // sentence named neither, so nothing said which was spent or which took the
  // task. These two have no readable email in this world, so they are named
  // the way the Settings page names a login the vendor would not name.
  it('tells her it is moving, and which login it is moving to', () => {
    const said = whatTheRowReads(bare());
    expect(said).toContain('usage limit on Claude account 1');
    expect(said).toContain('runs it again on Claude account 2, which has room');
  });

  // THE CASE THAT MUST NOT MATCH: one login, so the hour really is the answer.
  it('tells her the hour when that login is the only one', () => {
    const said = whatTheRowReads(bare({ authProfiles: ['default'] }));
    expect(said).toContain('starts again on its own at');
    expect(said).not.toContain('another account');
  });

  it('promises another account rather than an hour when one has room', () => {
    const said = deadRunSentence({ engineWord: 'Claude Code', cause: 'at-limit', resetsAt: '12:10am', elsewhere: true });
    expect(said).toContain('another account');
    expect(said).not.toContain('12:10am');
  });

  // THE CASE THAT MUST NOT MATCH: with nowhere else to go, the hour is the
  // only thing worth saying and it is still said.
  it('names the hour when there is nowhere else to go', () => {
    const said = deadRunSentence({ engineWord: 'Claude Code', cause: 'at-limit', resetsAt: '5:10pm' });
    expect(said).toContain('starts again on its own at 5:10pm');
  });
});
