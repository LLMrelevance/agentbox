// DRAG A CHAT UP OVER THE CARDS (w-b5f23cff71).
//
// "When I'm in the chats, I find myself really wanting to expand it upward and
// drag this chat to give me more view space." With three rows of cards over
// it (the screenshot, a chat with one person), an open chat had about
// half the window. Now a grip sits between the cards and the chat: drag it up
// and the cards area gets shorter and scrolls, down to nothing at all; drag
// it down for all of them. The height is remembered, and a double click puts
// every card back.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { cardsHeight, readCardsHeight, writeCardsHeight } from '../renderer/src/team/everything/members.ts';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('how tall the cards are over a chat', () => {
  it('follows the drag between none and all of them', () => {
    expect(cardsHeight(200, 380)).toBe(200);
    expect(cardsHeight(500, 380)).toBeNull();
    expect(cardsHeight(-20, 380)).toBe(0);
  });

  it('folds to none under a short drag, so no half row is left showing', () => {
    expect(cardsHeight(30, 380)).toBe(0);
    expect(cardsHeight(48, 380)).toBe(48);
  });

  // The first build stopped wherever the pointer did and cut a row of cards
  // through its faces. With the rows' bottoms it lands on the nearest one.
  it('lands on whole rows when it knows where they end', () => {
    const rows = [116, 230, 344];
    expect(cardsHeight(60, 350, rows)).toBe(116);
    expect(cardsHeight(50, 350, rows)).toBe(0);
    expect(cardsHeight(200, 350, rows)).toBe(230);
    expect(cardsHeight(340, 350, rows)).toBeNull();
  });

  it('is all of them, as before, until you drag', () => {
    expect(readCardsHeight({ getItem: () => null })).toBeNull();
  });

  it('is remembered, and a broken value is all of them', () => {
    const box = new Map();
    const store = { getItem: (k) => box.get(k) ?? null, setItem: (k, v) => box.set(k, v), removeItem: (k) => box.delete(k) };
    writeCardsHeight(120, store);
    expect(readCardsHeight(store)).toBe(120);
    writeCardsHeight(null, store);
    expect(readCardsHeight(store)).toBeNull();
    box.set('agentbox.everything.cardsHeight', 'tall');
    expect(readCardsHeight(store)).toBeNull();
  });
});

describe('in the app', () => {
  const app = read('renderer/src/App.tsx');
  const strip = read('renderer/src/team/everything/TeamStrip.tsx');
  const css = read('renderer/src/team/everything/everything.css');

  it('puts a grip between the cards and an open chat, and nowhere else', () => {
    expect(app).toMatch(/<CardsGrip height=\{evCardsH\} onHeight=\{setEvCards\} \/>/);
    expect(app).toMatch(/\{evFill && <CardsGrip/);
    expect(strip).toMatch(/role="separator" aria-orientation="horizontal" aria-label="Drag to make the chat taller"/);
  });

  it('lets the cards scroll when they are shorter than all of them', () => {
    expect(app).toMatch(/<div className="ev-cards" style=\{evFill && evCardsH !== null \? \{ maxHeight: evCardsH \} : undefined\}>/);
    expect(css).toMatch(/\.ev-cards \{[^}]*overflow-y: auto/);
    expect(css).toMatch(/\.ev-grip \{[^}]*cursor: row-resize/);
  });

  // "N hidden" sits between the cards and the grip; a grip that took the
  // element above it for the cards would measure that line instead.
  it('finds the cards by name, not by what happens to sit above it', () => {
    expect(strip).toContain("parentElement?.querySelector<HTMLElement>(':scope > .ev-cards')");
    expect(strip).not.toContain('previousElementSibling');
  });
});
