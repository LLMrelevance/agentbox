// THE ROOM TAB OPENS ITS ROOM UNDER THE THREADS TABS (w-49cd37092c, 2026-10-22).
//
// The room tab came back after Done, but clicking it opened the room as a page
// of its own with a back arrow, Tab never reached it, and its arrow showed all
// the time. "It should be treated as a tab like it was before... when you tab
// over to Astral, it's treated as a tab here and you only see the little
// dropdown when you hover over it... It brings you back and shows you your
// team or your room, not on a new page but within the context of that page."
// Before rooms moved to their own page (3b829494, w-a0429b3d5e), a room opened
// from its tab set no heading of its own, so the Threads title and tabs stayed
// over it with its tab lit, and Tab walked the state tabs and then the room.
// That is back for the room tab; a room opened from the Rooms page is still a
// page with a back arrow.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tabOrder } from '../renderer/src/team/rooms/room-rules.ts';
import { RoomTab } from '../renderer/src/team/rooms/RoomTab.tsx';
import { StateTabs } from '../renderer/src/threads/Pages.tsx';
import { nextTab } from '../renderer/src/threads/page-rules.ts';
globalThis.React = React;

const astral = { id: 'astral', name: 'Astral', kind: 'room', members: 8, pinned: true, wall: [] };
const STATE = ['inbox', 'progress', 'snoozed', 'done'];
const hook = fs.readFileSync(new URL('../renderer/src/team/rooms/useRooms.tsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../renderer/src/team/rooms/rooms.css', import.meta.url), 'utf8');

describe('the room tab is a tab', () => {
  it('lights while its room is open there', () => {
    expect(renderToStaticMarkup(createElement(RoomTab, { room: astral, count: 8, on: true, open: false, onOpen: () => {}, onMenu: () => {} }))).toMatch(/class="tm-tab rm-tab on"/);
    expect(renderToStaticMarkup(createElement(RoomTab, { room: astral, count: 8, on: false, open: false, onOpen: () => {}, onMenu: () => {} }))).toMatch(/class="tm-tab rm-tab"/);
  });
  it('and then no state tab is lit', () => {
    const bar = renderToStaticMarkup(createElement(StateTabs, { view: 'inbox', counts: {}, onView: () => {}, dim: true }));
    expect(bar).not.toMatch(/class="tm-tab on/);
    expect(renderToStaticMarkup(createElement(StateTabs, { view: 'inbox', counts: {}, onView: () => {} }))).toMatch(/class="tm-tab on/);
  });
  it('shows its arrow only on hover, while its picker is open, or with the keyboard on it', () => {
    expect(css).toMatch(/\.rm-tab \.rm-tabpick \{[^}]*opacity: 0/);
    expect(css).toMatch(/\.rm-tab:hover \.rm-tabpick, \.rm-tab \.rm-tabpick\.open, \.rm-tab \.rm-tabpick:focus-visible \{[^}]*opacity: 1/);
  });
});

describe('Tab walks onto it', () => {
  const order = tabOrder(STATE, 'astral');
  it('after Done, and round to Needs you', () => {
    expect(order).toEqual([...STATE, 'room']);
    expect(nextTab(order, 'done')).toBe('room');
    expect(nextTab(order, 'room')).toBe('inbox');
  });
  it('and Shift-Tab back from Needs you', () => {
    expect(nextTab(order, 'inbox', true)).toBe('room');
    expect(nextTab(order, 'room', true)).toBe('done');
  });
  it('only the four tabs with no room in the tab', () => {
    expect(tabOrder(STATE, null)).toEqual(STATE);
  });
  it('the app walks that order, from Threads and from the room in its tab', () => {
    expect(app).toMatch(/if \(roomsUi\.tabRoomId\) \{\s*const order = roomTabOrder\(stateTabOrder, roomsUi\.tabRoomId\);/);
    expect(app).toMatch(/if \(next === 'room'\) \{ roomsUi\.openTab\(\); setSelected\(0\); return; \}/);
    expect(app).toContain('} else setView(nextTab(stateTabOrder, view, e.shiftKey) as View);');
    expect(app).toMatch(/&& search === null && inboxDisplay\.view === 'list' && \(!roomShown \|\| roomsUi\.inTab\)/);
  });
});

describe('the room opens within Threads', () => {
  it('from its tab it sets no heading of its own, so the Threads title and tabs stay', () => {
    expect(hook).toMatch(/heading = inTab && pane === 'wall' \? null : \{ title: backTitle\(open\.name\) \};/);
  });
  it('the tab bar stays over it and is dimmed', () => {
    expect(app).toMatch(/after=\{roomsUi\.roomTab\} dim=\{roomShown\}/);
  });
  it('the sidebar keeps Threads lit, not Rooms', () => {
    expect(app).toMatch(/roomOpen=\{\(roomShown && !roomsUi\.inTab\) \|\| directOnMessages\}/);
    expect(hook).toMatch(/const roomsLit = listing \|\| finding \|\| \(!!open && !full && open\.kind !== 'group' && !inTab\);/);
  });
  it('Escape goes back to Threads, not to the Rooms page', () => {
    expect(hook).toMatch(/setListing\(open\?\.kind !== 'group' && !inTab\); setInTab\(false\);/);
  });
  it('a room opened any other way is still its own page', () => {
    expect(hook).toMatch(/const openRoom = \(id: string, \{ asFull = false, inTab: tab = false \} = \{\}\) => \{[^}]*setInTab\(tab\);/);
  });
});
