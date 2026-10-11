// THE SUMMARY SAYS WHAT A THREAD WAITS ON, AND ONLY WHEN IT WAITS
// (w-5244c90c33).
//
// What broke, 2026-10-11: two threads sat in In progress reading "waiting"
// and nothing on screen said what they were waiting for. The panel's
// "Blocked by" and "Blocks" rows were taken out on 2026-10-01 because they
// drew on every thread, empty or not. Their words now: "make this clear in
// the bottom-right corner of the summaries: say what task is the dependency",
// and "Tasks without dependencies should not show 'dependency,' 'blocked by,'
// or 'blocking' on the summary component because that would get far too
// cluttered for no reason."
//
// So the rows are conditional: Blocked by lists the threads this one waits on
// that are still open, Blocking lists the open threads that wait on this one,
// and a thread with neither draws neither.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dependencies } from '../renderer/src/threads/summary-rules.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const row = (id, over = {}) => ({ id, product: 'p', title: id, status: 'open', ...over });

// The real chain from the screenshot, ids shortened.
const opencode = row('w-opencode', { label: 'OpenCode harness implementation' });
const engine = row('w-engine', { label: 'Unified harness engine interface' });
const hermes = row('w-hermes', { status: 'blocked', label: 'Hermes harness integration', blockedBy: ['w-engine', 'w-opencode'] });
const video = row('w-video', { status: 'blocked', title: 'Launch video: Agentbox now runs every harness', blockedBy: ['w-opencode', 'w-hermes'] });
const items = [opencode, engine, hermes, video];
const names = (links) => links.map((l) => l.title);

describe('a thread in the middle of a chain', () => {
  it('names what it is blocked by and what it is blocking, by the name the list uses', () => {
    const d = dependencies(hermes, items);
    expect(names(d.blockedBy)).toEqual(['Unified harness engine interface', 'OpenCode harness implementation']);
    expect(names(d.blocking)).toEqual(['Launch video: Agentbox now runs every harness']);
  });

  it('hands back the thread itself, so a press can open it', () => {
    expect(dependencies(video, items).blockedBy[0].item).toBe(opencode);
  });
});

describe('the root of the chain', () => {
  it('is blocking both threads that wait on it, and blocked by nothing', () => {
    const d = dependencies(opencode, items);
    expect(d.blockedBy).toEqual([]);
    expect(names(d.blocking)).toEqual(['Hermes harness integration', 'Launch video: Agentbox now runs every harness']);
  });

  it('also counts a thread named in its own blocks list', () => {
    const lone = row('w-lone');
    const d = dependencies({ ...engine, blocks: ['w-lone'] }, [...items, lone]);
    expect(names(d.blocking)).toEqual(['Hermes harness integration', 'w-lone']);
  });

  it('never lists one thread twice when both sides wrote the link', () => {
    const d = dependencies({ ...engine, blocks: ['w-hermes'] }, items);
    expect(names(d.blocking)).toEqual(['Hermes harness integration']);
  });
});

describe('what must not show', () => {
  it('a thread with no links draws neither row', () => {
    const d = dependencies(row('w-plain'), items);
    expect(d.blockedBy).toEqual([]);
    expect(d.blocking).toEqual([]);
  });

  it('a blocker that is finished is not a dependency any more', () => {
    const d = dependencies(hermes, [{ ...engine, status: 'done' }, opencode, hermes]);
    expect(names(d.blockedBy)).toEqual(['OpenCode harness implementation']);
  });

  it('a waiting thread that is finished is not blocked any more', () => {
    expect(dependencies(opencode, [opencode, { ...hermes, status: 'done' }]).blocking).toEqual([]);
  });

  it('a finished thread is blocking nothing', () => {
    expect(dependencies({ ...opencode, status: 'done' }, items).blocking).toEqual([]);
  });

  it('a thread this window cannot see, or one naming itself', () => {
    expect(dependencies(row('w-x', { blockedBy: ['w-gone', 'w-x'] }), items).blockedBy).toEqual([]);
  });
});

describe('the panel draws the rows only when they have something in them', () => {
  const panel = fs.readFileSync(path.join(root, 'renderer', 'src', 'threads', 'Summary.tsx'), 'utf8');

  it('guards each row on its own list', () => {
    expect(panel).toMatch(/links\.blockedBy\.length > 0 && <>/);
    expect(panel).toMatch(/links\.blocking\.length > 0 && <>/);
    expect(panel).toMatch(/>Blocked by</);
    expect(panel).toMatch(/>Blocking</);
  });
});
