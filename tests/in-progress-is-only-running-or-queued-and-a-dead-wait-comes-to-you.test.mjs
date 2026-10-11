// IN PROGRESS IS ONLY RUNNING OR QUEUED, AND A WAIT NOBODY IS MOVING IS YOURS
// (w-5244c90c33).
//
// What broke, 2026-10-11: two threads sat in In progress reading "waiting"
// for days, nothing running on either. "Launch video: Agentbox now runs every
// harness" waited on OpenCode and Hermes; Hermes waited on OpenCode and the
// engine interface. OpenCode and the engine interface are agent proposals,
// which sit in Later waiting for a yes. So the whole chain was parked on a
// person, and the only rows that said so were in a tab that promises
// something is moving. Their words: "they would be lost had i not found them.
// should never happen."
//
// Their three tabs, which this pins:
//   - In progress is either running or queued
//   - Needs you is things that need human eyes (or are stuck)
//   - Later is things happening later or that can be processed later
//
// So a wait is never In progress. A wait on a thread something is actually
// moving goes to Later, and comes back to Needs you by itself once that thread
// is finished. A wait on a thread nothing is moving is stuck, and is yours.
import { describe, it, expect } from 'vitest';
import { movingWaits, nextMove, stillWaitingOn } from '../renderer/src/next-move.ts';
import { belongsInInbox, belongsInProgress, belongsOnTheRail, waitsInLater } from '../renderer/src/list-rules.ts';

const NOW = 1_760_000_000_000;

const row = (id, over = {}) => ({
  id, status: 'open', kind: 'task', labels: [], createdAt: NOW - 86_400_000, updatedAt: NOW - 86_400_000, ...over,
});

// The four real shapes from the screenshot's store, ids shortened.
const engine = row('w-engine', { kind: 'refactor', parent: 'w-research' });            // a proposal: Later
const opencode = row('w-opencode', { kind: 'feature', parent: 'w-research' });        // a proposal: Later
const hermes = row('w-hermes', { status: 'blocked', parent: 'w-research', blockedBy: ['w-engine', 'w-opencode'], result: 'Nothing new to do.' });
const video = row('w-video', { status: 'blocked', kind: 'marketing', parent: 'w-research', blockedBy: ['w-opencode', 'w-hermes'], result: 'What do you want first?' });

const byIdOf = (...rows) => new Map(rows.map((r) => [r.id, r]));
const claimsFrom = ({ live = [], queued = [], shipping = [] } = {}) => (i) => ({
  now: NOW, live: live.includes(i.id), queued: queued.includes(i.id), shipping: shipping.includes(i.id),
});

// What the window hands each list: the claims, plus only the waits that move.
const placed = (i, byId, base = claimsFrom()) => {
  const c = { ...base(i), waitingOn: movingWaits(i, byId, base) };
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

  it('the blockers they name are still alive, so the old rule called both a wait', () => {
    expect(stillWaitingOn(hermes, byId)).toEqual(['w-engine', 'w-opencode']);
    expect(stillWaitingOn(video, byId)).toEqual(['w-opencode', 'w-hermes']);
  });

  it('but nothing is moving any of them, so neither wait counts', () => {
    expect(movingWaits(hermes, byId, claimsFrom())).toEqual([]);
    expect(movingWaits(video, byId, claimsFrom())).toEqual([]);
  });

  it('so both are in Needs you, and not in In progress', () => {
    for (const i of [hermes, video]) {
      const p = placed(i, byId);
      expect(p.move).toBe('you');
      expect(p.inbox).toBe(true);
      expect(p.progress).toBe(false);
      expect(p.later).toBe(false);
    }
  });
});

describe('a wait on a thread that IS moving', () => {
  it('goes to Later while an agent is running the thread it waits on', () => {
    const byId = byIdOf(opencode, hermes);
    const base = claimsFrom({ live: ['w-opencode'] });
    expect(movingWaits(hermes, byId, base)).toEqual(['w-opencode']);
    const p = placed(hermes, byId, base);
    expect(p.move).toBe('thread');
    expect(p.later).toBe(true);
    expect(p.progress).toBe(false);
    expect(p.inbox).toBe(false);
    expect(p.rail).toBe(true);
  });

  it('goes to Later while the thread it waits on is queued for a worker', () => {
    const yours = row('w-yours', { labels: ['founder'] });   // your own task, waiting its turn
    const waiting = row('w-wait', { status: 'blocked', blockedBy: ['w-yours'] });
    const p = placed(waiting, byIdOf(yours, waiting));
    expect(p.move).toBe('thread');
    expect(p.later).toBe(true);
    expect(p.progress).toBe(false);
  });

  it('goes to Later while the app is shipping the thread it waits on', () => {
    const byId = byIdOf(opencode, hermes);
    expect(placed(hermes, byId, claimsFrom({ shipping: ['w-opencode'] })).later).toBe(true);
  });

  it('follows a chain: waiting on a thread that waits on a running one is moving', () => {
    const byId = byIdOf(engine, opencode, hermes, video);
    const base = claimsFrom({ live: ['w-engine'] });
    expect(movingWaits(video, byId, base)).toEqual(['w-hermes']);
    expect(placed(video, byId, base).later).toBe(true);
  });

  it('comes back to you the moment that thread is finished', () => {
    const doneOpencode = { ...opencode, status: 'done' };
    const byId = byIdOf(doneOpencode, hermes);
    const solo = { ...hermes, blockedBy: ['w-opencode'] };
    expect(placed(solo, byId).inbox).toBe(true);
  });
});

describe('what must never be called moving', () => {
  it('a thread waiting on one that sits in Needs you', () => {
    const asked = row('w-asked', { kind: 'question' });   // an open question, yours to answer
    const waiting = row('w-wait', { status: 'blocked', blockedBy: ['w-asked'] });
    expect(placed(waiting, byIdOf(asked, waiting)).inbox).toBe(true);
  });

  it('a thread waiting on one you put away until later', () => {
    const put = row('w-put', { labels: ['founder'], runAt: NOW + 3_600_000, wrote: { runAt: { ts: NOW, source: 'founder' } } });
    const waiting = row('w-wait', { status: 'blocked', blockedBy: ['w-put'] });
    const base = (i) => ({ now: NOW, hiddenUntil: i.id === 'w-put' ? NOW + 3_600_000 : 0 });
    expect(placed(waiting, byIdOf(put, waiting), base).inbox).toBe(true);
  });

  it('two threads waiting on each other, with nothing running', () => {
    const a = row('w-a', { status: 'blocked', blockedBy: ['w-b'] });
    const b = row('w-b', { status: 'blocked', blockedBy: ['w-a'] });
    const byId = byIdOf(a, b);
    expect(movingWaits(a, byId, claimsFrom())).toEqual([]);
    expect(placed(a, byId).inbox).toBe(true);
    expect(placed(b, byId).inbox).toBe(true);
  });

  it('a thread the window cannot see', () => {
    const waiting = row('w-wait', { status: 'blocked', blockedBy: ['w-gone'] });
    expect(placed(waiting, byIdOf(waiting)).inbox).toBe(true);
  });
});

describe('In progress still holds what is running or queued', () => {
  it('a running thread, a queued task of yours and a ship in flight', () => {
    const yours = row('w-yours', { labels: ['founder'] });
    expect(belongsInProgress(yours, { now: NOW })).toBe(true);
    expect(belongsInProgress(row('w-x', { status: 'blocked' }), { now: NOW, live: true })).toBe(true);
    expect(belongsInProgress(row('w-x', { status: 'blocked' }), { now: NOW, shipping: true })).toBe(true);
  });

  it('and a waiting thread is in exactly one list', () => {
    const byId = byIdOf(opencode, hermes);
    for (const base of [claimsFrom(), claimsFrom({ live: ['w-opencode'] })]) {
      const p = placed(hermes, byId, base);
      expect([p.inbox, p.progress, p.later].filter(Boolean)).toHaveLength(1);
    }
  });
});
