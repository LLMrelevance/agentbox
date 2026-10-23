// THE GROUPS TAB HOLDS THE GROUP OPEN LAST (w-dcaa2c122e, 2026-10-23).
//
// The tab after Done held one room you picked by hand, and every other room or
// chat opened as a page of its own from the sidebar's Messages and Rooms rows.
// Asked for: call the tab Groups and have it show "the most recent group you
// had selected", with every group, and every chat, one click away from it.
// Measured on the drawn tab before: the room's name and its headcount, a
// picker of rooms only, and No room tab. Now it says Groups with the count of
// groups that have something unread, its arrow lists every group and chat,
// and any group, from anywhere, opens in it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { groupInTab, tabOrder } from '../renderer/src/team/rooms/room-rules.ts';
import { GroupsTab } from '../renderer/src/team/rooms/RoomTab.tsx';
import { nextTab } from '../renderer/src/threads/page-rules.ts';
globalThis.React = React;

const hook = fs.readFileSync(new URL('../renderer/src/team/rooms/useRooms.tsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
const room = (id, kind = 'room', pinned = false) => ({ id, kind, pinned });
const rooms = [room('general'), room('team', 'room', true), room('chat-maya', 'group')];
const tab = (props) => renderToStaticMarkup(createElement(GroupsTab, { count: 0, open: false, onOpen: () => {}, onMenu: () => {}, ...props }));

describe('which group the tab opens', () => {
  it('the one open last', () => {
    expect(groupInTab(rooms, 'chat-maya')?.id).toBe('chat-maya');
  });
  it('your team’s group until one has been opened, or after you left the last one', () => {
    expect(groupInTab(rooms, null)?.id).toBe('team');
    expect(groupInTab(rooms, 'gone')?.id).toBe('team');
  });
  it('a chat when there is no named group', () => {
    expect(groupInTab([room('chat-maya', 'group')], null)?.id).toBe('chat-maya');
  });
  it('none when you are in no group', () => {
    expect(groupInTab([], null)).toBeNull();
  });
});

describe('the tab', () => {
  it('says Groups, after a rule', () => {
    expect(tab({})).toMatch(/class="rm-sep".*>Groups</);
  });
  it('counts groups with something unread, and says nothing when none has', () => {
    expect(tab({ count: 3 })).toContain('Groups<b>3</b>');
    expect(tab({ count: 0 })).not.toContain('<b>');
  });
  it('lights while a group is open in it', () => {
    expect(tab({ on: true })).toMatch(/class="tm-tab rm-tab on"/);
    expect(tab({ on: false })).toMatch(/class="tm-tab rm-tab"/);
  });
  it('is there whenever Groups is on, with or without a group', () => {
    expect(hook).toMatch(/const roomTab: ReactNode = live\s*\? <GroupsTab/);
  });
});

describe('Tab walks onto it', () => {
  const STATE = ['inbox', 'progress', 'snoozed', 'done'];
  it('after Done, and round to Needs you', () => {
    const order = tabOrder(STATE, true);
    expect(nextTab(order, 'done')).toBe('room');
    expect(nextTab(order, 'room')).toBe('inbox');
    expect(nextTab(order, 'inbox', true)).toBe('room');
  });
  it('not when Groups is off', () => {
    expect(tabOrder(STATE, false)).toEqual(STATE);
  });
  it('the app walks that order', () => {
    expect(app).toMatch(/if \(roomsUi\.groupsTab\) \{\s*const order = roomTabOrder\(stateTabOrder, roomsUi\.groupsTab\);/);
    expect(app).toMatch(/if \(next === 'room'\) \{ roomsUi\.openTab\(\); setSelected\(0\); return; \}/);
  });
});

describe('every group opens in the tab', () => {
  it('and the tab then holds it', () => {
    expect(hook).toMatch(/const openRoom = \(id: string\) => \{[^}]*setOpenId\(id\);[^}]*setLastId\(id\); writeRoomTab\(id\);/);
  });
  it('a mention, a chat started from someone’s page, a group joined or started all go through it', () => {
    expect(hook).toContain('const openMention = (m: RoomMention) => openRoom(m.roomId);');
    expect(hook).toMatch(/id = res\.value;\s*\}\s*openRoom\(id\);\s*\};/);
    expect(hook.match(/if \(res\.value\) openRoom\(res\.value\);/g)).toHaveLength(2);
  });
  it('a teammate’s direct record opens in its own view, over the group', () => {
    expect(hook).toMatch(/if \(key\.startsWith\('direct:'\)\) onOpenDirect\(key\.slice\('direct:'\.length\)\);/);
  });
  it('with no heading of its own, so the tabs stay over it', () => {
    expect(hook).toMatch(/\} else if \(open && rooms && onChat\) \{\s*page = <GroupPage/);
  });
});

describe('stepping back', () => {
  it('goes from everyone’s threads, Find groups or a person’s page to the group, and from the group out', () => {
    const close = hook.slice(hook.indexOf('const close = () => {'), hook.indexOf('const leave = '));
    const order = ['if (finding)', 'if (boardOn)', "if (pane !== 'wall')", 'setOpenId(null)'].map((s) => close.indexOf(s));
    expect(order.every((at) => at > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it('those pages say where back goes', () => {
    expect(hook).toContain("title: backTitle('Find groups')");
    expect(hook).toContain('heading = { title: backTitle(nameOf(open)) };');
  });
});
