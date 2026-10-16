// WHERE NEO'S ORB SITS AND HOW FAST IT TALKS. One copy of both, because
// main/neo/index.mjs places the window and the page draws the card and the
// controls inside it, and the two have to agree about the same strip of
// pixels (tests/the-orb-stays-where-you-drag-it-and-keeps-its-card-on-screen).
//
// The window is a strip wide enough to read the card out on either side of
// the orb, so an orb dragged to the left edge still has its words on screen.
// Everything in it is placed from the orb's centre.

const ORB = 150;
const CARD_WIDTH = 400;
const CARD_GAP = 10;
const CARD_PAD = 20;
// Above the orb, for the speed control a hover reveals.
const CONTROLS = 44;
// Half the card's own height, so the words fit above and below the orb's middle.
const CARD_HALF = 110;

const CX = CARD_PAD + CARD_WIDTH + CARD_GAP + ORB / 2;
const CY = Math.max(CONTROLS + ORB / 2, CARD_HALF);

export const NEO = {
  width: CX * 2,
  height: CY * 2,
  orb: ORB,
  cx: CX,
  cy: CY,
  cardWidth: CARD_WIDTH,
  cardGap: CARD_GAP,
  controls: CONTROLS,
  // The card's left edge in window coordinates, on each side of the orb.
  cardLeft: CARD_PAD,
  cardRight: CX + ORB / 2 + CARD_GAP,
};

// The corner it rested in before it could be moved, to the pixel.
const CORNER = 119;
export function defaultOrbPoint(workArea) {
  return { x: workArea.x + workArea.width - CORNER, y: workArea.y + workArea.height - CORNER };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// The window bounds that put the orb's centre at `point`, and which side of
// the orb the card reads out on.
export function placeOrb({ workArea, point }) {
  const half = ORB / 2;
  const x = Math.round(clamp(point?.x ?? 0, workArea.x + half, workArea.x + workArea.width - half));
  const y = Math.round(clamp(point?.y ?? 0, workArea.y + half + CONTROLS, workArea.y + workArea.height - half));
  const room = x - half - CARD_GAP - CARD_WIDTH >= workArea.x;
  return {
    bounds: { x: x - CX, y: y - CY, width: NEO.width, height: NEO.height },
    cardSide: room ? 'left' : 'right',
    point: { x, y },
  };
}

// How fast Neo speaks. Four, because the control is a glance surface and a
// slider read aloud is no faster to use than a number.
export const SPEEDS = [0.75, 1, 1.25, 1.5];

export function okSpeed(value) {
  return SPEEDS.includes(value) ? value : 1;
}
