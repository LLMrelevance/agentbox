// THE LAST ROWS OF NEEDS YOU SAT BEHIND THE APPROVAL CARD (QA session 14,
// 2026-10-26, F-85).
//
// The card is fixed to the bottom-right corner, 440px wide and above
// everything, because a worker is frozen until it is answered. The list
// scrolled underneath it and stopped: the last two rows were behind the card,
// and scrolling to the end did not bring them out, because there was nothing
// below them left to scroll.
//
// The list leaves room while a card is up, and the room is MEASURED rather than
// guessed: photographed at 1440x620, the card is 149px tall with a bare command
// and half as tall again once a worker sends a description, a folder and a
// host. renderer/src/room-for-the-card.ts writes the height it finds into
// `--approval-room`, and this is the one rule that reads it.
//
// Measured after the change, scrolled to the end at 1440x620: the last row ends
// at y=433 and the card begins at y=449.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const css = read('renderer/src/styles.css');
const app = read('renderer/src/App.tsx');
const room = read('renderer/src/room-for-the-card.ts');

describe('the inbox while an approval is waiting', () => {
  const rule = css.match(/\n\.app\.asking \.list-pane \{[^}]*\}/)?.[0] ?? '';

  it('ends above the card instead of running under it', () => {
    expect(rule).toMatch(/padding-bottom:\s*calc\(var\(--approval-room/);
  });

  it('is told how tall the card really is, not a number in the stylesheet', () => {
    expect(room).toMatch(/const ROOM = '--approval-room';/);
    expect(room).toMatch(/getBoundingClientRect\(\)\.height/);
    // The card grows with a long description and with the queue behind it.
    expect(room).toMatch(/new ResizeObserver\(write\)/);
    // And the card is the element measured.
    expect(app).toMatch(/<div className="approvals" ref=\{cardRoom\}>/);
  });

  it('keeps a fallback for a card that has not been measured yet', () => {
    // The default is a card carrying nothing but a command, which is the
    // shortest one there is: the first frame can leave too much room, never too
    // little.
    expect(rule).toMatch(/--approval-room,\s*149px/);
  });

  it('takes the room back when the card goes', () => {
    expect(room).toMatch(/root\.style\.removeProperty\(ROOM\)/);
    expect(app).toMatch(/cardRoomUndo\.current\?\.\(\);/);
  });
});
