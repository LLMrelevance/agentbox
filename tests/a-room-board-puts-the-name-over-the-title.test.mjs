// A ROOM'S BOARD PUTS THE NAME OVER THE TITLE (w-49cd37092c, round six).
//
// Of five ways drawn to show whose a thread is, name over title was picked:
// the face beside two lines, the first name small above the title. The board
// before it put the title first and the face and name after it on the same
// line, so the name took width from the title and most titles were cut. Now
// the title has all the width beside the face, wraps once before it is cut,
// and the whole of it shows on hover.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomBoard } from '../renderer/src/team/rooms/RoomBoard.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';
globalThis.React = React;

const NOW = Date.parse('2026-10-21T15:00:00Z');
const sam = { id: 'p-sam', name: 'Sam Rivera', email: 'sam@example.test', avatarUrl: null };
const maya = { id: 'p-maya', name: 'Maya Chen', email: 'maya@example.test', avatarUrl: 'https://example.test/maya.jpg' };
const products = [{ slug: 'checkout', name: 'Checkout' }];
const display = { view: 'board', sort: 'updated', priorities: [], projects: [], updated: 'any', privacy: 'any' };
const LONG = 'Stripe webhook retries drop the second attempt after a timeout';
const card = (threadId, title, state) => ({
  personId: maya.id, threadId, visible: true, title, project: 'Checkout', state, priority: null, problem: null, progress: null, solution: null,
  blockedBy: [], blocks: [], people: null, updatedAt: NOW - 60_000,
});
const mine = { id: 'w-1', product: 'checkout', title: 'Pricing page copy', body: '', status: 'open', labels: [], createdAt: NOW - 600_000, updatedAt: NOW - 60_000 };

const draw = () => renderToStaticMarkup(React.createElement(TeamContext.Provider, {
  value: { state: { since: null }, me: sam.id, byId: new Map([[sam.id, sam], [maya.id, maya]]), products: new Map() },
}, React.createElement(RoomBoard, {
  items: [mine], products, display, now: NOW, stateOf: () => 'waiting',
  cards: [card('m1', LONG, 'running')], picked: [sam.id, maya.id], onOpenItem: () => {}, onOpenCard: () => {},
})));
const row = (html, title) => html.match(new RegExp(`<button[^>]*class="rm-brow[^"]*"[^>]*>(?:(?!</button>)[\\s\\S])*?${title}[\\s\\S]*?</button>`))?.[0] ?? '';

describe('a line on the room’s board', () => {
  it('is the face, then the first name over the title', () => {
    const line = row(draw(), 'Stripe webhook');
    expect(line).toMatch(/<img class="tm-av tm-ph" src="https:\/\/example.test\/maya.jpg"[^>]*\/?><span class="txt"><span class="who">Maya<\/span><span class="t">Stripe webhook/);
  });
  it('says You on your own, with your initials where there is no photo', () => {
    const line = row(draw(), 'Pricing page copy');
    expect(line).toMatch(/<span class="tm-av you"[^>]*>Sa<\/span><span class="txt"><span class="who">You<\/span><span class="t">Pricing page copy<\/span>/);
  });
  it('carries the whole title for a hover, however it is cut on screen', () => {
    expect(row(draw(), 'Stripe webhook')).toContain(`title="${LONG}"`);
  });
});

describe('how much of a title shows', () => {
  const rooms = readFileSync(new URL('../renderer/src/team/rooms/rooms.css', import.meta.url), 'utf8');
  const title = rooms.match(/\.rm-brow \.t \{([^}]*)\}/)?.[1] ?? '';
  it('wraps once, then is cut', () => {
    expect(title).toMatch(/-webkit-line-clamp: 2/);
    expect(title).not.toMatch(/white-space: nowrap/);
  });
  it('a name is one line, whatever its length', () => {
    expect(rooms.match(/\.rm-brow \.who \{([^}]*)\}/)?.[1] ?? '').toMatch(/white-space: nowrap/);
  });
});
