// THE AGENT TRAY, 2026-10-13. Two things she met on her own screen.
//
// Her Mac is set to dark, so the tag drew itself dark, and the pages she works
// in are white: in a screenshot she sent, the tray was a black blob on a white
// webinar page. "we want one more neutral, liquid glass feel... just a single
// one." So the tag and its list now wear ONE glass, whatever the Mac is set to:
// no prefers-color-scheme branch anywhere in the page, no pearl, no
// half-circle.
//
// And it was too small: "esp on my 32 inch screen but also maybe on smaller
// screens too", then, on a 1728-point picture, "one notch smaller than this
// size for this screen size and then make it bigger for bigger screens". So one
// number scales the whole tag, off the width of the screen it rests on.
//
// The mark itself is the launch film's nine-dot lattice (w-3133d503b1 v15): it
// turns twice when something changes and settles, it pops when a count arrives,
// and its centre dot is always filled.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TAG_SCALES, tagScale } from '../shared/corner-tag.mjs';
import { Lattice, markMoves } from '../renderer/src/corner-tag/lattice.tsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'renderer/src/corner-tag/corner-tag.css'), 'utf8');
const page = fs.readFileSync(path.join(root, 'renderer/src/corner-tag/main.tsx'), 'utf8');

describe('the tag grows with the screen it rests on', () => {
  it('draws one notch smaller than 34px on the laptop-sized screen she was shown', () => {
    expect(tagScale(1728)).toBe(1.1);
    expect(tagScale(1440)).toBe(1.1);
  });

  it('grows on a wide screen and again on a very wide one, like her 32 inch', () => {
    expect(tagScale(2000)).toBe(1.2);
    expect(tagScale(2560)).toBe(1.2);
    expect(tagScale(2800)).toBe(1.36);
    expect(tagScale(3413)).toBe(1.36);
  });

  it('holds the boundary either side and never answers with nothing', () => {
    expect(tagScale(1999)).toBe(1.1);
    expect(tagScale(2799)).toBe(1.2);
    expect(tagScale(undefined)).toBe(1.1);
    expect(tagScale(NaN)).toBe(1.1);
    expect(TAG_SCALES.every((s) => s.scale > 1)).toBe(true);
  });
});

describe('what the mark does, and when', () => {
  it('pops when a thread becomes ready and when another one joins it', () => {
    expect(markMoves({ kind: 'working', count: 20 }, { kind: 'ready', count: 1 })).toBe('pop');
    expect(markMoves({ kind: 'ready', count: 3 }, { kind: 'ready', count: 4 })).toBe('pop');
  });

  it('does not pop when a count falls, because that is news you have dealt with', () => {
    expect(markMoves({ kind: 'ready', count: 4 }, { kind: 'ready', count: 3 })).toBe('none');
    expect(markMoves({ kind: 'ready', count: 3 }, { kind: 'ready', count: 3 })).toBe('none');
  });

  it('turns, and so settles, when anything changes while agents are working', () => {
    expect(markMoves({ kind: 'working', count: 20 }, { kind: 'working', count: 21 })).toBe('stir');
    expect(markMoves({ kind: 'working', count: 20 }, { kind: 'working', count: 19 })).toBe('stir');
    expect(markMoves({ kind: 'ready', count: 2 }, { kind: 'working', count: 20 })).toBe('stir');
  });

  it('is still when nothing has changed, and greets you when the tray returns', () => {
    expect(markMoves({ kind: 'working', count: 20 }, { kind: 'working', count: 20 })).toBe('none');
    expect(markMoves(null, { kind: 'working', count: 20 })).toBe('stir');
    expect(markMoves(null, { kind: 'ready', count: 3 })).toBe('pop');
  });
});

describe('the nine dots', () => {
  const html = (props) => renderToStaticMarkup(h(Lattice, props));

  it('draws nine dots with the centre one always filled, lit or not', () => {
    for (const lit of [true, false]) {
      const out = html({ lit, move: 'none', beat: 0 });
      expect((out.match(/<i/g) ?? []).length).toBe(9);
      expect(out).toContain('ct-heart');
      expect(out).not.toContain('data-hole');
    }
  });

  it('lights every dot when a thread is waiting and leaves them resting when none is', () => {
    expect(html({ lit: true, move: 'none', beat: 0 })).toContain('is-waiting');
    expect(html({ lit: false, move: 'none', beat: 0 })).not.toContain('is-waiting');
  });

  it('turns only while working and pops only when a count arrives', () => {
    expect(html({ lit: false, move: 'stir', beat: 1 })).toContain('is-turning');
    expect(html({ lit: true, move: 'pop', beat: 1 })).toContain('is-popping');
    expect(html({ lit: true, move: 'pop', beat: 1 })).not.toContain('is-turning');
  });
});

describe('one glass, whatever the Mac is set to', () => {
  it('has no light-or-dark branch left in the tray page at all', () => {
    expect(css).not.toContain('prefers-color-scheme');
    expect(css).not.toContain("data-theme='dark'");
    expect(page).not.toContain('theme');
  });

  it('has dropped the pearl and the half-circle for the apricot lattice', () => {
    expect(css).not.toContain('radial-gradient');
    expect(page).not.toContain('ct-half');
    expect(css).toContain('#f3a27a');
    expect(css).toContain('.ct-lat');
  });

  it('keeps its promise to anyone who asked for less motion', () => {
    expect(css).toContain('prefers-reduced-motion');
  });

  it('draws no outer shadow, because the window is exactly the tag', () => {
    // main/corner-tag.mjs: padding the window for a drawn shadow let a real
    // first click fall through to the app beneath. So the glass is defined by
    // its edge, and every shadow in this page is an inset one.
    for (const line of css.split('\n')) {
      if (!line.includes('box-shadow') && !line.includes('inset')) continue;
      const shadows = line.slice(line.indexOf(':') + 1).split(',');
      for (const part of shadows) {
        if (part.trim() && !part.includes('inset') && /\dpx/.test(part)) {
          expect(`${line.trim()} :: ${part.trim()}`).toBe('every shadow inset');
        }
      }
    }
  });
});
