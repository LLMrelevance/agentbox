// SWITCHING ACCOUNTS AT A LIMIT STARTS THE THREADS THE CLOUD WAS HOLDING.
//
// Reported 2026-10-26 (w-ef0997d135): a work login hit its usage limit, so the
// person switched this Mac to their other login, ticked the stuck threads and
// pressed Resume. Nothing moved, and every new thread sat at "Queued" too,
// while threads that cannot go to the cloud (teammates) read "Working
// locally" in the same list.
//
// Read off the code: with the cloud set to Everything, a thread waits for a
// cloud slot, and the cloud runs on the account picked here only when that
// account is signed in to the cloud; otherwise it takes its first account.
// With the new login not signed in there, that is the capped work login. So
// the switch moved this Mac and not the cloud, every cloud-bound thread
// waited for a limit on an account nobody had
// picked, the rows said "Queued" rather than that, and Resume said "waiting
// for a slot". The report's own thread hit the cloud's limit at 5:04pm and
// was queued from 5:07pm to 5:40pm, about the thirty minutes a cloud limit
// with no reset hour sits out.
//
// Now the cloud's limit holds a thread only when the cloud is on the account
// picked here; otherwise the thread runs here, on that account. A thread the
// limit does hold says "At its limit" with its time, and Resume says so.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { recordCloudLogin, markCloudLogin } from '../main/cloud/logins.mjs';
import { forgetDiscovery } from '../main/account-discovery.mjs';
import { statusCell } from '../renderer/src/status-word.ts';
import { cloudFootLine } from '../renderer/src/cloud-menu.ts';
import { resumedLine, resumedStoppedLine } from '../renderer/src/resume-says.ts';

const dirs = [];
const noCloud = process.env.AGENTBOX_CLOUD_CONFIG;
afterEach(() => {
  while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true });
  forgetDiscovery?.();
  process.env.AGENTBOX_CLOUD_CONFIG = noCloud;
});

let stamped = Date.now();
const signIn = (file, email, org, uuid) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ oauthAccount: { emailAddress: email, accountUuid: uuid, organizationUuid: org } }));
  const t = new Date(stamped += 2_000);
  fs.utimesSync(file, t, t);
};

// A Mac with two logins: work (the default folder) and personal. The cloud
// has the work login only, at its limit for the next hour.
function setUp({ picked, cloudLimited = true, items = [] } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'switch-at-limit-'));
  dirs.push(home);
  const personal = path.join(home, '.claude-2');
  signIn(path.join(home, '.claude.json'), 'work@example.test', 'org-work', 'uuid-work');
  signIn(path.join(personal, '.claude.json'), 'personal@example.test', 'org-personal', 'uuid-personal');
  fs.mkdirSync(path.join(home, '.agentbox'), { recursive: true });
  fs.writeFileSync(path.join(home, '.agentbox', 'cloud.json'), JSON.stringify({ gateway: 'https://cloud.example.test' }));
  process.env.AGENTBOX_CLOUD_CONFIG = path.join(home, '.agentbox', 'cloud.json');
  recordCloudLogin('claude', 'cloud-work', { id: 'id-work', savedAt: 1, org: 'org-work' }, { home });
  const until = Date.now() + 3_600_000;
  if (cloudLimited) markCloudLogin('claude', 'cloud-work', 'id-work', { limitedUntil: until }, { home });
  const product = { slug: 'p', dir: home, repoPath: '/r' };
  const answered = [];
  const store = {
    listItems: () => items,
    listProducts: () => [product],
    isDue: () => true,
    answerItem: (_p, id, patch) => answered.push({ id, ...patch }),
  };
  const sup = new Supervisor({
    storeRoot: home, home, maxConcurrentSessions: 3, authProfiles: ['default', personal],
    cloudRuns: 'all', activeAccount: { claude: picked === 'personal' ? personal : 'default' },
  }, store, home);
  sup._cloudVersionGaps = () => [];
  const started = [];
  sup._spawnResume = (item) => started.push(item.id);
  return { sup, product, personal, until, started };
}

const thread = { id: 'w-looms', product: 'p', status: 'open', labels: ['founder'], title: 'AI personalized Looms' };
const cwd = '/r/.claude/worktrees/w-looms';

describe('the cloud account at its limit is not the one picked here', () => {
  it('the reported case: a thread bound for the cloud runs here, on the login you switched to', () => {
    const { sup, product, personal } = setUp({ picked: 'personal' });
    expect(sup._profilesFor('claude')).toEqual([personal]);
    expect(sup._waitsForCloud(thread, 'claude')).toBe(false);
    expect(sup._roomFor('claude', thread)).toBe(true);
    expect(sup._whereToRun({ item: thread, product, cwd, engine: 'claude' })).toBe('local');
    expect(sup._pickProfile('claude')).toBe(personal);
  });

  it('Resume starts the threads you ticked', () => {
    const { sup, started } = setUp({ picked: 'personal', items: [thread] });
    const out = sup.resumeItems([thread.id]);
    expect(out).toMatchObject({ resumed: 1, queued: 0, limited: 0 });
    expect(started).toEqual([thread.id]);
  });

  it('nothing says it is held, and the card says why it runs here', () => {
    const { sup, product } = setUp({ picked: 'personal' });
    expect(sup._waitingOnLimit([thread])).toEqual({});
    expect(sup._whyLocal({ item: thread, product, engine: 'claude' })).toEqual({ why: 'cloud-account-limited' });
  });

  it('the cloud menu says threads run on this Mac until then', () => {
    const { sup, until } = setUp({ picked: 'personal' });
    const cloud = sup.cloudStatus();
    expect(cloud.limitHolds).toBe(false);
    expect(cloudFootLine(cloud, Date.now())).toMatch(/Threads run on this Mac until then\.$/);
    expect(until).toBeGreaterThan(Date.now());
  });
});

// THE BOUNDARY: the cloud is on the account picked here, so its limit is
// that account's own, and running here would hit the same limit.
describe('the cloud account at its limit is the one picked here', () => {
  it('the thread still waits for the cloud, as it did', () => {
    const { sup, product } = setUp({ picked: 'work' });
    expect(sup._waitsForCloud(thread, 'claude')).toBe(true);
    expect(sup._roomFor('claude', thread)).toBe(false);
    expect(sup._whereToRun({ item: thread, product, cwd, engine: 'claude' })).toBe('cloud-wait');
    expect(cloudFootLine(sup.cloudStatus(), Date.now())).toMatch(/Threads wait for the cloud until then\.$/);
  });

  it('and it says "At its limit" with the time, not "Queued"', () => {
    const { sup, until } = setUp({ picked: 'work' });
    const held = sup._waitingOnLimit([thread]);
    expect(held).toEqual({ [thread.id]: { tool: 'Claude Code in the cloud', until } });
    const cell = statusCell(thread, { queued: [thread.id], atLimit: held, inProgress: true, now: Date.now() });
    expect(cell.word).toBe('At its limit');
    expect(cell.title).toMatch(/^Claude Code in the cloud is at its usage limit, so this starts on its own when it resets at /);
  });

  it('Resume says the threads wait for the limit, not for a slot', () => {
    const { sup, until, started } = setUp({ picked: 'work', items: [thread] });
    const out = sup.resumeItems([thread.id]);
    expect(out).toMatchObject({ resumed: 0, queued: 1, limited: 1, limitedUntil: until });
    expect(started).toEqual([]);
    expect(resumedLine(out, Date.now())).toMatch(/^1 starts when the usage limit resets at \d{1,2}:\d{2}[ap]m$/);
    // Under the thread's title the line has about forty characters.
    expect(resumedLine(out, Date.now(), { titled: true })).toMatch(/^At its usage limit until \d{1,2}:\d{2}[ap]m$/);
  });

  it('a row that is not open, or already running, is not said to be held', () => {
    const { sup } = setUp({ picked: 'work' });
    expect(sup._waitingOnLimit([{ ...thread, status: 'done' }])).toEqual({});
    sup.sessions.set(thread.id, { itemId: thread.id, engine: 'claude', tail: [] });
    expect(sup._waitingOnLimit([thread])).toEqual({});
  });
});

// THE CASE THAT MUST NOT MATCH: a cloud account with room takes the thread,
// whichever account is picked here, exactly as before.
describe('the cloud account is not at its limit', () => {
  it('the thread goes to the cloud', () => {
    const { sup, product } = setUp({ picked: 'personal', cloudLimited: false });
    expect(sup._waitsForCloud(thread, 'claude')).toBe(false);
    expect(sup._whereToRun({ item: thread, product, cwd, engine: 'claude' })).toBe('cloud');
    expect(sup._waitingOnLimit([thread])).toEqual({});
    expect(sup.cloudStatus().limitHolds).toBe(null);
  });
});

describe('what Resume says', () => {
  const at = new Date(2026, 9, 26, 17, 34).getTime();
  const now = at - 20 * 60_000;
  it('names the threads that started, the ones waiting for a slot, and the ones waiting for a limit', () => {
    expect(resumedLine({ resumed: 2, queued: 0, limited: 0 }, now)).toBe('2 resumed');
    expect(resumedLine({ resumed: 0, queued: 3, limited: 0 }, now)).toBe('3 waiting for a slot');
    expect(resumedLine({ resumed: 1, queued: 3, limited: 3, limitedUntil: at }, now)).toBe('1 resumed, 3 start when the usage limit resets at 5:34pm');
    expect(resumedLine({ resumed: 0, queued: 4, limited: 2, limitedUntil: at }, now)).toBe('2 waiting for a slot, 2 start when the usage limit resets at 5:34pm');
    expect(resumedLine({ resumed: 0, queued: 1, limited: 1, limitedUntil: 0 }, now)).toBe('1 starts when the usage limit resets');
  });
  it('says nothing moved when nothing did', () => {
    expect(resumedLine({ resumed: 0, queued: 0, working: 2 }, now)).toBe('Already working on it');
    expect(resumedLine({ resumed: 0, queued: 0 }, now)).toBe('Nothing to resume');
  });

  // "Resume interrupted agents" said "Nothing stranded" over threads a limit held.
  it('Resume interrupted agents names the threads a limit holds, of the ones asked about', () => {
    const atLimit = { 'w-a': { tool: 'Claude Code in the cloud', until: at }, 'w-b': { tool: 'Claude Code in the cloud', until: at } };
    expect(resumedStoppedLine({ cleared: 0, atLimit }, null, now)).toBe('2 start when the usage limit resets at 5:34pm');
    expect(resumedStoppedLine({ cleared: 0, atLimit }, ['w-b', 'w-c'], now)).toBe('1 starts when the usage limit resets at 5:34pm');
    expect(resumedStoppedLine({ cleared: 0, atLimit }, ['w-c'], now)).toBe('Nothing stranded. Anything waiting respawns on its own');
    expect(resumedStoppedLine({ cleared: 2, atLimit }, null, now)).toBe('Resuming: 2 interrupted agents respawning');
  });
});
