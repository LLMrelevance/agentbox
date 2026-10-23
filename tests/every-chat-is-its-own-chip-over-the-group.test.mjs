// EVERY CHAT IS ITS OWN CHIP OVER THE GROUP (w-dcaa2c122e, 2026-10-23).
//
// Messages and Rooms were two places for one idea, and a chat with Maya and a
// chat with Maya and Priya sat in different lists from the room they came
// from. Asked for: "say I send a message to Margarette, then another to
// Margarette and Amy, I need to be able to access those chats separately",
// and named groups told apart from the chats made from them with a #.
// Measured on the drawn row: before, there was no row; the Messages page
// listed chats and the Rooms page rooms. Now one row over the chat holds the
// named groups (#, a border, your team's first), a rule, then the chats by
// first name with their faces, newest first, and More for the rest.
import { describe, it, expect } from 'vitest';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GroupBar, GroupMenuList, chipsShown, groupChoices, lastWords } from '../renderer/src/team/rooms/GroupList.tsx';
globalThis.React = React;

const face = (name) => ({ name, url: null });
const conv = (key, name, at, faces = [], extra = {}) => ({ key, kind: faces.length ? 'group' : 'room', id: key.split(':')[1], name, faces, last: '', at, unread: false, ...extra });
const list = [
  conv('room:team', 'Northwind', 10),
  conv('room:general', 'General', 50),
  conv('room:g1', 'Maya Chen', 40, [face('Maya Chen')], { last: 'Maya Chen: Yes' }),
  conv('room:g2', 'Maya Chen, Priya Nair', 30, [face('Maya Chen'), face('Priya Nair')], { last: 'Priya Nair: Back at 3' }),
  conv('direct:d1', 'Theo P.', 20, [face('Theo P.')], { last: 'You: On it' }),
];
const all = groupChoices(list, new Set(['room:team']));

describe('the list of groups', () => {
  it('keeps a chat with one person and a chat with that person and another apart', () => {
    expect(all.map((g) => g.name)).toEqual(['General', 'Maya', 'Maya, Priya', 'Theo', 'Northwind']);
  });
  it('lists a teammate’s direct record as a chat of its own, by its key', () => {
    expect(all.find((g) => g.name === 'Theo')?.key).toBe('direct:d1');
  });
  it('marks your team’s group, and only it', () => {
    expect(all.filter((g) => g.pinned).map((g) => g.name)).toEqual(['Northwind']);
  });
});

describe('what was said last', () => {
  it('drops the name in a chat with only that person', () => {
    expect(lastWords('Maya Chen: Yes', true)).toBe('Yes');
  });
  it('keeps a first name where several people talk', () => {
    expect(lastWords('Priya Nair: Back at 3', false)).toBe('Priya: Back at 3');
  });
  it('keeps You, and words with no speaker', () => {
    expect(lastWords('You: On it', true)).toBe('You: On it');
    expect(lastWords('Deleted a message', false)).toBe('Deleted a message');
  });
});

describe('which chips fit', () => {
  it('named groups first, your team’s leading, then chats newest first', () => {
    expect(chipsShown(all, 'room:team').shown.map((g) => g.name)).toEqual(['Northwind', 'General', 'Maya', 'Maya, Priya', 'Theo']);
  });
  it('the rest wait behind More', () => {
    expect(chipsShown(all, 'room:team', 3)).toMatchObject({ hidden: 2 });
  });
  it('the open one is always shown, in place of the last that fit', () => {
    const { shown } = chipsShown(all, 'direct:d1', 3);
    expect(shown.map((g) => g.name)).toEqual(['Northwind', 'General', 'Theo']);
  });
  it('a chat that is not open and does not fit is not forced in', () => {
    expect(chipsShown(all, 'room:general', 3).shown.map((g) => g.name)).toEqual(['Northwind', 'General', 'Maya']);
  });
});

describe('the row over the chat', () => {
  const html = renderToStaticMarkup(createElement(GroupBar, { groups: all, current: 'room:g1', onPick: () => {} }));
  it('draws named groups with a # and a rule before the chats', () => {
    expect(html.indexOf('gr-chip named')).toBeLessThan(html.indexOf('gr-sep'));
    expect(html.indexOf('gr-sep')).toBeLessThan(html.indexOf('gr-chip chat'));
    expect(html.match(/gr-hash/g)).toHaveLength(2);
  });
  it('lights the open one', () => {
    expect(html).toMatch(/class="gr-chip chat on"[^>]*>.*?<span>Maya<\/span>/);
  });
  it('has no More when everything fits', () => {
    expect(html).not.toContain('More');
  });
  it('dots an unread chat on its face, but not the open one', () => {
    const unread = all.map((g) => ({ ...g, unread: true }));
    const drawn = renderToStaticMarkup(createElement(GroupBar, { groups: unread, current: 'room:g1', onPick: () => {} }));
    expect(drawn.match(/class="gr-dot"/g)).toHaveLength(2);
  });
});

describe('the full list', () => {
  const html = renderToStaticMarkup(createElement(GroupMenuList, { groups: all, current: null, onPick: () => {} }));
  it('is Groups, then Direct messages', () => {
    expect(html.indexOf('>Groups<')).toBeLessThan(html.indexOf('>Direct messages<'));
    expect(html.indexOf('>Northwind<')).toBeLessThan(html.indexOf('>Direct messages<'));
    expect(html.indexOf('>Maya, Priya<')).toBeGreaterThan(html.indexOf('>Direct messages<'));
  });
  it('says nothing about direct messages when there are none', () => {
    const named = renderToStaticMarkup(createElement(GroupMenuList, { groups: all.filter((g) => !g.faces.length), current: null, onPick: () => {} }));
    expect(named).not.toContain('Direct messages');
  });
});
