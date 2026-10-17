// "I tried to drag the orb around, and then it just kept moving with my
// mouse, even though I kept clicking away. I think I got the scroll wheel of
// death briefly, and things lagged" (2026-10-17). Two causes in the drag:
// - It ended only on the release event. Moving the window under the pointer
//   can lose that event on macOS, and then every move dragged the orb.
// - Every pointer move moved the window and told the main window what the
//   orb covered, so a drag sent dozens of redraws a second to the app.
import { describe, expect, it, vi } from 'vitest';
import { orbDrag } from '../renderer/src/neo/orb-drag.ts';

function setup() {
  const sent = [];
  const frames = [];
  const sleep = vi.fn();
  const d = orbDrag({ send: (...a) => sent.push(a), sleep, frame: (fn) => frames.push(fn) });
  const flush = () => { while (frames.length) frames.shift()(); };
  const at = (x, y, buttons = 1) => ({ screenX: x, screenY: y, buttons });
  return { d, sent, sleep, flush, at };
}

describe('the drag ends whenever the button is up', () => {
  it('a move with the button up ends it, even with no release event', () => {
    const t = setup();
    t.d.down(t.at(100, 100));
    t.d.move(t.at(150, 100));
    t.flush();
    t.d.move(t.at(300, 300, 0));
    t.flush();
    expect(t.sent.at(-1)).toEqual(['end']);
    expect(t.d.dragging()).toBe(false);
    t.d.move(t.at(400, 400, 0));
    t.flush();
    expect(t.sent.filter(([p]) => p === 'move')).toHaveLength(1);
  });

  it('a cancelled pointer or the window losing focus ends it', () => {
    for (const end of ['cancel', 'blur']) {
      const t = setup();
      t.d.down(t.at(100, 100));
      t.d.move(t.at(150, 100));
      t.d[end]();
      expect(t.sent.at(-1)).toEqual(['end']);
      expect(t.d.dragging()).toBe(false);
    }
  });

  it('a press that does not move is still the click that sends Neo to sleep', () => {
    const t = setup();
    t.d.down(t.at(100, 100));
    t.d.up();
    expect(t.sleep).toHaveBeenCalledTimes(1);
    expect(t.sent.filter(([p]) => p === 'end')).toEqual([]);
  });

  it('a lost release never counts as a click', () => {
    const t = setup();
    t.d.down(t.at(100, 100));
    t.d.move(t.at(101, 100, 0));
    expect(t.sleep).not.toHaveBeenCalled();
  });
});

describe('moves are sent once a frame, the newest one', () => {
  it('many moves between frames send one, with the latest distance', () => {
    const t = setup();
    t.d.down(t.at(100, 100));
    for (let x = 105; x <= 200; x += 5) t.d.move(t.at(x, 120));
    t.flush();
    expect(t.sent.filter(([p]) => p === 'move')).toEqual([['move', 100, 20]]);
  });

  it('the last move is sent before the end', () => {
    const t = setup();
    t.d.down(t.at(100, 100));
    t.d.move(t.at(160, 100));
    t.d.up();
    expect(t.sent.slice(-2)).toEqual([['move', 60, 0], ['end']]);
  });
});

// Same session, 03:31: a reply on JARVIS moved the inbox to the next task, and
// "go to the previous thread" got "There is no thread to go back to." Just
// after a reply the app hides that thread while the reply can be undone, so it
// was in no list Neo searched. Replayed against the bridge, back worked once
// the thread could be found (scripts/scratch/neo/back-probe.mjs).
describe('going back to a thread the app is hiding for a moment', async () => {
  const { neoBridge } = await import('../renderer/src/neo/bridge.ts');
  it('finds it among every thread the app has', async () => {
    const J = { id: 'w-j', product: 'p', title: 'JARVIS' };
    const C = { id: 'w-c', product: 'p', title: 'Card grading' };
    let focused = J;
    const open = vi.fn(async (r) => { focused = r; });
    const act = neoBridge({
      rows: () => [C], threadsAnywhere: () => [C], threadById: (id) => [J, C].find((r) => r.id === id) ?? null,
      focused: () => focused, outside: () => false, options: () => [], summary: () => '', projects: () => [],
      open, pick: vi.fn(), reply: vi.fn(), close: vi.fn(), compose: vi.fn(), undo: vi.fn(), glow: vi.fn(),
    });
    await act('get_screen', {});
    focused = C;
    expect(await act('go_back', {})).toMatchObject({ ok: true });
    expect(open).toHaveBeenCalledWith(J);
  });
});

// Measured while tracing it: the app's every-thread list never reached the
// bridge, so a thread outside Needs you could not be found at all.
describe('the app hands Neo every thread it knows', () => {
  it('useNeo passes the whole list and the lookup by id through', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../renderer/src/neo/useNeo.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/threadsAnywhere: \(\) => latest\.current\.threadsAnywhere/);
    expect(src).toMatch(/threadById: \(id\) => latest\.current\.threadById/);
  });
});

// Same session: "every time she opens a new task, there's this image in the
// corner for no apparent reason ... This particular image didn't even exist."
// The file was missing, the thread drew its path, and Neo put that up.
describe('only pictures that drew are Neo\'s to show', async () => {
  const { drew } = await import('../renderer/src/neo/show.ts');
  it.each([
    [{ complete: true, naturalWidth: 0 }, false],
    [{ complete: false, naturalWidth: 0 }, false],
    [{ complete: true, naturalWidth: 1200 }, true],
  ])('%j drew: %s', (img, want) => {
    expect(drew(img)).toBe(want);
  });
});
