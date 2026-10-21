// A ROOM'S BOARD KEEPS EVERYONE'S FACES OVER IT (w-49cd37092c, round seven).
//
// Switching a room from Grid to Board took away the people: the grid's faces,
// names and agents working were gone, and the board said whose a thread was
// only line by line. Asked for a version that keeps everybody's little faces
// at the top. The board now opens on a row of them, each with a first name and
// how many agents they have working, and a face is also how you narrow the
// board to someone, as the View menu's People line does.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BoardFaces } from '../renderer/src/team/rooms/RoomView.tsx';
import { facePick } from '../renderer/src/team/rooms/room-rules.ts';
globalThis.React = React;

const card = (id, o = {}) => ({
  id, me: false, name: id, avatarUrl: null, headline: null, bio: null, agents: 1, level: 3, hoursTotal: 10, hoursWeek: 2, hoursToday: 1,
  streak: 1, byMonth: [], teammate: true, showActivity: true, status: null, workingOn: null, workingPrivate: false, ...o,
});
const maya = card('maya', { name: 'Maya Chen', agents: 4, avatarUrl: 'https://example.test/maya.jpg' });
const me = card('sam', { me: true, teammate: false, name: 'Sam Rivera', agents: 2 });
const jun = card('jun', { name: 'Jun Ota', agents: 0 });
const kai = card('kai', { name: 'Kai Mori', agents: null });
const people = [maya, me, jun, kai];
const all = people.map((p) => p.id);

const draw = (picked = all, list = people) => renderToStaticMarkup(React.createElement(BoardFaces, { people: list, picked, onPick: () => {} }));
const faces = (html) => [...html.matchAll(/<button[^>]*class="rm-bface[^"]*"[\s\S]*?<\/button>/g)].map((m) => m[0]);

describe('the faces over a room’s board', () => {
  it('has one face for each person on the board, in the grid’s order', () => {
    const got = faces(draw());
    expect(got).toHaveLength(4);
    expect(got.map((f) => f.match(/<span class="n">([^<]*)<\/span>/)?.[1])).toEqual(['Maya', 'You', 'Jun', 'Kai']);
  });
  it('shows a photo where there is one, and initials where not', () => {
    const [her, mine] = faces(draw());
    expect(her).toContain('src="https://example.test/maya.jpg"');
    expect(mine).toMatch(/rm-ini[^>]*>SA</);
  });
  it('says how many agents each has working, with the mark moving only while some are', () => {
    const [her, , idle, hidden] = faces(draw());
    expect(her).toMatch(/class="ag"><span class="live-mark "[\s\S]*?<\/span>4<\/span>/);
    expect(her).toContain('title="Maya Chen, 4 agents working"');
    expect(idle).toMatch(/class="ag"><span class="live-mark is-still"[\s\S]*?<\/span>0<\/span>/);
    expect(hidden).not.toContain('class="ag"');
  });
  it('dims nobody while the board shows everyone', () => {
    expect(draw()).not.toContain(' off"');
  });
  it('dims the people it leaves out once narrowed', () => {
    const got = faces(draw(['maya']));
    expect(got[0]).not.toContain(' off"');
    expect(got[0]).toContain('aria-pressed="true"');
    expect(got.slice(1).every((f) => f.includes('class="rm-bface off"'))).toBe(true);
  });
  it('is not drawn for a board of one', () => {
    expect(draw([me.id], [me])).toBe('');
  });
});

describe('picking a face', () => {
  it('narrows the board to them from everyone', () => {
    expect(facePick(all, all, 'maya')).toEqual(['maya']);
  });
  it('adds or drops someone once narrowed', () => {
    expect(facePick(['maya'], all, 'jun')).toEqual(['maya', 'jun']);
    expect(facePick(['maya', 'jun'], all, 'jun')).toEqual(['maya']);
  });
  it('goes back to everyone from the last one picked', () => {
    expect(facePick(['maya'], all, 'maya')).toEqual(all);
  });
});

describe('wired into the room', () => {
  const hook = readFileSync(new URL('../renderer/src/team/rooms/useRooms.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../renderer/src/team/rooms/rooms.css', import.meta.url), 'utf8');
  it('the board opens on the faces, narrowed the way the menu narrows it', () => {
    expect(hook).toMatch(/<BoardFaces people=\{onBoardPeople\} picked=\{onBoardPicked\} onPick=\{pickForBoard\} \/>\{renderBoard\(onBoardPicked, \{ later \}\)\}/);
  });
  it('a face left out is dimmed, not hidden', () => {
    expect(css).toMatch(/\.rm-bface\.off \{[^}]*opacity: \.?\d/);
  });
});
