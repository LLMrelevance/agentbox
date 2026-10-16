// WHERE THE ORB SITS ONCE YOU CAN DRAG IT (w-5520063011).
//
// Her words on the first Neo alpha: "I'd like to drag the orb around the
// screen", and "I'd like to control voice speed, perhaps by hovering over the
// orb to reveal controls". Both are geometry: Neo's window is a strip that
// carries the orb, its card and the controls, and dragging it means putting
// that strip wherever the orb has to land. Three ways that goes wrong:
//
// - the card is 400px wide and sits to the orb's left, so an orb dragged to
//   the left edge of the screen reads out onto nothing
// - the orb itself can be pushed off the screen, where it cannot be grabbed
//   back
// - the controls sit above the orb, so an orb against the top edge has no
//   room to show them
//
// shared/neo-orb.mjs is the only copy of the rule; main/neo/index.mjs places
// the window through it and the page draws the card on the side it names.
import { describe, expect, it } from 'vitest';
import { NEO, defaultOrbPoint, placeOrb, okSpeed, SPEEDS } from '../shared/neo-orb.mjs';

const screenArea = { x: 0, y: 0, width: 1800, height: 1000 };
const centre = (b) => ({ x: b.x + NEO.cx, y: b.y + NEO.cy });

describe('where the orb goes', () => {
  it('rests in the bottom right corner, as it did before it could move', () => {
    const { bounds, cardSide } = placeOrb({ workArea: screenArea, point: defaultOrbPoint(screenArea) });
    expect(centre(bounds)).toEqual({ x: 1800 - 119, y: 1000 - 119 });
    expect(cardSide).toBe('left');
    expect(bounds.width).toBe(NEO.width);
    expect(bounds.height).toBe(NEO.height);
  });

  it('lands where you dropped it', () => {
    const { bounds } = placeOrb({ workArea: screenArea, point: { x: 900, y: 500 } });
    expect(centre(bounds)).toEqual({ x: 900, y: 500 });
  });

  it('keeps the whole orb on screen at every edge', () => {
    const half = NEO.orb / 2;
    for (const point of [{ x: -400, y: 500 }, { x: 4000, y: 500 }, { x: 900, y: -400 }, { x: 900, y: 4000 }]) {
      const c = centre(placeOrb({ workArea: screenArea, point }).bounds);
      expect(c.x).toBeGreaterThanOrEqual(screenArea.x + half);
      expect(c.x).toBeLessThanOrEqual(screenArea.x + screenArea.width - half);
      expect(c.y).toBeGreaterThanOrEqual(screenArea.y + half);
      expect(c.y).toBeLessThanOrEqual(screenArea.y + screenArea.height - half);
    }
  });

  it('leaves room above the orb for the controls a hover reveals', () => {
    const { bounds } = placeOrb({ workArea: screenArea, point: { x: 900, y: -400 } });
    expect(centre(bounds).y).toBeGreaterThanOrEqual(screenArea.y + NEO.orb / 2 + NEO.controls);
  });

  it('works on a second display, whose work area does not start at zero', () => {
    const second = { x: 1800, y: -200, width: 1280, height: 800 };
    const { bounds } = placeOrb({ workArea: second, point: defaultOrbPoint(second) });
    expect(centre(bounds)).toEqual({ x: 1800 + 1280 - 119, y: -200 + 800 - 119 });
  });
});

describe('which side the card reads out on', () => {
  it('reads to the left while there is room for it there', () => {
    expect(placeOrb({ workArea: screenArea, point: { x: 900, y: 500 } }).cardSide).toBe('left');
  });

  it('flips to the right when the orb is near the left edge', () => {
    expect(placeOrb({ workArea: screenArea, point: { x: 120, y: 500 } }).cardSide).toBe('right');
  });

  it('flips exactly where the card would cross the edge, not before', () => {
    const gap = NEO.orb / 2 + NEO.cardGap + NEO.cardWidth;
    expect(placeOrb({ workArea: screenArea, point: { x: gap, y: 500 } }).cardSide).toBe('left');
    expect(placeOrb({ workArea: screenArea, point: { x: gap - 1, y: 500 } }).cardSide).toBe('right');
  });

  it('keeps the card on screen on either side, wherever the orb is', () => {
    for (let x = -200; x <= 2000; x += 37) {
      const { bounds, cardSide } = placeOrb({ workArea: screenArea, point: { x, y: 500 } });
      const left = cardSide === 'left' ? bounds.x + NEO.cardLeft : bounds.x + NEO.cardRight;
      expect(left).toBeGreaterThanOrEqual(screenArea.x);
      expect(left + NEO.cardWidth).toBeLessThanOrEqual(screenArea.x + screenArea.width);
    }
  });
});

describe('the speeds the controls offer', () => {
  it('offers four, with ordinary speed among them', () => {
    expect(SPEEDS).toContain(1);
    expect(SPEEDS).toHaveLength(4);
    expect([...SPEEDS].sort((a, b) => a - b)).toEqual([...SPEEDS]);
  });

  it('takes one of the four and nothing else', () => {
    expect(okSpeed(1.5)).toBe(1.5);
    expect(okSpeed(0.75)).toBe(0.75);
    expect(okSpeed(9)).toBe(1);
    expect(okSpeed(0)).toBe(1);
    expect(okSpeed('1.5')).toBe(1);
    expect(okSpeed(undefined)).toBe(1);
    expect(okSpeed(NaN)).toBe(1);
  });
});
