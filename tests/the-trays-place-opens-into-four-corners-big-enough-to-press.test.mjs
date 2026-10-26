// THE TRAY'S LIST GAINS PLACE, AND PLACE OPENS INTO THE FOUR CORNERS
// (w-6da6d4ad24).
//
// Nobody knew the tray could be moved: QA filed it as a bug for covering
// another app's button. Of the drawings, the one picked was a Place button at
// the foot of the list, the four corners drawn in it, that turns the list
// into the screen with a button in each corner. The corners drawn inside
// Place were "too small to click reasonably", so Place is ONE button and only
// the corners it opens into move the tray.
//
// Measured by drawing the pieces to markup, and against the page and its
// stylesheet: one button at the foot beside Size, three corners to press and
// the fourth saying where the tray is now, and each corner big enough to hit.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlaceButton, PlacePicker, placeSpots } from '../renderer/src/corner-tag/place.tsx';

globalThis.React = React;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = fs.readFileSync(path.join(root, 'renderer/src/corner-tag/main.tsx'), 'utf8');
const css = fs.readFileSync(path.join(root, 'renderer/src/corner-tag/corner-tag.css'), 'utf8');
const rule = (sel) => [...css.matchAll(new RegExp(`(?:^|\\n)${sel.replace(/[.[\]"()=:*]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join(' ');
const draw = (el) => renderToStaticMarkup(el);
const count = (html, re) => (html.match(re) ?? []).length;

describe('Place, at the foot of the list', () => {
  const html = draw(React.createElement(PlaceButton, { onOpen: () => {} }));

  it('is called Place and is one button, not four small ones', () => {
    expect(html).toContain('>Place<');
    expect(count(html, /<button/g)).toBe(1);
    expect(html).toContain('aria-label="Move the tray to another corner"');
  });

  it('draws the four corners inside that button', () => {
    expect(count(html, /class="ct-corner"/g)).toBe(4);
    for (const turn of [0, 90, 180, 270]) expect(html).toContain(`rotate(${turn}deg)`);
  });

  it('sits beside Size in the foot, before it', () => {
    const foot = page.slice(page.indexOf('<div className="ct-foot">'));
    expect(foot.indexOf('<PlaceButton')).toBeGreaterThan(-1);
    expect(foot.indexOf('<PlaceButton')).toBeLessThan(foot.indexOf('<span className="ct-size">'));
  });
});

describe('what Place opens into', () => {
  for (const here of ['tl', 'tr', 'bl', 'br']) {
    it(`offers the other three corners, and says the tray is in ${here} now`, () => {
      const html = draw(React.createElement(PlacePicker, { here, tray: React.createElement('i', { id: 'tray' }), onPick: () => {}, onBack: () => {} }));
      // Back, and one button for every corner but its own
      expect(count(html, /<button/g)).toBe(1 + 3);
      expect(html).toContain('>Back<');
      expect(html).toContain('Move the tray to');
      expect(html).toMatch(new RegExp(`<div class="ct-spot ct-spot-${here} is-here"><i id="tray"></i><span>Here now</span></div>`));
      expect(html).not.toMatch(new RegExp(`<button class="ct-spot ct-spot-${here}"`));
    });
  }

  it('names the corners in plain words, in the order the screen lays them out', () => {
    expect(placeSpots('br').map((s) => [s.corner, s.name, s.here])).toEqual([
      ['tl', 'Top left', false], ['tr', 'Top right', false], ['bl', 'Bottom left', false], ['br', 'Bottom right', true],
    ]);
  });

  it('marks no corner as here when it does not know where the tray is', () => {
    expect(placeSpots(undefined).some((s) => s.here)).toBe(false);
  });

  it('moves the tray through the bridge, and Back only goes back', () => {
    expect(page).toMatch(/onPick=\{\(c\) => bridge\?\.place\(c\)\}/);
    expect(page).toMatch(/onBack=\{\(\) => setPlacing\(false\)\}/);
  });
});

describe('the corners are big enough to press', () => {
  it('makes each corner a button at least 36 points tall, laid out two by two', () => {
    const h = Number((rule('.ct-spot').match(/height:\s*calc\((\d+)px/) ?? [])[1]);
    expect(h).toBeGreaterThanOrEqual(36);
    expect(rule('.ct-screen')).toMatch(/grid-template-columns:\s*1fr 1fr/);
  });

  it('puts the mark on the side of the screen it stands for', () => {
    expect(rule('.ct-spot-tr, .ct-spot-br')).toMatch(/row-reverse/);
  });
});

describe('the list never reopens on the corners', () => {
  it('goes back to its threads when it shuts, and on Escape', () => {
    expect(page).toMatch(/bridge\?\.onOpen\(\(o\) => \{ if \(!o\) setPlacing\(false\); \}\)/);
    expect(page).toMatch(/if \(placing\) setPlacing\(false\); else bridge\?\.toggle\(\);/);
  });
});
