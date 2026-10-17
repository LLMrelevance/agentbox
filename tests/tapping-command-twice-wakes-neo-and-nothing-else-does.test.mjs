// Neo wakes when you tap ⌘ twice (approved 2026-10-16, w-e85fd9144f). The
// gesture has to be loose enough to catch a real double tap and tight enough
// that the ⌘ shortcuts everyone presses all day never wake it: ⌘C then ⌘V, a
// held ⌘, ⌘ with Shift, and Wispr Flow's ⌘+Fn.
import { describe, expect, it } from 'vitest';
import { doubleTap, TAP_MAX_MS, GAP_MAX_MS } from '../shared/neo-double-tap.mjs';

// Feeds a list of [event, at] to a fresh detector; returns the times it woke.
function run(events) {
  const d = doubleTap();
  const woke = [];
  for (const [kind, at] of events) if (d.feed(kind, at)) woke.push(at);
  return woke;
}

describe('a double tap of ⌘', () => {
  it('wakes on two quick taps with nothing in between (the case asked for)', () => {
    expect(run([['cmd-down', 0], ['cmd-up', 80], ['cmd-down', 200], ['cmd-up', 270]])).toEqual([270]);
  });

  it('wakes at the edges of what counts as quick', () => {
    const hold = TAP_MAX_MS - 1;
    const gap = GAP_MAX_MS - 1;
    expect(run([['cmd-down', 0], ['cmd-up', hold], ['cmd-down', hold + gap], ['cmd-up', hold + gap + hold]])).toHaveLength(1);
  });

  it('does not wake when a tap is held too long', () => {
    expect(run([['cmd-down', 0], ['cmd-up', TAP_MAX_MS + 1], ['cmd-down', TAP_MAX_MS + 100], ['cmd-up', TAP_MAX_MS + 150]])).toEqual([]);
  });

  it('does not wake when the second tap comes too late', () => {
    expect(run([['cmd-down', 0], ['cmd-up', 80], ['cmd-down', 80 + GAP_MAX_MS + 1], ['cmd-up', 80 + GAP_MAX_MS + 60]])).toEqual([]);
  });

  it('does not wake on ⌘C then ⌘V', () => {
    expect(run([
      ['cmd-down', 0], ['other', 40], ['cmd-up', 90],
      ['cmd-down', 200], ['other', 230], ['cmd-up', 280],
    ])).toEqual([]);
  });

  it('does not wake when another key lands between the two taps', () => {
    expect(run([['cmd-down', 0], ['cmd-up', 80], ['other', 120], ['cmd-down', 200], ['cmd-up', 260]])).toEqual([]);
  });

  it('does not wake on ⌘ with Shift, Option, Control or Fn (Wispr Flow uses ⌘+Fn)', () => {
    expect(run([['cmd-down', 0], ['modifier', 30], ['cmd-up', 80], ['cmd-down', 200], ['cmd-up', 260]])).toEqual([]);
    expect(run([['cmd-down', 0], ['cmd-up', 80], ['cmd-down', 200], ['modifier', 220], ['cmd-up', 260]])).toEqual([]);
  });

  it('does not wake on a mouse click between the taps (⌘-click)', () => {
    expect(run([['cmd-down', 0], ['mouse', 30], ['cmd-up', 80], ['cmd-down', 200], ['cmd-up', 260]])).toEqual([]);
  });

  it('wakes once on three taps, not twice', () => {
    expect(run([
      ['cmd-down', 0], ['cmd-up', 60], ['cmd-down', 150], ['cmd-up', 210], ['cmd-down', 300], ['cmd-up', 360],
    ])).toEqual([210]);
  });

  it('wakes again on a later, separate double tap', () => {
    expect(run([
      ['cmd-down', 0], ['cmd-up', 60], ['cmd-down', 150], ['cmd-up', 210],
      ['cmd-down', 2000], ['cmd-up', 2060], ['cmd-down', 2150], ['cmd-up', 2210],
    ])).toEqual([210, 2210]);
  });

  it('ignores an up with no down (the listener started mid-press)', () => {
    expect(run([['cmd-up', 0], ['cmd-down', 100], ['cmd-up', 160], ['cmd-down', 250], ['cmd-up', 310]])).toEqual([310]);
  });
});
