// DRAG A CHAT UP OVER THE CARDS (w-b5f23cff71).
//
// "When I'm in the chats, I find myself really wanting to expand it upward and
// drag this chat to give me more view space." With three rows of cards over
// it (the screenshot, a chat with one person), an open chat had about
// half the window. Now a grip sits between the cards and the chat: drag it up
// and the cards area gets shorter and scrolls, down to nothing at all; drag
// it down for all of them. It moves a whole row at a time, the choice is
// remembered, and a double click puts back the usual two rows
// (the-cards-stop-at-two-rows).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { rowsAfterDrag } from '../renderer/src/team/everything/members.ts';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('a drag on the grip', () => {
  const ends = [116, 230, 344, 458];

  // The first build stopped wherever the pointer did and cut a row of cards
  // through its faces. With the rows' bottoms it lands on the nearest one.
  it('lands on the nearest whole row', () => {
    expect(rowsAfterDrag(120, ends)).toBe(1);
    expect(rowsAfterDrag(200, ends)).toBe(2);
    expect(rowsAfterDrag(300, ends)).toBe(3);
  });

  it('folds the cards away under half a row', () => {
    expect(rowsAfterDrag(50, ends)).toBe(0);
    expect(rowsAfterDrag(-40, ends)).toBe(0);
  });

  it('is every row at the last one or past it', () => {
    expect(rowsAfterDrag(440, ends)).toBe('all');
    expect(rowsAfterDrag(900, ends)).toBe('all');
  });
});

describe('in the app', () => {
  const app = read('renderer/src/App.tsx');
  const area = read('renderer/src/team/everything/CardsArea.tsx');
  const css = read('renderer/src/team/everything/everything.css');

  it('puts a grip between the cards and an open chat, and nowhere else', () => {
    expect(app).toMatch(/<CardsArea [^>]*grip=\{evFill\}/);
    expect(area).toMatch(/\{grip && <Grip /);
    expect(area).toMatch(/role="separator" aria-orientation="horizontal" aria-label="Drag to make the chat taller"/);
    expect(css).toMatch(/\.ev-grip \{[^}]*cursor: row-resize/);
  });

  it('puts the usual two rows back on a double click', () => {
    expect(area).toMatch(/onDoubleClick=\{\(\) => onRows\(null\)\}/);
  });

  // "N hidden" sits between the cards and the grip; a grip that took the
  // element above it for the cards would measure that line instead.
  it('measures the cards box itself, not whatever sits above the grip', () => {
    expect(area).toMatch(/<div ref=\{box\} className="ev-cards"/);
    expect(area).not.toContain('previousElementSibling');
  });
});
