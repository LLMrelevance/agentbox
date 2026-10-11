// A WAITING THREAD IS IN LATER, NEVER IN PROGRESS (w-5244c90c33).
//
// What broke, 2026-10-11: two threads sat in In progress reading "waiting"
// for days, nothing running on either. "Launch video: Agentbox now runs every
// harness" waited on OpenCode and Hermes; Hermes waited on OpenCode and the
// engine interface. Their words: "they would be lost had i not found them.
// should never happen", and the tabs as they mean them:
//   - In progress is either running or queued
//   - Needs you is things that need human eyes (or are stuck)
//   - Later is things happening later or that can be processed later
//
// And on the second round: "something that's waiting should be logically in
// the backlog and then it should automatically resume without the user
// needing to know otherwise." So every wait is in Later, and the supervisor
// puts a worker back on it when what it waits on finishes
// (tests/a-waiting-thread-resumes-by-itself-when-what-it-waits-on-finishes).
//
// The one wait that can never end is a loop of threads waiting on each other.
// Nothing would ever resume it, so in Later it would be lost: it is yours.
import { describe, it, expect } from 'vitest';
import { nextMove, stillWaitingOn, waitsThatCanEnd } from '../renderer/src/next-move.ts';
import { belongsInInbox, belongsInProgress, belongsOnTheRail, waitsInLater } from '../renderer/src/list-rules.ts';

const NOW = 1_760_000_000_000;

const row = (id, over = {}) => ({
  id, status: 'open', kind: 'task', labels: [], createdAt: NOW - 86_400_000, updatedAt: NOW - 86_400_000, ...over,
});

// The four real shapes from the screenshot's store, ids shortened.
const engine = row('w-engine', { kind: 'refactor', parent: 'w-research' });
const opencode = row('w-opencode', { kind: 'feature', parent: 'w-research' });
const hermes = row('w-hermes', { status: 'blocked', parent: 'w-research', blockedBy: ['w-engine', 'w-opencode'], result: 'Nothing new to do.' });
const video = row('w-video', { status: 'blocked', kind: 'marketing', parent: 'w-research', blockedBy: ['w-opencode', 'w-hermes'], result: 'What do you want first?' });

const byIdOf = (...rows) => new Map(rows.map((r) => [r.id, r]));

// What the window hands each list.
const placed = (i, byId, claims = {}) => {
  const c = { now: NOW, ...claims, waitingOn: waitsThatCanEnd(i, byId) };
  return {
    move: nextMove(i, c),
    inbox: belongsInInbox(i, c),
    progress: belongsInProgress(i, c),
    later: waitsInLater(i, c),
    rail: belongsOnTheRail(i, c),
  };
};

describe('the two threads from the screenshot', () => {
  const byId = byIdOf(engine, opencode, hermes, video);

  it('both wait on threads that are still open', () => {
    expect(waitsThatCanEnd(hermes, byId)).toEqual(['w-engine', 'w-opencode']);
    expect(waitsThatCanEnd(video, byId)).toEqual(['w-opencode', 'w-hermes']);
  });

  it('so both are in Later, and in neither In progress nor Needs you', () => {
    for (const i of [hermes, video]) {
      const p = placed(i, byId);
      expect(p.move).toBe('thread');
      expect(p.later).toBe(true);
      expect(p.progress).toBe(false);
      expect(p.inbox).toBe(false);
      expect(p.rail).toBe(true);
    }
  });

  it('whether or not anything is running the thread it waits on', () => {
    expect(placed(hermes, byId).later).toBe(true);
    expect(placed(hermes, byIdOf(engine, { ...opencode, status: 'claimed' }, hermes)).later).toBe(true);
  });
});

describe('when the wait is over', () => {
  it('a wait whose blockers are all finished is a wait no longer', () => {
    const byId = byIdOf({ ...engine, status: 'done' }, { ...opencode, status: 'done' }, hermes);
    expect(waitsThatCanEnd(hermes, byId)).toEqual([]);
    expect(placed(hermes, byId).later).toBe(false);
  });

  it('one finished blocker out of two still waits on the other', () => {
    const byId = byIdOf({ ...engine, status: 'done' }, opencode, hermes);
    expect(waitsThatCanEnd(hermes, byId)).toEqual(['w-opencode']);
    expect(placed(hermes, byId).later).toBe(true);
  });
});

describe('what must not wait in Later', () => {
  it('two threads waiting on each other, which nothing will ever resume', () => {
    const a = row('w-a', { status: 'blocked', blockedBy: ['w-b'] });
    const b = row('w-b', { status: 'blocked', blockedBy: ['w-a'] });
    const byId = byIdOf(a, b);
    expect(stillWaitingOn(a, byId)).toEqual(['w-b']);
    expect(waitsThatCanEnd(a, byId)).toEqual([]);
    expect(placed(a, byId).inbox).toBe(true);
    expect(placed(b, byId).inbox).toBe(true);
  });

  it('a longer loop, three threads round', () => {
    const a = row('w-a', { status: 'blocked', blockedBy: ['w-b'] });
    const b = row('w-b', { status: 'blocked', blockedBy: ['w-c'] });
    const c = row('w-c', { status: 'blocked', blockedBy: ['w-a'] });
    expect(placed(a, byIdOf(a, b, c)).inbox).toBe(true);
  });

  it('but a loop with a way out still waits, on the way out', () => {
    const a = row('w-a', { status: 'blocked', blockedBy: ['w-b'] });
    const b = row('w-b', { status: 'blocked', blockedBy: ['w-a', 'w-root'] });
    const root = row('w-root', { labels: ['founder'] });
    expect(placed(a, byIdOf(a, b, root)).later).toBe(true);
  });

  it('a thread the window cannot see', () => {
    const waiting = row('w-wait', { status: 'blocked', blockedBy: ['w-gone'] });
    expect(placed(waiting, byIdOf(waiting)).inbox).toBe(true);
  });

  it('a wait you put away until later is in your schedule, which beats the wait', () => {
    const p = placed(hermes, byIdOf(engine, opencode, hermes), { hiddenUntil: NOW + 3_600_000 });
    expect(p.move).toBe('clock');
  });

  it('a waiting thread a session is on is In progress, because something is running', () => {
    const p = placed(hermes, byIdOf(engine, opencode, hermes), { live: true });
    expect(p.progress).toBe(true);
    expect(p.later).toBe(false);
  });
});

describe('In progress still holds what is running or queued', () => {
  it('a running thread, a queued task of yours and a ship in flight', () => {
    expect(belongsInProgress(row('w-yours', { labels: ['founder'] }), { now: NOW })).toBe(true);
    expect(belongsInProgress(row('w-x', { status: 'blocked' }), { now: NOW, live: true })).toBe(true);
    expect(belongsInProgress(row('w-x', { status: 'blocked' }), { now: NOW, shipping: true })).toBe(true);
  });

  it('and a waiting thread is in exactly one list', () => {
    const p = placed(hermes, byIdOf(engine, opencode, hermes));
    expect([p.inbox, p.progress, p.later].filter(Boolean)).toHaveLength(1);
  });
});
