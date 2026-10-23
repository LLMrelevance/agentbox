// WITH GROUPS THE PAGE'S NAME IS A MENU, AND THERE IS NO SIDEBAR (w-dcaa2c122e, 2026-10-23).
//
// Sixteen rounds of drawings ended here: "We don't even need a sidebar because
// functionally our navigation is up there." With Groups on, the top bar's first
// word, Inbox or Groups, opens a menu of both and of every group; a thread
// keeps that menu in its corner; your face at the right holds your account.
// Asked last: no numbers beside Inbox and Groups, the groups not indented so
// far, and "thread def needs inbox in the corner". Measured in the drawn menu
// before: group rows started 26 points right of Inbox's icon, Inbox and Groups
// carried counts that did not line up, and the trial sat behind thirteen
// localStorage switches.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PageMenuList, menuGroups, GROUPS_IN_MENU } from '../renderer/src/team/rooms/PageMenu.tsx';
import { AccountMenuList } from '../renderer/src/team/account-menu.tsx';
globalThis.React = React;

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const app = read('../renderer/src/App.tsx');
const hook = read('../renderer/src/team/rooms/useRooms.tsx');
const css = read('../renderer/src/team/rooms/rooms.css');

const named = (name, o = {}) => ({ key: `room:${name}`, name, faces: [], at: 0, unread: false, pinned: false, last: '', ...o });
const chat = (name, at, o = {}) => ({ key: `room:${name}`, name, faces: [{ id: name, name, avatarUrl: null }], at, unread: false, pinned: false, last: '', ...o });
const groups = (n) => [named('Northwind', { pinned: true }), named('General'), ...Array.from({ length: n - 2 }, (_, i) => chat(`P${i}`, 100 - i))];
const draw = (props) => renderToStaticMarkup(createElement(PageMenuList, {
  on: 'inbox', groups: groups(4), all: false, onAll() {}, onInbox() {}, onGroups() {}, onPick() {}, ...props,
}));
const rows = (html) => [...html.matchAll(/<span(?: class="rm-one")?>([^<]+)<\/span>/g)].map((m) => m[1]);

describe('the menu under the page’s name', () => {
  it('lists Inbox, Groups, then every group: named ones first, your pinned one leading, then chats newest first', () => {
    expect(rows(draw({}))).toEqual(['Inbox', 'Groups', 'Northwind', 'General', 'P0', 'P1']);
  });
  it('shows every group up to ten, with no All groups', () => {
    expect(GROUPS_IN_MENU).toBe(10);
    expect(menuGroups(groups(9), false)).toMatchObject({ more: 0 });
    expect(menuGroups(groups(10), false).shown).toHaveLength(10);
    expect(rows(draw({ groups: groups(10) }))).not.toContain('All groups');
  });
  it('past ten, ends in All groups, which shows the rest', () => {
    expect(menuGroups(groups(11), false)).toMatchObject({ more: 1 });
    expect(rows(draw({ groups: groups(11) })).at(-1)).toBe('All groups');
    expect(menuGroups(groups(11), true)).toMatchObject({ more: 0 });
    expect(menuGroups(groups(11), true).shown).toHaveLength(11);
    expect(rows(draw({ groups: groups(11), all: true }))).not.toContain('All groups');
  });
  it('carries no numbers at all', () => {
    expect(draw({ groups: groups(14) })).not.toMatch(/class="gt2-n"/);
  });
  it('marks a group with something unread, and only that one', () => {
    const html = draw({ groups: [named('Northwind', { unread: true }), named('General')] });
    expect(html.match(/class="gt2-dot"/g)).toHaveLength(1);
  });
  it('lights the page you are on', () => {
    expect(draw({ on: 'groups' })).toMatch(/class="gt2-row on"[^>]*><span class="gt2-ic">[\s\S]*?<\/span><span>Groups</);
  });
  it('starts its groups in the same column as Inbox and Groups, not indented under them', () => {
    expect(css).toMatch(/\.gt2-sub \{[^}]*padding: 2px 0;/);
  });
});

describe('your account, from your face', () => {
  const list = (props) => renderToStaticMarkup(createElement(AccountMenuList, {
    me: { id: 'p-me', name: 'Sam Rivera', email: 'sam@example.com', avatarUrl: null }, now: 0, onStatus() {}, ...props,
  }));
  it('holds what the sidebar’s account menu held, with Feedback beside Settings', () => {
    const html = list({ onInvite() {}, onSettings() {}, onFeedback() {}, onSignOut() {}, onInvisible() {} });
    const words = [...html.matchAll(/<span>([^<]+)<\/span>/g)].map((m) => m[1]);
    expect(words.slice(-5)).toEqual(['Go invisible', 'Invite people', 'Settings', 'Feedback', 'Sign out']);
  });
  it('the sidebar’s copy of it, handed no Feedback, has none', () => {
    expect(list({ onSettings() {} })).not.toContain('Feedback');
  });
});

describe('in the app', () => {
  it('no trial switch is left', () => {
    expect(fs.existsSync(new URL('../renderer/src/team/rooms/GroupTrials.tsx', import.meta.url))).toBe(false);
    for (const src of [app, hook]) {
      expect(src).not.toContain('trial()');
      expect(src).not.toContain("'groups.");
    }
  });
  it('with Groups on there is no sidebar, and with it off, or on a phone, the sidebar is as it was', () => {
    expect(app).toContain('const pageMenu = roomsUi.live && workspaceNavigation && !onPhone();');
    expect(app).toContain('{workspaceNavigation && !pageMenu && <WorkspaceNavigation');
  });
  it('a thread keeps the menu in its corner, before its trail', () => {
    expect(app).toMatch(/: focused \? \(pageMenu \? <div className="gt-titled gt-threadnav">\{teamMark\}\{pageNav\('inbox'\)\}<span className="gt-vsep" aria-hidden="true" \/><div className="workspace-task-header"/);
  });
  it('a new version, or a copy that has to move, still says so without the sidebar', () => {
    expect(app).toMatch(/pageMenu && <TopNotices\s+update=\{announcesUpdate\(/);
  });
  it('your face holds Feedback, and Settings and Sign out as the sidebar did', () => {
    expect(app).toMatch(/pageMenu && snap\?\.team\?\.me && <AccountFace /);
  });
});
