// THE ROOM TAB OPENS ITS ROOM UNDER THE THREADS TABS (w-49cd37092c, 2026-10-22).
//
// The room tab came back after Done, but clicking it opened the room as a page
// of its own with a back arrow, Tab never reached it, and its arrow showed all
// the time. "It should be treated as a tab like it was before... when you tab
// over to Astral, it's treated as a tab here and you only see the little
// dropdown when you hover over it... It brings you back and shows you your
// team or your room, not on a new page but within the context of that page."
// A room opened from its tab now sets no heading of its own, so the tabs stay
// over it with its tab lit, and Tab walks the state tabs and then the room.
//
// Since Groups (w-dcaa2c122e, 2026-10-23) that tab is Groups and every group
// opens in it (tests/the-groups-tab-holds-the-group-open-last). It is still a
// tab in all the ways below.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tabOrder } from '../renderer/src/team/rooms/room-rules.ts';
import { GroupsTab } from '../renderer/src/team/rooms/RoomTab.tsx';
import { StateTabs } from '../renderer/src/threads/Pages.tsx';
import { nextTab } from '../renderer/src/threads/page-rules.ts';
globalThis.React = React;

const STATE = ['inbox', 'progress', 'snoozed', 'done'];
const hook = fs.readFileSync(new URL('../renderer/src/team/rooms/useRooms.tsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../renderer/src/team/rooms/rooms.css', import.meta.url), 'utf8');
const tab = (on) => renderToStaticMarkup(createElement(GroupsTab, { count: 0, on, open: false, onOpen: () => {}, onMenu: () => {} }));

describe('the tab is a tab', () => {
  it('lights while its group is open there', () => {
    expect(tab(true)).toMatch(/class="tm-tab rm-tab on"/);
    expect(tab(false)).toMatch(/class="tm-tab rm-tab"/);
  });
  it('and then no state tab is lit', () => {
    const bar = renderToStaticMarkup(createElement(StateTabs, { view: 'inbox', counts: {}, onView: () => {}, dim: true }));
    expect(bar).not.toMatch(/class="tm-tab on/);
    expect(renderToStaticMarkup(createElement(StateTabs, { view: 'inbox', counts: {}, onView: () => {} }))).toMatch(/class="tm-tab on/);
  });
  it('shows its arrow only on hover, while its list is open, or with the keyboard on it', () => {
    expect(css).toMatch(/\.rm-tab \.rm-tabpick \{[^}]*opacity: 0/);
    expect(css).toMatch(/\.rm-tab:hover \.rm-tabpick, \.rm-tab \.rm-tabpick\.open, \.rm-tab \.rm-tabpick:focus-visible \{[^}]*opacity: 1/);
  });
});

describe('Tab walks onto it', () => {
  const order = tabOrder(STATE, true);
  it('after Done, and round to Needs you', () => {
    expect(order).toEqual([...STATE, 'room']);
    expect(nextTab(order, 'done')).toBe('room');
    expect(nextTab(order, 'room')).toBe('inbox');
  });
  it('and Shift-Tab back from Needs you', () => {
    expect(nextTab(order, 'inbox', true)).toBe('room');
    expect(nextTab(order, 'room', true)).toBe('done');
  });
  it('only the four tabs while Groups is off', () => {
    expect(tabOrder(STATE, false)).toEqual(STATE);
  });
  it('the app walks that order, from the state tabs and from the group in the tab', () => {
    expect(app).toMatch(/if \(roomsUi\.groupsTab\) \{\s*const order = roomTabOrder\(stateTabOrder, roomsUi\.groupsTab\);/);
    expect(app).toMatch(/if \(next === 'room'\) \{ roomsUi\.openTab\(\); setSelected\(0\); return; \}/);
    expect(app).toContain('} else setView(nextTab(stateTabOrder, view, e.shiftKey) as View);');
    expect(app).toMatch(/&& search === null && inboxDisplay\.view === 'list' && \(!roomShown \|\| roomsUi\.inTab\)/);
  });
});

describe('the group opens within the page', () => {
  it('with no heading of its own, so the tabs stay over it', () => {
    expect(hook).toMatch(/\} else if \(open && rooms && onChat\) \{\s*page = <GroupPage/);
  });
  it('the tab bar stays over it and is dimmed', () => {
    expect(app).toMatch(/after=\{roomsUi\.roomTab\} dim=\{roomShown\}/);
  });
  it('Escape steps out of it, back to the page’s tabs', () => {
    const close = hook.slice(hook.indexOf('const close = () => {'), hook.indexOf('const leave = '));
    expect(close).toContain('setOpenId(null); setEmpty(false);');
    expect(close).not.toContain('setListing');
  });
});
