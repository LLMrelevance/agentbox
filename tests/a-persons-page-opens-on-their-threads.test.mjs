// A PERSON'S PAGE OPENS ON THEIR THREADS (w-dcaa2c122e, 2026-10-23).
//
// With Groups, clicking someone in a group's People list opens their page, and
// what you came for is what they are working on. Their page opened on
// Progress, the hours chart, with Today's activity (their threads as a board)
// as the second tab. Measured on the drawn page: Progress came first and was
// the one lit. Now Today's activity comes first and is lit, Progress second;
// someone whose activity you may not see still gets Progress alone, lit.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProfilePage } from '../renderer/src/team/rooms/RoomPerson.tsx';
globalThis.React = React;

const card = (id, o = {}) => ({ id, me: false, name: id, avatarUrl: null, headline: null, bio: null, agents: 0, level: 3, hoursTotal: 1, hoursWeek: 1, hoursToday: 0, streak: 1, byMonth: [], teammate: true, showActivity: true, status: null, workingOn: null, workingPrivate: false, ...o });
const renderBoard = (people) => React.createElement('div', { className: 'th-board' }, `board of ${people.join(',')}`);
const page = (c) => {
  const room = { id: 'r1', name: 'Northwind', wall: [c] };
  return renderToStaticMarkup(React.createElement(ProfilePage, { card: c, room, rooms: [room], cards: [], rank: 1, onRanks: () => {}, renderBoard }));
};
const tabs = (html) => [...html.matchAll(/<button type="button" class="tm-tab( on)?">([^<]+)/g)].map((m) => `${m[2]}${m[1] ? ' (lit)' : ''}`);

describe('a teammate who shares their activity', () => {
  it('has Today’s activity first, then Progress', () => {
    expect(tabs(page(card('maya')))).toEqual(['Today’s activity (lit)', 'Progress']);
  });
  it('opens on their board, not the hours chart', () => {
    const html = page(card('maya'));
    expect(html).toContain('board of maya');
    expect(html).not.toContain('rm-pgrid');
  });
  it('is the same on my own page', () => {
    expect(tabs(page(card('sam', { me: true, teammate: false })))).toEqual(['Today’s activity (lit)', 'Progress']);
  });
});

describe('someone whose activity I may not see', () => {
  it('has Progress alone, lit', () => {
    expect(tabs(page(card('theo', { showActivity: false })))).toEqual(['Progress (lit)']);
    expect(tabs(page(card('alex', { teammate: false })))).toEqual(['Progress (lit)']);
  });
  it('shows the hours chart', () => {
    expect(page(card('alex', { teammate: false }))).toContain('rm-pgrid');
  });
});
