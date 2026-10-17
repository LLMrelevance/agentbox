// TURNING THE CLOUD ON STARTS TWO CLOUD RUNS AT A TIME, NOT TEN.
//
// What broke (2026-10-17): she pressed C by accident, the cloud came on with
// Everything, and the app hung for minutes; Cmd+Q did nothing and only a force
// quit closed it. Read off the code that day: one tick could start up to ten
// cloud runs together (`maxCloudSessions`), and each run's proxy packs the task
// folder, up to 100 MB of documents and the transcript (the launch film's is
// 278 MB) into memory before it sends them, on a Mac that is already full.
//
// Now at most two cloud runs are being packed and sent at once; the next one
// starts when one of them has its agent running. Runs already going in the
// cloud do not count.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

const dirs = [];
afterEach(() => { while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true }); });
const make = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-starting-'));
  dirs.push(root);
  const sup = new Supervisor(
    { storeRoot: root, home: root, maxConcurrentSessions: 3, authProfiles: ['default'], cloudRuns: 'all' },
    { listItems: () => [], listProducts: () => [], isDue: () => true },
    root,
  );
  sup._cloudReady = () => true;
  return sup;
};
const add = (sup, id, extra) => sup.sessions.set(id, { itemId: id, engine: 'claude', cloud: true, child: { kill() {} }, tail: [], ...extra });

describe('cloud runs starting', () => {
  it('leave room while fewer than two are being packed', () => {
    const sup = make();
    expect(sup._cloudSlotFor('claude')).toBe(true);
    add(sup, 'w-1', {});
    expect(sup._cloudSlotFor('claude')).toBe(true);
  });

  it('take no third until one of them has its agent running', () => {
    const sup = make();
    add(sup, 'w-1', {});
    add(sup, 'w-2', {});
    expect(sup._cloudStarting()).toBe(2);
    expect(sup._cloudSlotFor('claude')).toBe(false);
    sup.sessions.get('w-1').sessionId = 's-1';
    expect(sup._cloudSlotFor('claude')).toBe(true);
  });

  // Watched on her Mac that evening: with Everything on and two cloud runs
  // starting, the next thread started on the Mac instead of waiting its turn.
  it('with Everything, the next thread waits its turn rather than starting on this Mac', () => {
    const sup = make();
    const product = { slug: 'p', dir: '/nowhere', repoPath: '/r' };
    const item = { id: 'w-next', product: 'p' };
    add(sup, 'w-1', {});
    add(sup, 'w-2', {});
    expect(sup._localSlotFor('claude')).toBe(true);
    expect(sup._whereToRun({ item, product, cwd: '/r/.claude/worktrees/w-next', engine: 'claude' })).toBe(null);
    // A thread that may not go to the cloud starts here as before.
    sup.threadOnMac['w-next'] = true;
    expect(sup._whereToRun({ item, product, cwd: '/r/.claude/worktrees/w-next', engine: 'claude' })).toBe('local');
    // And with "when this Mac is full", this Mac comes first anyway.
    delete sup.threadOnMac['w-next'];
    sup.config.cloudRuns = null;
    expect(sup._whereToRun({ item, product, cwd: '/r/.claude/worktrees/w-next', engine: 'claude' })).toBe('local');
  });

  it('do not count runs already going, or runs on this Mac', () => {
    const sup = make();
    for (let i = 0; i < 5; i += 1) add(sup, `w-run-${i}`, { sessionId: `s-${i}` });
    sup.sessions.set('w-mac', { itemId: 'w-mac', engine: 'claude', cloud: false, child: { kill() {} }, tail: [] });
    expect(sup._cloudStarting()).toBe(0);
    expect(sup._cloudSlotFor('claude')).toBe(true);
  });
});
