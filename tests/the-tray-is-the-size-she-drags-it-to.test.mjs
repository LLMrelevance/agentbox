// 2026-10-13: "it would be nice to be able to resize. i was thinking dragging
// the side corner of it, but probs other ways to go about doing it."
//
// The tray already sizes itself off the screen it rests on (31px on a laptop,
// up to 48px on her 32"). So what a drag sets is not a height but a MULTIPLE of
// that automatic size: a tag she grows by a fifth stays a fifth bigger when she
// plugs in the big screen, instead of snapping back to a laptop's number.
// The same multiple is what the tag's own menu nudges up and down.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TAG_LIMITS, TAG_ZOOM, tagHeight, tagHeightOn, tagScaleOn, tagZoom, zoomFor, zoomStep,
} from '../shared/corner-tag.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = fs.readFileSync(path.join(root, 'renderer/src/corner-tag/main.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'renderer/src/corner-tag/corner-tag.css'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'main/corner-tag-preload.cjs'), 'utf8');
const LAPTOP = 1728;
const BIG = 3413;

describe('the size she drags to is a multiple of the automatic one', () => {
  it('leaves the automatic size alone until she has touched it', () => {
    expect(tagHeightOn(LAPTOP, undefined)).toBe(tagHeight(LAPTOP));
    expect(tagHeightOn(BIG, 1)).toBe(tagHeight(BIG));
    expect(tagZoom(undefined)).toBe(1);
  });

  it('carries what she set to every other screen', () => {
    // a fifth bigger on the laptop is a fifth bigger on the 32" too
    const zoom = zoomFor(tagHeight(LAPTOP) * 1.2, LAPTOP);
    expect(zoom).toBeCloseTo(1.2, 1);
    expect(tagHeightOn(BIG, zoom)).toBeGreaterThan(tagHeight(BIG));
    expect(tagHeightOn(BIG, zoom) / tagHeight(BIG)).toBeCloseTo(zoom, 1);
  });

  it('reads a dragged height back as that multiple', () => {
    expect(zoomFor(tagHeight(LAPTOP), LAPTOP)).toBe(1);
    expect(zoomFor(62, LAPTOP)).toBe(tagZoom(62 / 31));
    expect(zoomFor(0, LAPTOP)).toBe(tagZoom(TAG_LIMITS.min / 31));
  });

  it('stays a tag however far the drag goes', () => {
    for (const width of [1280, LAPTOP, 2560, BIG]) {
      expect(tagHeightOn(width, 99)).toBeLessThanOrEqual(TAG_LIMITS.max);
      expect(tagHeightOn(width, -99)).toBeGreaterThanOrEqual(TAG_LIMITS.min);
      expect(tagZoom(99)).toBe(TAG_ZOOM.max);
      expect(tagZoom(0.01)).toBe(TAG_ZOOM.min);
    }
  });

  it('goes a notch at a time from the menu, and stops at its ends', () => {
    expect(zoomStep(1, 1)).toBeCloseTo(1.1, 2);
    expect(zoomStep(1, -1)).toBeCloseTo(0.9, 2);
    expect(zoomStep(TAG_ZOOM.max, 1)).toBe(TAG_ZOOM.max);
    expect(zoomStep(TAG_ZOOM.min, -1)).toBe(TAG_ZOOM.min);
  });

  it('hands the page one number, as before', () => {
    expect(tagScaleOn(LAPTOP, 1)).toBe(tagHeight(LAPTOP) / 28);
    expect(tagScaleOn(LAPTOP, 1.2) * 28).toBe(tagHeightOn(LAPTOP, 1.2));
  });
});

describe('the corners she drags', () => {
  it('are all four, each with an arrow that shows itself when pointed at', () => {
    // One ledge in one corner was not discoverable: "there was no way to
    // discover that it was actually expandable".
    for (const corner of ['tl', 'tr', 'bl', 'br']) expect(css).toContain(`.ct-grip-${corner}`);
    expect(page).toContain('GRIPS.map');
    // and nothing shows until the pointer is on that one corner: four at once
    // read as a frame of handles round the tag, which it is not
    expect(css).toMatch(/\.ct-grip \{[^}]*opacity: 0;/);
    expect(css).toMatch(/\.ct-grip:hover \{ opacity: 0\.8/);
    expect(css).not.toMatch(/\.ct-frame:hover \.ct-grip[^:]*\{/);
    // and a patch big enough to aim at, not a few pixels of ledge
    expect(css).toMatch(/\.ct-grip \{[^}]*width: calc\(20px/);
  });

  it('press through the same door as a drag, saying which corner it is', () => {
    expect(bridge).toContain('press: (x, y, grip, corner)');
    expect(page).toContain('bridge?.press(e.screenX, e.screenY, true, corner)');
  });
});

describe('the arrows hang over the glass, not inside it', () => {
  it('centres each one on its corner, half in the clear band', () => {
    // "It should extend over the edges and point outward... halfway inside the
    // browser and halfway outside it." The window keeps a 10pt band around the
    // glass and the 18pt patch starts 2.5pt into it, so the arrow's middle
    // lands on the corner, a whisker inside where the radius rounds it off.
    expect(css).toMatch(/\.ct-frame \{[^}]*padding: calc\(10px \* var\(--ct-s\)\)/);
    // the inset is a fraction of the corner's own radius, so it holds at
    // every size the tag can be dragged to
    const radius = Number(css.match(/\.ct-tag \{[^}]*border-radius: calc\((\d+)px/)?.[1] ?? css.match(/border-radius: calc\((\d+)px \* var\(--ct-s\)\)/)[1]);
    expect(2.4 / radius).toBeCloseTo(0.4, 1);
    const grip = css.match(/\.ct-grip \{[^}]*\}/)[0];
    // a 20pt patch inside a 10pt band, 2.4pt in from the window's corner.
    // That number is measured, not judged: sampling the arrow's ink against
    // the glass's real rounded rectangle gives 14% on the glass at no inset,
    // 40% at two, 57% at three and 94% at five, and 51% where it now stands.
    // It is 0.4 of the 6pt corner radius, so it holds at every size.
    expect(grip).toMatch(/width: calc\(20px \* var\(--ct-s\)\)/);
    expect(grip).toMatch(/height: calc\(20px \* var\(--ct-s\)\)/);
    for (const corner of ['tl', 'tr', 'bl', 'br']) {
      expect(css).toMatch(new RegExp(`\\.ct-grip-${corner} \\{ (left|right): calc\\(2\\.4px \\* var\\(--ct-s\\)\\); (top|bottom): calc\\(2\\.4px`));
    }
    // grey rather than ink, and never quite full strength
    // low-key: a light grey at half strength, and never fully lit
    const alpha = Number(grip.match(/color: rgba\(\d+, \d+, \d+, ([\d.]+)\)/)[1]);
    expect(alpha).toBeLessThanOrEqual(0.55);
    expect(css).toMatch(/\.ct-grip:hover \{ opacity: 0\.8/);
  });

  it('draws the usual two-headed arrow, one head at each end of the diagonal', () => {
    // "a little two-directional arrow almost comes up and that's kind of what
    // we're looking for" — a window's own corner handle.
    const arrow = page.match(/const ARROW = '([^']+)'/)[1];
    expect(arrow).toMatch(/^M1\.6 1\.6 10\.4 10\.4/);
    expect(arrow.match(/M/g)).toHaveLength(3);
    expect(css).toContain('.ct-grip-tr svg, .ct-grip-bl svg { transform: rotate(90deg); }');
  });

  it('tells the main process the band, and what is under the pointer', () => {
    expect(page).toContain('bridge.size(which, r.width, r.height');
    expect(page).toContain('bridge?.clickable(overUs(e))');
    expect(bridge).toContain('clickable: (on)');
    expect(bridge).toContain('size: (part, width, height, frame)');
  });
});
