// THE WINDOW'S STATE REQUEST READS THE THREADS ONCE.
//
// What broke (2026-10-19): with the cloud on, every key she pressed lagged.
// A CPU profile of the running app put 20% of the main process in the
// window's state request (`zero:snapshot`), and most of that in
// `Supervisor#status`, which asked the store for every thread in every
// project seven times over, each one read, folded and copied again: stalled,
// scheduled, queued, waiting on a sign-in, waiting on a limit, shipping and
// silent, each with its own `listItems`.
//
// Now one state request reads them once.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

describe('one state request', () => {
  it('asks the store for its threads once', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'status-once-'));
    let asked = 0;
    const item = (id, extra = {}) => ({ id, product: 'p', title: id, status: 'open', priority: 5, createdAt: 1, updatedAt: 1, wrote: {}, ...extra });
    const store = {
      listItems: () => { asked += 1; return [item('w-1'), item('w-2', { answer: 'go', wrote: { answer: { ts: 2, source: 'founder' } } }), item('w-3', { runAt: Date.now() + 3600_000 })]; },
      listProducts: () => [{ slug: 'p', name: 'P', dir: root }],
      isDue: (i) => !(i.runAt > Date.now()),
    };
    const sup = new Supervisor({ storeRoot: root, home: root, maxConcurrentSessions: 3, authProfiles: ['default'] }, store, root, root, root);
    const out = sup.status();
    expect(asked).toBe(1);
    expect(out.scheduled).toContain('w-3');
  });
});


// The same profile: every state request also walked Codex's session log
// folders for the last usage figure it wrote down.
describe('the Codex usage the corner draws, when nothing has pushed one', () => {
  it('is read off Codex\'s log at most every half minute', async () => {
    const { CodexUsage } = await import('../main/codex-usage.mjs');
    let now = 1_000_000; let reads = 0;
    const u = new CodexUsage({ home: () => '/h', now: () => now, readLog: () => { reads += 1; return null; } });
    u.read(); u.read(); now += 10_000; u.read();
    expect(reads).toBe(1);
    now += 25_000; u.read();
    expect(reads).toBe(2);
  });
});

// The same profile: the outside agents' check looked for each live session's
// transcript, and a session whose transcript is not under ~/.claude (hers live
// under another profile's folder) sent it through every one of the 10,429
// folders there, for every session, every time it measured.
describe('an outside agent\'s transcript that is not there', () => {
  it('is looked for through every folder once a minute, not on every measure', async () => {
    const { vi } = await import('vitest');
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-home-'));
    for (let i = 0; i < 50; i += 1) fs.mkdirSync(path.join(home, '.claude', 'projects', `-p${i}`), { recursive: true });
    const was = process.env.HOME;
    process.env.HOME = home;
    try {
      const agents = await import('../main/agents.mjs');
      const listed = vi.spyOn(fs, 'readdirSync');
      agents.__readHistory('no-such-session', '/somewhere/else');
      agents.__readHistory('no-such-session', '/somewhere/else');
      agents.__readHistory('no-such-session', '/somewhere/else');
      const looks = listed.mock.calls.filter(([d]) => String(d).endsWith(path.join('.claude', 'projects'))).length;
      listed.mockRestore();
      expect(looks).toBe(1);
    } finally {
      process.env.HOME = was;
    }
  });
});
