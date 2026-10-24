// THE GLASS OUTGREW THE TRAY (w-93b3a1a796, 2026-10-23). On the founder's
// screen the Mac's glass behind the tray was the size for her 1920-point
// screen (66 by 40 points) while the page drew the tag at the size for her
// 1080-point one (58 by 34), so a dark box stuck out past the tag's right and
// bottom edges. The glass only ever moves when the page reports a new size,
// and the page only reports when its ResizeObserver fires; a page that
// redraws while its window is hidden can show a size it never reported.
// Driving the real code through leaving and coming back, new threads, the
// list, drags between her two screens, resizing and a screen change, in
// visible and hidden windows, kept the two within 0.3 points every time, so
// the gap is not reproduced here. What is pinned is the repair: every time
// the tray comes up, the page is asked to measure again and the glass takes
// that, and a report without a rectangle never keeps an old one.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cornerTagRig } from './helpers/corner-tag-rig.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = fs.readFileSync(path.join(root, 'renderer/src/corner-tag/main.tsx'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'main/corner-tag-preload.cjs'), 'utf8');

const T = 1_000_000_000;
const NEW = (at) => ({ ready: [{ id: `w-${at}`, title: 'Pricing page', says: 'is ready for you', since: at }], working: 2 });
const measures = (w) => w.sent.filter((s) => s[0] === 'corner-tag:measure').length;
function glass() {
  const calls = [];
  return { calls, set: (win, rect, opts) => calls.push([win.part, rect, opts]), clear: () => {}, tone: () => 'dark' };
}

describe('the tray measures itself again whenever it comes up', () => {
  it('asks the page to measure when the tray shows, and again each time it comes back', () => {
    const r = cornerTagRig({ at: T, glass: glass(), config: { cornerTagLookedAt: T - 1 } });
    r.hand(NEW(T));
    r.pageUp('tag', { width: 95, height: 69, glass: { x: 14, y: 14, width: 66, height: 40 }, radius: 8.6 });
    expect(r.win().visible).toBe(true);
    const first = measures(r.win());
    expect(first).toBeGreaterThanOrEqual(1);
    r.enterApp();
    expect(r.win().visible).toBe(false);
    r.leaveApp();
    r.advance(60_000);
    r.hand(NEW(r.clock()));
    expect(r.win().visible).toBe(true);
    expect(measures(r.win())).toBe(first + 1);
  });

  it('does not ask while the tray stays hidden', () => {
    const r = cornerTagRig({ at: T, glass: glass(), focused: true });
    r.hand(NEW(T - 1000));
    r.leaveApp();
    expect(r.windows).toHaveLength(0);
  });

  it('puts the glass where the new measurement says, however big the last one was', () => {
    const g = glass();
    const r = cornerTagRig({ at: T, glass: g, config: { cornerTagLookedAt: T - 1 } });
    r.hand(NEW(T));
    r.pageUp('tag', { width: 95, height: 69, glass: { x: 14, y: 14, width: 66, height: 40 }, radius: 8.6 });
    r.call('corner-tag:size', { part: 'tag', width: 81, height: 58, glass: { x: 12, y: 12, width: 56, height: 34 }, radius: 7.3 });
    expect(g.calls.at(-1)[1]).toEqual({ x: 12, y: 12, width: 56, height: 34 });
  });

  it('never keeps an old rectangle when a measurement comes without one', () => {
    const g = glass();
    const r = cornerTagRig({ at: T, glass: g, config: { cornerTagLookedAt: T - 1 } });
    r.hand(NEW(T));
    r.pageUp('tag', { width: 95, height: 69, glass: { x: 14, y: 14, width: 66, height: 40 }, radius: 8.6 });
    r.call('corner-tag:size', { part: 'tag', width: 81, height: 58 });
    const [, rect] = g.calls.at(-1);
    expect(rect).not.toEqual({ x: 14, y: 14, width: 66, height: 40 });
    expect(rect.x + rect.width).toBeLessThanOrEqual(81 - rect.x);
    expect(rect.y + rect.height).toBeLessThanOrEqual(58 - rect.y);
  });
});

describe('the page answers', () => {
  it('measures again when asked, and whenever it becomes visible', () => {
    expect(bridge).toMatch(/onMeasure: listen\('corner-tag:measure'\)/);
    expect(page).toMatch(/onMeasure\?\.\(report\)/);
    expect(page).toMatch(/visibilitychange/);
  });
});
