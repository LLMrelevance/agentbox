// A PHONE SWIPES BETWEEN THE BOARD'S COLUMNS (2026-10-13).
//
// Reported from a phone: "board view doesn't seem to work on mobile, just shows
// one row and can't scroll to the side to see more."
//
// Measured in a 390 x 844 window on the real inbox: phone.css stacked the four
// columns one under another (grid-template-columns: one column), so the first
// column, 41 cards of "Needs you", filled 7,323px of page and the other three
// sat below all of it, with nothing scrolling sideways. Now the board is a row
// of columns a finger swipes across, each a little narrower than the screen
// so the next one shows at the edge, snapping to a column, and each column
// scrolls up and down on its own with its heading kept at the top.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../renderer/src/phone.css', import.meta.url), 'utf8');
const phone = css.slice(css.indexOf('@media (max-width: 700px)'));
const rule = (sel) => {
  const at = phone.indexOf(`${sel} {`);
  return at < 0 ? '' : phone.slice(at, phone.indexOf('}', at));
};

describe('the board on a phone', () => {
  it('no longer stacks the columns one under another', () => {
    expect(rule(':root:root:root .th-board')).not.toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/);
  });

  it('lays the columns side by side, narrower than the screen so the next one shows', () => {
    const board = rule(':root:root:root .th-board');
    expect(board).toMatch(/grid-auto-flow:\s*column/);
    expect(board).toMatch(/grid-auto-columns:\s*(8\d|9[0-2])%/);
  });

  it('scrolls sideways and snaps to a column', () => {
    const board = rule(':root:root:root .th-board');
    expect(board).toMatch(/overflow-x:\s*auto/);
    expect(board).toMatch(/scroll-snap-type:\s*x mandatory/);
    expect(rule(':root:root:root .th-col')).toMatch(/scroll-snap-align:\s*start/);
  });

  it('each column scrolls up and down on its own, so a long one does not bury the rest', () => {
    expect(rule(':root:root:root .th-col')).toMatch(/overflow-y:\s*auto/);
    expect(rule(':root:root:root .list-pane:has(> .th-board-wrap)')).toMatch(/overflow:\s*hidden/);
    expect(rule(':root:root:root .th-board-wrap')).toMatch(/height:\s*100%/);
  });

  it('keeps a column\'s heading in view while its cards scroll', () => {
    expect(rule(':root:root:root .th-col-h')).toMatch(/position:\s*sticky/);
  });

  it('the desktop board is untouched', () => {
    const desk = fs.readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
    expect(desk).toMatch(/\.th-board \{ display: grid; grid-template-columns: repeat\(4, minmax\(260px, 1fr\)\)/);
  });
});
