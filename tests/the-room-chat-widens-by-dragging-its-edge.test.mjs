// THE ROOM CHAT WIDENS BY DRAGGING ITS EDGE, AND THE ROOM TAB'S LINE FITS ITS NAME
// (w-49cd37092c, 2026-10-23).
//
// Two notes on the room in the Threads tab. "This line is too wide and covers
// the part that is typically invisible": the lit tab's underline ran under the
// picker's arrow, which is hidden until you point at it, so the line went on
// past "8" into nothing. It now sits under the name and count only. And "can
// you make the chat expandable? I should probably be able to drag that line":
// the chat beside a room was a fixed 360px. Its edge drags now, within limits
// that leave the board its three columns, and the width is kept. Measured on
// the built app at 1440 by 900: the lit tab's line was 137px under a name and
// count 115px wide.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chatWidth, readChatWidth, writeChatWidth, CHAT_WIDTH, BOARD_LEAST, tilesAcross, tilesPerRow } from '../renderer/src/team/rooms/room-rules.ts';
import { RoomChat } from '../renderer/src/team/rooms/RoomChat.tsx';
globalThis.React = React;

const css = fs.readFileSync(new URL('../renderer/src/team/rooms/rooms.css', import.meta.url), 'utf8');
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

describe('the room tab’s line', () => {
  it('is not drawn under the whole tab, arrow and all', () => {
    expect(css).toMatch(/\.tm-tab\.rm-tab\.on \{[^}]*border-bottom-color: transparent/);
  });
  it('is drawn under the name and count', () => {
    expect(css).toMatch(/\.rm-tab\.on \.rm-tabname::after \{[^}]*background: var\(--accent\)/);
  });
});

describe('how wide the chat may be', () => {
  it('360 until it is dragged', () => {
    expect(CHAT_WIDTH).toBe(360);
    expect(readChatWidth(memory())).toBe(360);
    expect(readChatWidth(null)).toBe(360);
  });
  it('what it was dragged to, kept', () => {
    const store = memory();
    writeChatWidth(480, store);
    expect(readChatWidth(store)).toBe(480);
  });
  it('360 for anything it cannot read', () => {
    const store = memory();
    store.setItem('rooms.chat.width', 'wide');
    expect(readChatWidth(store)).toBe(360);
  });
  // The second number is the room's width, board and chat together: 1140 in a
  // 1440 window with the sidebar open.
  it('never narrower than 300', () => {
    expect(chatWidth(120, 1428)).toBe(300);
    expect(chatWidth(299, 1428)).toBe(300);
    expect(chatWidth(301, 1428)).toBe(301);
  });
  it('never so wide the board loses its three columns', () => {
    expect(chatWidth(2000, 1140)).toBe(1140 - BOARD_LEAST);
    expect(chatWidth(1140 - BOARD_LEAST, 1140)).toBe(1140 - BOARD_LEAST);
    expect(chatWidth(500, 1140)).toBe(500);
  });
  it('the board keeps room for three columns of 170, their gaps and its padding', () => {
    expect(BOARD_LEAST).toBeGreaterThanOrEqual(3 * 170 + 2 * 18 + 24 + 32);
  });
  it('never past 720 on a big screen', () => {
    expect(chatWidth(2000, 2260)).toBe(720);
  });
  it('300 in a room too narrow for both, and the board scrolls', () => {
    expect(chatWidth(2000, 800)).toBe(300);
  });
  it('a window made smaller narrows a chat left wide', () => {
    expect(css).toMatch(/\.rm-chat \{[^}]*min-width: 300px; max-width: calc\(100% - 620px\);/);
  });
});

// Drawn with the chat dragged to its widest at 1440, the faces' eight tiles
// were 73px, and "3 working" ran into the next tile's. A tile needs 94px for
// "Not running" and its line, which the default chat at 1440 leaves exactly;
// fewer fit to a row now, in even rows.
describe('the faces over the board, beside a wider chat', () => {
  it('eight to a row while eight tiles of 94 fit', () => {
    expect(tilesAcross(1400)).toBe(8);
    expect(tilesAcross(8 * 94)).toBe(8);
    expect(tilesAcross(8 * 94 - 1)).toBe(7);
  });
  it('fewer as the board narrows, never none', () => {
    expect(tilesAcross(564)).toBe(6);
    expect(tilesAcross(40)).toBe(1);
    expect(tilesAcross(0)).toBe(1);
  });
  it('eight people go four and four rather than six and two', () => {
    expect(tilesPerRow(8, tilesAcross(564))).toBe(4);
  });
  it('the faces measure their width and keep measuring', () => {
    const view = fs.readFileSync(new URL('../renderer/src/team/rooms/RoomView.tsx', import.meta.url), 'utf8');
    expect(view).toMatch(/new ResizeObserver\(fit\)/);
    expect(view).toMatch(/'--per-row': tilesPerRow\(people\.length, across\)/);
  });
});

describe('the chat beside a room', () => {
  const room = { id: 'r1', name: 'Astral', kind: 'room', members: 2, wall: [], unread: 0 };
  const html = renderToStaticMarkup(createElement(RoomChat, { room, messages: [], people: [], meId: 'sam', now: 0, onSend: async () => null }));
  it('has an edge to drag', () => {
    expect(html).toMatch(/class="rm-chat-grip" role="separator" aria-orientation="vertical" aria-label="Drag to widen the chat"/);
  });
  it('is as wide as it was left', () => {
    expect(html).toMatch(/class="rm-chat" style="--rm-chat-w:360px"/);
    expect(css).toMatch(/\.rm-chat \{ width: var\(--rm-chat-w, 360px\);/);
  });
  it('the edge sits on the chat’s line and shows the drag cursor', () => {
    expect(css).toMatch(/\.rm-chat-grip \{[^}]*cursor: col-resize/);
  });
  it('the full-page chat has no edge to drag', () => {
    const full = renderToStaticMarkup(createElement(RoomChat, { room, messages: [], people: [], meId: 'sam', now: 0, full: true, onSend: async () => null }));
    expect(full).not.toContain('rm-chat-grip');
  });
});
