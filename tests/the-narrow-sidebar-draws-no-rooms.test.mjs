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
// drew the Rooms header, both rooms and New room, exactly as wide did. Now the
// narrow strip stops at Messages, whose dot still carries a room's unread.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { useRooms } from '../renderer/src/team/rooms/useRooms.tsx';

const room = (id, extra = {}) => ({
  id, name: id, kind: 'room', teamId: null, listed: false, inviteOnly: false, role: 'member', members: 3,
  createdAt: 1, pinned: false, muted: false, unread: 0, lastAt: 1, agents: 0, wall: [], ...extra,
});
const state = (rooms) => ({ on: true, ready: true, rooms, messages: {}, me: null, ranks: {}, invites: [], mentions: [], error: null });

const noop = () => {};
function Section({ rooms, collapsed }) {
  return useRooms({ rooms, on: true, meId: 'me', myName: 'Ada', hasTeam: true, now: 0, toast: noop, onOpenDirect: noop, onTeamMessage: noop, onLeavePage: noop }).nav(collapsed);
}
const draw = (rooms, collapsed) => renderToStaticMarkup(createElement(Section, { rooms: state(rooms), collapsed }));
const two = [room('design'), room('launch')];

describe('the narrow sidebar', () => {
  const html = draw(two, true);
  it('has no Rooms header or its fold arrow', () => {
    expect(html).not.toContain('rm-sec');
    expect(html).not.toContain('>Rooms<');
  });
  it('has no row for any room', () => {
    expect(html).not.toContain('rm-nav');
    expect(html).not.toContain('design');
    expect(html).not.toContain('launch');
  });
  it('has no New room plus', () => {
    expect(html).not.toContain('rm-add');
    expect(html).not.toContain('New room');
  });
  it('keeps Messages', () => {
    expect(html).toContain('aria-label="Messages"');
  });
  it('puts a room with unread messages on the Messages dot', () => {
    expect(draw([room('design', { unread: 2 })], true)).toMatch(/class="workspace-tab[^"]*has-count[^"]*"[^>]*aria-label="Messages"/);
  });
  it('but not a muted one', () => {
    expect(draw([room('design', { unread: 2, muted: true })], true)).not.toContain('has-count');
  });
});

describe('the wide sidebar keeps the section', () => {
  const html = draw(two, false);
  it('header, every room, and New room', () => {
    expect(html).toContain('rm-sec');
    expect(html).toContain('>design<');
    expect(html).toContain('>launch<');
    expect(html).toContain('New room');
  });
});
