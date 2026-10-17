// Dragging the orb (tests/neo-lets-go-of-the-orb-when-the-button-comes-up.test.mjs).
// Moving the window under the pointer can lose the release on macOS, so any
// move with the button up, a cancelled pointer or a lost focus also ends the
// drag. Moves go out once a frame, the newest one.

type Point = { screenX: number; screenY: number; buttons: number };
type Send = (phase: 'start' | 'move' | 'end', dx?: number, dy?: number) => void;

export function orbDrag({ send, sleep, frame = (fn) => requestAnimationFrame(fn) }: {
  send: Send;
  // A press that does not move is the click that sends Neo to sleep.
  sleep: () => void;
  frame?: (fn: () => void) => void;
}) {
  let press: { x: number; y: number; moved: boolean } | null = null;
  let pending: { dx: number; dy: number } | null = null;
  let queued = false;

  const flush = () => {
    queued = false;
    if (!press || !pending) return;
    send('move', pending.dx, pending.dy);
    pending = null;
  };
  const finish = (click: boolean) => {
    if (!press) return;
    const moved = press.moved;
    if (pending) { send('move', pending.dx, pending.dy); pending = null; }
    press = null;
    if (moved) send('end');
    else if (click) sleep();
    else send('end');
  };

  return {
    down(e: Point) {
      press = { x: e.screenX, y: e.screenY, moved: false };
      pending = null;
      send('start');
    },
    move(e: Point) {
      if (!press) return;
      if (!(e.buttons & 1)) return finish(false);
      const dx = e.screenX - press.x, dy = e.screenY - press.y;
      if (!press.moved && Math.hypot(dx, dy) < 4) return;
      press.moved = true;
      pending = { dx, dy };
      if (!queued) { queued = true; frame(flush); }
    },
    up: () => finish(true),
    cancel: () => finish(false),
    blur: () => finish(false),
    dragging: () => !!press?.moved,
    pressed: () => !!press,
  };
}
