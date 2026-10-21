// ACTIVITY ON A PERSON'S PAGE IS A BOARD (w-88e1e23325, 2026-10-21).
//
// "When I go to see my profile or my activity, I think I'd like it to be in
// board view." The Activity tab was a list (waiting, running, done today) with
// no word for when, while the room itself can already be the Inbox's board.
// Measured on the built app: Activity on my page was three lists.
//
// Now it is the Inbox's board for that one person, under a line saying it is
// their threads right now and what was done today. Who may see it is
// unchanged: me, and a teammate who shares their activity.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProfileActivity, ProfilePage } from '../renderer/src/team/rooms/RoomPerson.tsx';
globalThis.React = React;

const card = (id, o = {}) => ({ id, me: false, name: id, avatarUrl: null, headline: null, bio: null, agents: 0, level: 3, hoursTotal: 1, hoursWeek: 1, hoursToday: 0, streak: 1, byMonth: [], teammate: true, showActivity: true, status: null, workingOn: null, workingPrivate: false, ...o });
const asked = [];
const renderBoard = (people) => { asked.push(people); return React.createElement('div', { className: 'th-board' }, `board of ${people.join(',')}`); };

describe('the Activity tab', () => {
  it('is the board of my own threads on my page', () => {
    const html = renderToStaticMarkup(React.createElement(ProfileActivity, { card: card('sam', { me: true, teammate: false }), renderBoard }));
    expect(html).toContain('board of sam');
    expect(html).toContain('Your threads right now, and done today');
  });
  it('is the board of a teammate’s threads on theirs, and only theirs', () => {
    const html = renderToStaticMarkup(React.createElement(ProfileActivity, { card: card('maya', { name: 'Maya C.' }), renderBoard }));
    expect(html).toContain('board of maya');
    expect(html).toContain('Maya’s threads right now, and done today');
    expect(asked.at(-1)).toEqual(['maya']);
  });
});

describe('who has the tab', () => {
  const page = (c) => {
    const room = { id: 'r1', name: 'Northwind', wall: [c] };
    return renderToStaticMarkup(React.createElement(ProfilePage, { card: c, room, rooms: [room], cards: [], rank: 1, onRanks: () => {}, renderBoard }));
  };
  it('me, and a teammate who shares it', () => {
    expect(page(card('sam', { me: true, teammate: false }))).toContain('>Activity<');
    expect(page(card('maya'))).toContain('>Activity<');
  });
  it('never someone outside my team, nor a teammate who turned it off', () => {
    expect(page(card('alex', { teammate: false }))).not.toContain('>Activity<');
    expect(page(card('theo', { showActivity: false }))).not.toContain('>Activity<');
  });
});
