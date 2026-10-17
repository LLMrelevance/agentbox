// Tap ⌘ twice to wake Neo. The key listener (main/neo/cmd-tap.swift) only
// reports what happened; this decides whether it was a double tap.
//
// Events: 'cmd-down', 'cmd-up', 'modifier' (any other modifier changed),
// 'other' (any other key went down), 'mouse' (a button went down).
// A tap is ⌘ down then up with nothing else in between and held briefly.
// Two taps close together make a double tap. Anything else in between,
// including a second modifier, spoils it, so ⌘C, ⌘V, ⌘⇧ and Wispr Flow's
// ⌘+Fn never wake Neo.

export const TAP_MAX_MS = 300;
export const GAP_MAX_MS = 350;

export function doubleTap() {
  let downAt = null;   // when the current ⌘ press started, if it is still clean
  let lastTapAt = null; // when the last clean tap ended

  return {
    feed(kind, at) {
      if (kind === 'cmd-down') {
        if (lastTapAt !== null && at - lastTapAt > GAP_MAX_MS) lastTapAt = null;
        downAt = at;
        return false;
      }
      if (kind === 'cmd-up') {
        if (downAt === null) return false;
        const clean = at - downAt <= TAP_MAX_MS;
        downAt = null;
        if (!clean) { lastTapAt = null; return false; }
        if (lastTapAt !== null) { lastTapAt = null; return true; }
        lastTapAt = at;
        return false;
      }
      // Any other key, modifier or click spoils both the press and the pair.
      downAt = null;
      lastTapAt = null;
      return false;
    },
  };
}
