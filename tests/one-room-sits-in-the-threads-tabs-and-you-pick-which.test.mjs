// ONE ROOM SITS IN THE THREADS TABS, AND YOU PICK WHICH (w-49cd37092c, 2026-10-22).
//
// When rooms moved to a page of their own (w-a0429b3d5e) every room tab went,
// though what was asked there was one slot in the tab bar that switches
// between rooms. "Before we used to have the first room pinned in a tab on the
// Threads page and now that's just gone. We were meant to add a little
// dropdown or something that allows me to choose which page is pinned." Of
// three drawings, the picked one is a room tab after Done, its name and
// headcount, with a small arrow that opens "Room in this tab": the rooms, a
// check on the one shown, and No room tab. A room's menu on the Rooms page
// brings the tab back after No room tab.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readRoomTab, writeRoomTab, tabRoom } from '../renderer/src/team/rooms/room-rules.ts';
import { RoomTab, RoomTabMenu } from '../renderer/src/team/rooms/RoomTab.tsx';
import { RoomMenu } from '../renderer/src/team/rooms/RoomsPage.tsx';
import { StateTabs } from '../renderer/src/threads/Pages.tsx';
globalThis.React = React;

const room = (id, o = {}) => ({ id, name: id, kind: 'room', teamId: 't', listed: false, inviteOnly: false, role: 'member', members: 4, createdAt: 0, pinned: false, muted: false, unread: 0, lastAt: 0, agents: 0, wall: [], ...o });
const general = room('general', { name: 'General', members: 23 });
const astral = room('astral', { name: 'Astral', members: 8, pinned: true });
const crit = room('crit', { name: 'Design crit', members: 5 });
const chat = room('chat', { name: 'Maya, Jun', kind: 'group' });
const rooms = [general, astral, crit, chat];
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

describe('which room the tab shows', () => {
  it('the one you picked', () => {
    expect(tabRoom(rooms, 'crit')?.id).toBe('crit');
  });
  it('the first pinned room until you pick', () => {
    expect(tabRoom(rooms, null)?.id).toBe('astral');
  });
  it('the first room when none is pinned', () => {
    expect(tabRoom([general, crit], null)?.id).toBe('general');
  });
  it('the default again when the one you picked is gone', () => {
    expect(tabRoom(rooms, 'left-it')?.id).toBe('astral');
  });
  it('none after No room tab, and never a group chat', () => {
    expect(tabRoom(rooms, 'none')).toBeNull();
    expect(tabRoom([chat], null)).toBeNull();
    expect(tabRoom(rooms, 'chat')?.id).toBe('astral');
  });
  it('is remembered', () => {
    const store = memory();
    expect(readRoomTab(store)).toBeNull();
    writeRoomTab('crit', store);
    expect(readRoomTab(store)).toBe('crit');
    writeRoomTab('none', store);
    expect(readRoomTab(store)).toBe('none');
  });
});

describe('the tab', () => {
  const html = renderToStaticMarkup(createElement(RoomTab, { room: astral, count: 8, open: false, onOpen: () => {}, onMenu: () => {} }));
  it('is the room’s name and headcount after a rule, with an arrow for the picker', () => {
    expect(html).toMatch(/class="rm-sep"/);
    expect(html).toMatch(/class="tm-tab rm-tab"[\s\S]*Astral<b>8<\/b>/);
    expect(html).toMatch(/aria-label="Pick the room in this tab"/);
  });
  it('sits after Done in the tab bar', () => {
    const bar = renderToStaticMarkup(createElement(StateTabs, { view: 'inbox', counts: {}, onView: () => {}, after: createElement('span', { id: 'the-room-tab' }) }));
    expect(bar.indexOf('the-room-tab')).toBeGreaterThan(bar.lastIndexOf('Done'));
  });
});

describe('the picker', () => {
  const html = renderToStaticMarkup(createElement(RoomTabMenu, { rooms, current: 'astral', invisible: false, at: { left: 0, right: 100, bottom: 0 }, onPick: () => {}, onClose: () => {} }));
  const rows = [...html.matchAll(/<button[^>]*class="row[^"]*"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[0]);
  it('says what it is for', () => {
    expect(html).toContain('Room in this tab');
  });
  it('lists every room but group chats, each with its headcount', () => {
    expect(rows.slice(0, 3).map((r) => r.match(/<span>([^<]*)<\/span>/)?.[1])).toEqual(['General', 'Astral', 'Design crit']);
    expect(rows[0]).toContain('>23<');
    expect(html).not.toContain('Maya, Jun');
  });
  it('checks the one shown', () => {
    expect(rows[1]).toMatch(/class="row on"/);
    expect(rows[0]).not.toMatch(/class="row on"/);
  });
  it('ends with No room tab', () => {
    expect(rows.at(-1)).toContain('No room tab');
  });
});

describe('getting the tab back', () => {
  const items = (r, tabbed) => [...renderToStaticMarkup(createElement(RoomMenu, { room: r, at: { left: 0, right: 0, bottom: 0 }, onPick: () => {}, onClose: () => {}, tabbed }))
    .matchAll(/<span>([^<]+)<\/span>/g)].map((m) => m[1]);
  it('a room’s menu offers to show it in the Threads tab', () => {
    expect(items(crit, false)).toContain('Show in the Threads tab');
  });
  it('but not for the room already there, nor for a group chat', () => {
    expect(items(astral, true)).not.toContain('Show in the Threads tab');
    expect(items(chat, false)).not.toContain('Show in the Threads tab');
  });
});

describe('wired in the app', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  const hook = fs.readFileSync(new URL('../renderer/src/team/rooms/useRooms.tsx', import.meta.url), 'utf8');
  it('the tab bar is handed the room tab', () => {
    expect(app).toMatch(/<StateTabs[\s\S]{0,900}after=\{roomsUi\.roomTab\}/);
  });
  it('the room’s menu action puts it in the tab', () => {
    expect(hook).toMatch(/if \(action === 'tab'\) pickTab\(id\);/);
  });
});
