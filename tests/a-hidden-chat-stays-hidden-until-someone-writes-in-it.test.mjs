// A HIDDEN CHAT STAYS HIDDEN UNTIL SOMEONE WRITES IN IT (w-b5f23cff71).
//
// "A lot of these chats, I want to kind of hide. I don't want to really see
// them anymore and they're taking up space." Everything else drew a card for
// every chat you were ever in (her screenshot: Coworking, Maya, "Margarette,
// David" beside the people), with no way to put one away. Now a chat or a
// person's card can be hidden. A hidden chat comes back by itself when it
// moves again, the way an archived conversation does; a person stays hidden
// until you show them. "N hidden" under the cards shows them all again.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { splitHidden, hideMember, readHidden, writeHidden } from '../renderer/src/team/everything/members.ts';
import { TeamStrip } from '../renderer/src/team/everything/TeamStrip.tsx';

const me = { key: 'me', kind: 'me', name: 'You', agents: 1, now: null };
const team = { key: 'room:r-team', kind: 'chat', team: true, name: 'Team chat', faces: [], agents: 3, now: null, at: 50 };
const coworking = { key: 'room:r-co', kind: 'chat', name: 'Coworking', faces: [], agents: null, now: null, at: 40 };
const riley = { key: 'person:p-riley', kind: 'person', name: 'Riley Test', agents: null, now: null };
const ada = { key: 'mate:t-ada', kind: 'mate', name: 'Ada', letter: 'A', agents: 0, now: null };
const members = [me, team, coworking, riley, ada];

describe('which cards are hidden', () => {
  it('leaves out a chat you hid, and keeps the rest in order', () => {
    const { shown, hidden } = splitHidden(members, { 'room:r-co': 40 });
    expect(shown.map((m) => m.key)).toEqual(['me', 'room:r-team', 'person:p-riley', 'mate:t-ada']);
    expect(hidden.map((m) => m.key)).toEqual(['room:r-co']);
  });

  it('shows a hidden chat again once something new is said in it', () => {
    expect(splitHidden([{ ...coworking, at: 41 }], { 'room:r-co': 40 }).shown).toHaveLength(1);
    expect(splitHidden([{ ...coworking, at: 40 }], { 'room:r-co': 40 }).shown).toHaveLength(0);
  });

  it('keeps a hidden person hidden: a person card has no messages to bring it back', () => {
    expect(splitHidden([riley], hideMember({}, riley)).hidden).toHaveLength(1);
  });

  it('never hides you or an AI teammate', () => {
    expect(hideMember({}, me)).toEqual({});
    expect(hideMember({}, ada)).toEqual({});
    expect(hideMember({}, coworking)).toEqual({ 'room:r-co': 40 });
  });

  it('remembers what you hid between launches, and survives a broken store', () => {
    const box = new Map();
    const store = { getItem: (k) => box.get(k) ?? null, setItem: (k, v) => box.set(k, v) };
    writeHidden({ 'room:r-co': 40 }, store);
    expect(readHidden(store)).toEqual({ 'room:r-co': 40 });
    box.set('agentbox.everything.hidden', '[oops');
    expect(readHidden(store)).toEqual({});
  });
});

describe('the cards', () => {
  const strip = (props = {}) => renderToStaticMarkup(h(TeamStrip, { members: [me, team, riley, ada], picked: 'me', onPick() {}, onMove() {}, onHide() {}, ...props }));

  it('offer Hide on a chat and on a person, never on you or an AI teammate', () => {
    const html = strip();
    expect(html.match(/aria-label="Hide [^"]+"/g)).toEqual(['aria-label="Hide Team chat"', 'aria-label="Hide Riley Test"']);
  });

  it('say how many are hidden under them, and show them on a press', () => {
    expect(strip({ hiddenCount: 3, onShowHidden() {} })).toMatch(/class="ev-hidden"[^>]*>3 hidden</);
    expect(strip()).not.toContain('ev-hidden');
  });
});

describe('in the app', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  it('draws only the cards not hidden, and hiding the open one goes back to your threads', () => {
    expect(app).toContain('const evSplit = splitHidden(members, evHidden);');
    expect(app).toContain('<TeamStrip members={showHidden ? members : evSplit.shown}');
    expect(app).toMatch(/if \(evKey === m\.key\) pickMember\('me'\);/);
  });
});
