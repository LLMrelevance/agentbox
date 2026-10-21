// A CONVERSATION CAN BE PINNED TO THE TOP FROM ITS DOTS.
//
// Pointing at a conversation on the Messages page shows ⋯, and its menu is
// where a conversation is set the way you want it, as in the chat apps people
// already use. For a direct chat that menu held one thing, Mark as read or
// unread. It now also pins the conversation above the rest of the list, on
// this computer, with a pin drawn on the row; pinned ones keep newest first
// among themselves.
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessagesPage, conversationMenu, inListOrder, readPins, togglePin, PIN_KEY } from '../renderer/src/team/rooms/MessagesPage.tsx';

const T = new Date(2026, 9, 21, 10, 0).getTime();
const conv = (key, min, extra = {}) => ({ key, kind: 'direct', id: key, name: key, faces: [], last: 'hi', at: T + min * 60_000, unread: false, ...extra });
const memory = (start = {}) => {
  const m = new Map(Object.entries(start));
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), dump: () => m.get(PIN_KEY) };
};

describe('the menu on a conversation’s dots', () => {
  it('offers Pin to top on every kind, after Mark as read or unread', () => {
    expect(conversationMenu(conv('a', 0, { unread: true })).map((r) => r.label)).toEqual(['Mark as read', 'Pin to top']);
    expect(conversationMenu(conv('a', 0, { kind: 'room' })).map((r) => r.label)).toEqual(['Mark as unread', 'Pin to top', 'Mute']);
    expect(conversationMenu(conv('a', 0, { kind: 'group', muted: true })).map((r) => r.label)).toEqual(['Mark as unread', 'Pin to top', 'Unmute', 'Leave conversation']);
  });

  it('offers Unpin on one already pinned', () => {
    expect(conversationMenu(conv('a', 0, { pinned: true })).map((r) => r.label)).toEqual(['Mark as unread', 'Unpin']);
  });
});

describe('the order of the list', () => {
  const list = [conv('old', 1), conv('newest', 9), conv('middle', 5), conv('oldest', 0)];

  it('is newest first when nothing is pinned', () => {
    expect(inListOrder(list, new Set()).map((c) => c.key)).toEqual(['newest', 'middle', 'old', 'oldest']);
  });

  it('puts pinned ones on top, newest first among themselves', () => {
    expect(inListOrder(list, new Set(['oldest', 'old'])).map((c) => c.key)).toEqual(['old', 'oldest', 'newest', 'middle']);
  });

  it('is not moved by a pin for a conversation that is not in it', () => {
    expect(inListOrder(list, new Set(['gone'])).map((c) => c.key)).toEqual(['newest', 'middle', 'old', 'oldest']);
  });

  it('marks each pinned conversation as pinned, and no other', () => {
    expect(inListOrder(list, new Set(['old'])).map((c) => !!c.pinned)).toEqual([true, false, false, false]);
  });
});

describe('the pins kept on this computer', () => {
  it('are read back after they are written, and an unpin takes one out', () => {
    const s = memory();
    expect([...readPins(s)]).toEqual([]);
    togglePin('direct:w-1', s);
    togglePin('room:r1', s);
    expect([...readPins(s)].sort()).toEqual(['direct:w-1', 'room:r1']);
    togglePin('direct:w-1', s);
    expect([...readPins(s)]).toEqual(['room:r1']);
  });

  it('read as none when what is stored is not a list', () => {
    expect([...readPins(memory({ [PIN_KEY]: '{"a":1}' }))]).toEqual([]);
    expect([...readPins(memory({ [PIN_KEY]: 'not json' }))]).toEqual([]);
  });
});

describe('a pinned row', () => {
  const draw = (c) => renderToStaticMarkup(React.createElement(MessagesPage, { list: [c], onKey: null, now: T, onPick: () => {}, onAction: () => {}, pins: new Set(c.pinned ? [c.key] : []) }, null));

  it('carries a pin, and an unpinned row does not', () => {
    expect(draw(conv('a', 0, { pinned: true }))).toContain('rm-conv-pin');
    expect(draw(conv('a', 0))).not.toContain('rm-conv-pin');
  });

  it('keeps its unread dot beside the pin', () => {
    const html = draw(conv('a', 0, { pinned: true, unread: true }));
    expect(html).toContain('rm-conv-pin');
    expect(html).toContain('class="rm-unread"');
  });
});
