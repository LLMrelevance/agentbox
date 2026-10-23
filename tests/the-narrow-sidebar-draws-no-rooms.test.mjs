// THE NARROW SIDEBAR DRAWS NO ROOMS (w-af4b1dcbc6, 2026-10-21).
//
// Folded to its 38-point strip, the sidebar still drew the whole Rooms section
// under Messages: the fold arrow, one # per room and the New room plus. Every
// room wears the same #, so the strip was a column of marks nobody could tell
// apart. Asked for: "get rid of the downward arrow, the different channels, and
// the little plus icon. We don't need those in a condensed sidebar because you
// can't really tell which channel it is anyway."
//
// Measured by drawing the section through useRooms with two rooms: narrow, it
// drew the Rooms header, both rooms and New room, exactly as wide did. Since
// Groups (w-dcaa2c122e, 2026-10-23) the sidebar has no rows for rooms at all,
// narrow or wide: one row, Inbox. A room's unread is counted on the Groups tab.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, afterEach } from 'vitest';
import { WorkspaceNavigation } from '../renderer/src/components/WorkspaceNavigation.tsx';
import { useRooms } from '../renderer/src/team/rooms/useRooms.tsx';

const room = (id, extra = {}) => ({
  id, name: id, kind: 'room', teamId: null, listed: false, inviteOnly: false, role: 'member', members: 3,
  createdAt: 1, pinned: false, muted: false, unread: 0, lastAt: 1, agents: 0, wall: [], ...extra,
});
const state = (rooms) => ({ on: true, ready: true, rooms, messages: {}, me: null, ranks: {}, invites: [], mentions: [], error: null });
const noop = () => {};

const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
afterEach(() => {
  if (had) Object.defineProperty(globalThis, 'localStorage', had);
  else delete globalThis.localStorage;
});
const sidebar = (collapsed) => {
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem() {}, removeItem() {} }, configurable: true, writable: true });
  return renderToStaticMarkup(createElement(WorkspaceNavigation, {
    view: 'inbox', collapsed, inboxLabel: 'Inbox', onToggle() {}, onView() {}, onSearch() {}, onCompose() {}, onSettings() {}, onUpdate() {},
  }));
};
function Tab({ rooms }) {
  return useRooms({ rooms, on: true, meId: 'me', myName: 'Ada', hasTeam: true, now: 0, toast: noop, onOpenDirect: noop, onTeamMessage: noop, onLeavePage: noop }).roomTab;
}
const tab = (rooms) => renderToStaticMarkup(createElement(Tab, { rooms: state(rooms) }));

for (const collapsed of [true, false]) {
  describe(collapsed ? 'the narrow sidebar' : 'the wide sidebar', () => {
    const html = sidebar(collapsed);
    it('has no Rooms or Messages row, header or fold arrow', () => {
      expect(html).not.toContain('aria-label="Rooms"');
      expect(html).not.toContain('aria-label="Messages"');
      expect(html).not.toContain('rm-sec');
    });
    it('has no row for any room, and no New room plus', () => {
      expect(html).not.toContain('rm-nav');
      expect(html).not.toContain('rm-add');
      expect(html).not.toContain('New room');
    });
  });
}

describe('a room with unread messages', () => {
  it('is counted on the Groups tab', () => {
    expect(tab([room('design', { unread: 2 })])).toContain('Groups<b>1</b>');
  });
  it('but not a muted one', () => {
    expect(tab([room('design', { unread: 2, muted: true })])).not.toContain('<b>');
  });
});
