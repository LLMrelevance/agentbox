// THE LOGO IS NINE DOTS WITH THE TOP RIGHT ONE LIT (2026-10-25).
//
// The logo was three bars with the middle one pulled out in orange. It was
// replaced after six rounds of options (w-1587f83559) by "3A, one lit": the
// app's own nine-dot lattice on a dark tile, eight dots dim and the top right
// one orange. Measured before the change: renderer/src/assets/agentbox-icon.svg
// held no <circle> at all, only the bars. Every place the app names itself
// draws this one file (see the-app-can-be-downloaded), so it is read here.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const svg = fs.readFileSync(new URL('../renderer/src/assets/agentbox-icon.svg', import.meta.url), 'utf8');
const dots = [...svg.matchAll(/<circle\b[^>]*>/g)].map(([tag]) => ({
  cx: Number(tag.match(/cx="([\d.]+)"/)[1]),
  cy: Number(tag.match(/cy="([\d.]+)"/)[1]),
  orange: /fill="#ee6018"/i.test(tag),
}));

describe('the logo', () => {
  it('is nine dots in a three by three grid', () => {
    expect(dots).toHaveLength(9);
    expect(new Set(dots.map((d) => d.cx)).size).toBe(3);
    expect(new Set(dots.map((d) => d.cy)).size).toBe(3);
  });

  it('lights exactly one dot, the top right one', () => {
    const lit = dots.filter((d) => d.orange);
    expect(lit).toHaveLength(1);
    expect(lit[0].cx).toBe(Math.max(...dots.map((d) => d.cx)));
    expect(lit[0].cy).toBe(Math.min(...dots.map((d) => d.cy)));
  });

  it('does not light the middle dot or the top left one', () => {
    const middle = dots.find((d) => d.cx !== Math.min(...dots.map((e) => e.cx)) && d.cx !== Math.max(...dots.map((e) => e.cx)) && d.cy !== Math.min(...dots.map((e) => e.cy)) && d.cy !== Math.max(...dots.map((e) => e.cy)));
    const topLeft = dots.find((d) => d.cx === Math.min(...dots.map((e) => e.cx)) && d.cy === Math.min(...dots.map((e) => e.cy)));
    expect(middle.orange).toBe(false);
    expect(topLeft.orange).toBe(false);
  });

  it('no longer draws the three bars', () => {
    expect(svg).not.toMatch(/row-film|sheen-row|sheen-or/);
  });
});
