// A ROOM SHOWS ITS PEOPLE'S THREADS AS A BOARD (w-49cd37092c, 2026-10-21).
//
// A room had one view, the grid of people, while the Inbox's View and filters
// menu could put any teammate's threads on your own board. So your inbox
// showed the team and the team's room could not. Measured on the built app with
// a made-up team of five: the room's header had no View button and B did
// nothing there, and the Inbox menu opened on "People: Everyone, Just you, …".
//
// Now a room's header has the Inbox's View button: Grid or Board, and on the
// board whose threads. B flips it. The board holds me and the teammates whose
// Activity I may open, never a stranger. With Rooms on, the Inbox is yours
// alone: no People line, no faces on its button, and Privacy stays.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { boardPeople, boardPicked, readRoomView, writeRoomView, readBoardPicks, writeBoardPicks } from '../renderer/src/team/rooms/room-rules.ts';
import { inboxEveryone } from '../renderer/src/threads/people-rules.ts';
import { HeaderActions, DisplayMenu } from '../renderer/src/threads/Pages.tsx';
import { RoomViewButton } from '../renderer/src/team/rooms/RoomView.tsx';
import { RoomPage } from '../renderer/src/team/rooms/RoomPage.tsx';
globalThis.React = React;

const card = (id, o = {}) => ({
  id, me: false, name: id, avatarUrl: null, headline: null, bio: null, agents: 1, level: 3, hoursTotal: 10, hoursWeek: 2, hoursToday: 1,
  streak: 1, byMonth: [], teammate: true, showActivity: true, status: null, workingOn: null, workingPrivate: false, ...o,
});
const me = card('sam', { me: true, teammate: false });
const maya = card('maya');
const quiet = card('theo', { showActivity: false });
const stranger = card('alex', { teammate: false });
const wall = [maya, me, quiet, stranger];

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

describe('who is on a room’s board', () => {
  it('me, and a teammate who shares their activity', () => {
    expect(boardPeople(wall).map((c) => c.id)).toEqual(['maya', 'sam']);
  });
  it('never a teammate who turned their activity off, nor someone outside my team', () => {
    expect(boardPeople([quiet, stranger])).toEqual([]);
  });
  it('me alone in a room of strangers', () => {
    expect(boardPeople([me, stranger]).map((c) => c.id)).toEqual(['sam']);
  });
});

describe('whose threads the board shows', () => {
  const people = [maya, me];
  it('everyone on it, until something is picked', () => {
    expect(boardPicked(null, people)).toEqual(['maya', 'sam']);
  });
  it('the people picked', () => {
    expect(boardPicked(['maya'], people)).toEqual(['maya']);
  });
  it('drops someone no longer on it, and goes back to everyone when nobody is left', () => {
    expect(boardPicked(['maya', 'gone'], people)).toEqual(['maya']);
    expect(boardPicked(['gone'], people)).toEqual(['maya', 'sam']);
  });
});

describe('what a room remembers', () => {
  it('opens as the grid, and as the board once you chose it', () => {
    const store = memory();
    expect(readRoomView(store)).toBe('grid');
    writeRoomView('board', store);
    expect(readRoomView(store)).toBe('board');
    writeRoomView('grid', store);
    expect(readRoomView(store)).toBe('grid');
  });
  it('each room’s pick, and nothing from a broken entry', () => {
    const store = memory();
    writeBoardPicks({ r1: ['maya'] }, store);
    expect(readBoardPicks(store)).toEqual({ r1: ['maya'] });
    store.setItem('rooms.board.people', '[1,2]');
    expect(readBoardPicks(store)).toEqual({});
    store.setItem('rooms.board.people', '{nope');
    expect(readBoardPicks(store)).toEqual({});
  });
});

describe('the room’s View button', () => {
  const draw = (view, picked) => renderToStaticMarkup(React.createElement(RoomViewButton, {
    view, onView: () => {}, people: [me, maya], picked, onPick: () => {}, unseen: 0,
  }));
  const dot = (html) => /<i><\/i>|<i\/>/.test(html);
  it('is the filters button, with B on it', () => {
    const html = draw('grid', ['maya', 'sam']);
    expect(html).toContain('class="th-disp');
    expect(html).toContain('View (B)');
  });
  it('lights its dot only when the board leaves someone out', () => {
    expect(dot(draw('board', ['maya', 'sam']))).toBe(false);
    expect(dot(draw('board', ['maya']))).toBe(true);
    expect(dot(draw('grid', ['maya']))).toBe(false);
  });
});

describe('the room page', () => {
  const room = { id: 'r1', name: 'Northwind', kind: 'room', teamId: 't', listed: false, inviteOnly: false, role: 'owner', members: 4, createdAt: 0, pinned: true, muted: false, unread: 0, lastAt: 0, agents: 0, wall };
  const page = (board) => renderToStaticMarkup(React.createElement(RoomPage, {
    room, rooms: [room], cards: [], ranks: {}, me: null, now: 0, pane: 'wall', link: null, chat: null, board,
    picked: new Set(), onPick: () => {}, onPane: () => {}, onComeBack: () => {}, onCopyLink: () => {},
  }));
  it('draws the grid of people by default', () => {
    expect(page(undefined)).toContain('rm-grid');
  });
  it('draws the board in the grid’s place when handed one', () => {
    const html = page(React.createElement('div', { id: 'their-board' }));
    expect(html).toContain('their-board');
    expect(html).not.toContain('rm-grid');
    expect(html).toContain('rm-main board');
  });
});

describe('the Inbox with Rooms on', () => {
  const sam = { id: 'sam', name: 'Sam Rivera', email: 'sam@example.test' };
  const mayaP = { id: 'maya', name: 'Maya Chen', email: 'maya@example.test' };
  const team = [sam, mayaP];
  const pick = (everyone) => ({ everyone, picked: everyone.map((p) => p.id), me: 'sam', onPick: () => {} });
  const display = { view: 'list', sort: 'priority', priorities: [], projects: [], updated: 'any' };

  it('is yours alone with Rooms on, and the whole team with Rooms off', () => {
    expect(inboxEveryone(team, 'sam', true)).toEqual([sam]);
    expect(inboxEveryone(team, 'sam', false)).toEqual(team);
  });
  it('has no People line and no faces, and keeps Privacy', () => {
    const people = pick(inboxEveryone(team, 'sam', true));
    const menu = renderToStaticMarkup(React.createElement(DisplayMenu, { page: 'inbox', display, onDisplay: () => {}, products: [], people }));
    expect(menu).not.toContain('>People<');
    expect(menu).toContain('Privacy');
    const button = renderToStaticMarkup(React.createElement(HeaderActions, { page: 'inbox', display, onDisplay: () => {}, products: [], onCompose: () => {}, people }));
    expect(button).not.toContain('tm-av');
  });
  it('still offers People with Rooms off', () => {
    const menu = renderToStaticMarkup(React.createElement(DisplayMenu, { page: 'inbox', display, onDisplay: () => {}, products: [], people: pick(inboxEveryone(team, 'sam', false)) }));
    expect(menu).toContain('>People<');
  });
});

// Round two, the same day: the first build squeezed four columns beside the
// chat until titles wrapped. Asked for the Inbox's way instead: the columns
// keep their width and the board scrolls sideways. And the People label sat
// halfway down two rows of names instead of beside the first.
describe('the room’s board is the Inbox’s board at its own width', () => {
  const rooms = readFileSync(new URL('../renderer/src/team/rooms/rooms.css', import.meta.url), 'utf8');
  const pages = readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
  it('keeps the Inbox’s columns, never narrower', () => {
    expect(pages).toMatch(/\.th-board \{[^}]*grid-template-columns: repeat\(4, minmax\(260px, 1fr\)\)/);
    const ours = (rooms.match(/\.rm-main\.board \.th-board \{[^}]*\}/g) ?? []).join('');
    expect(ours).not.toMatch(/grid-template-columns|min-width|width:/);
  });
  it('scrolls sideways inside the room when the columns do not fit', () => {
    expect(rooms).toMatch(/\.rm-main\.board \{[^}]*overflow: auto/);
  });
});

describe('a menu label beside rows of chips', () => {
  const pages = readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
  const chip = Number(pages.match(/\.th-pop \.opts > button \{[^}]*?height: (\d+)px/)?.[1]);
  it('sits beside the first row, at the height of one chip', () => {
    const rule = pages.match(/\.th-pop \.line:has\(> \.opts\) > \.lab \{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/align-self: start/);
    expect(Number(rule.match(/line-height: (\d+)px/)?.[1])).toBe(chip);
    expect(chip).toBe(26);
  });
});

describe('wired in the app', () => {
  const app = readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('B flips a room between grid and board', () => {
    expect(app).toMatch(/\(e\.key === 'b' \|\| e\.key === 'B'\) && roomsUi\.flipView\) \{ e\.preventDefault\(\); roomsUi\.flipView\(\); \}/);
  });
  it('the header shows the room’s View button over a room', () => {
    expect(app).toMatch(/<HeaderActions[\s\S]{0,1400}view=\{roomShown \? roomsUi\.viewButton : null\}/);
  });
  it('the Inbox’s people go through the Rooms rule', () => {
    expect(app).toMatch(/inboxEveryone\([\s\S]{0,160}roomsOn\)/);
  });
});
