// THE CHOICES FLOW ONTO AS FEW LINES AS THEY NEED, AND NOTHING FADES (w-65bcefb857).
//
// The founder's screenshot after round eight shipped: three choices still took
// three rows of the box ("i don't see the changes you made regarding the
// options taking up too much space?"), because tighter padding took 8 pixels
// off each row and nothing more. And the answer faded into a white haze above
// them: "should just be cut off abruptly like any component". Read in
// renderer/src/one-thing-at-a-time.css: a 32px mask on the page's scroll.
//
// Now the choices sit side by side and wrap only when the next one does not
// fit, so short ones share a line and a long one still gets one line of its
// own, cut, whole on hover or once picked out with the keys.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'renderer/src/one-thing-at-a-time.css'), 'utf8');
const rule = (sel) => css.match(new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';

describe('the choices', () => {
  it('sit side by side and wrap only when the next does not fit', () => {
    expect(rule('.one-choices > .opt-strip')).toMatch(/display: flex; flex-wrap: wrap;/);
  });
  it('each as wide as its words, never wider than the box', () => {
    expect(rule('.one-choices .opt-row')).toMatch(/width: auto; max-width: 100%;/);
  });
  it('one line each, the whole of a long one on hover or once picked out', () => {
    expect(rule('.one-choices .opt-text')).toMatch(/-webkit-line-clamp: 1/);
    expect(rule('.one-choices .opt-row.selected .opt-text')).toMatch(/-webkit-line-clamp: unset/);
  });
});

describe('the answer above them', () => {
  it('is cut off where the choices start, with no fade', () => {
    expect(css).not.toMatch(/mask-image/);
  });
});
