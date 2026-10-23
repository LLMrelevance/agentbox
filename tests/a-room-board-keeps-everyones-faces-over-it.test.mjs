// A ROOM'S BOARD KEEPS EVERYONE'S FACES OVER IT (w-49cd37092c, round seven).
//
// Switching a room from Grid to Board took away the people: the grid's faces,
// names and agents working were gone, and the board said whose a thread was
// only line by line. Asked for a version that keeps everybody's little faces
// at the top. The board now opens on a row of them, each with a first name and
// how many agents they have working, and a face is also how you narrow the
// board to someone, as the View menu's People line does.
//
// Round twelve: of the layouts drawn since, G1 was picked, a row of tiles in
// the Grid's lines. Each tile is a 52px face, the first name, and the 9-dot
// mark with "3 working", never what anyone is working on. Eight to a row at
// most, and a bigger room splits into even rows rather than a short last one.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BoardFaces } from '../renderer/src/team/rooms/RoomView.tsx';
import { facePick, tilesPerRow } from '../renderer/src/team/rooms/room-rules.ts';
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
    expect(her).toMatch(/class="ag"><span class="live-mark "[\s\S]*?<\/span><b>4<\/b> working<\/span>/);
    expect(her).toContain('title="Maya Chen, 4 agents working"');
    expect(idle).toMatch(/class="ag"><span class="live-mark is-still"[\s\S]*?<\/span>Not running<\/span>/);
    expect(hidden).not.toContain('class="ag"');
  });
  it('never says what anyone is working on', () => {
    const busy = { ...maya, workingOn: 'Stripe webhook retries', status: 'Back Monday' };
    const html = draw(all, [busy, me]);
    expect(html).not.toContain('Stripe webhook retries');
    expect(html).not.toContain('Back Monday');
  });
  it('draws the faces at the Grid’s tile size', () => {
    expect(faces(draw())[0]).toMatch(/width:52px;height:52px/);
  });
  it('lays the tiles out as many to a row as tilesPerRow says', () => {
    expect(draw()).toMatch(/class="rm-bfaces" style="--per-row:4"/);
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

describe('how many tiles to a row', () => {
  it('everyone on one row up to eight', () => {
    expect(tilesPerRow(2)).toBe(2);
    expect(tilesPerRow(3)).toBe(3);
    expect(tilesPerRow(8)).toBe(8);
  });
  it('even rows past eight, never a short last row when it can be helped', () => {
    expect(tilesPerRow(9)).toBe(5);
    expect(tilesPerRow(12)).toBe(6);
    expect(tilesPerRow(16)).toBe(8);
    expect(tilesPerRow(17)).toBe(6);
  });
});

describe('wired into the room', () => {
  const hook = readFileSync(new URL('../renderer/src/team/rooms/useRooms.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../renderer/src/team/rooms/rooms.css', import.meta.url), 'utf8');
  it('the board opens on the faces, narrowed the way the menu narrows it', () => {
    expect(hook).toMatch(/<BoardFaces people=\{open!\.wall\} picked=\{onBoardPicked\} onPick=\{pickForBoard\} \/>\{renderBoard\(/);
  });
  it('a face left out is dimmed, not hidden', () => {
    expect(css).toMatch(/\.rm-bface\.off \{[^}]*opacity: \.?\d/);
  });
  it('the tiles sit in the Grid’s lines, as many across as the row holds', () => {
    const rule = css.match(/\.rm-bfaces \{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/grid-template-columns: repeat\(var\(--per-row, 8\), minmax\(0, 1fr\)\)/);
    expect(rule).toMatch(/border-top: 1px solid var\(--rm-line\)/);
    expect(rule).toMatch(/border-left: 1px solid var\(--rm-line\)/);
  });
});
