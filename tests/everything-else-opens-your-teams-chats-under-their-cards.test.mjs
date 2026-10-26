// "It feels like I'm going to a separate app, a separate thing, and I could
// easily never touch any of those things in the app." With teammates or Rooms
// on, chats lived on a Chats page of their own behind a sidebar row. Now the
// inbox has two tabs, Needs you and Everything else; Everything else draws
// your team as cards, and a card opens the chat the Chats page used to hold
// right under them (the teammate chat, the group chat, the direct record),
// so a short chat starts at the top as those chats always did. Checked on the
// built app with a made-up team (scripts/scratch, designs/w-b5f23cff71).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StateTabs } from '../renderer/src/threads/Pages.tsx';
import { TeamStrip, CornerFaces } from '../renderer/src/team/everything/TeamStrip.tsx';

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const app = read('renderer/src/App.tsx');
const rooms = read('renderer/src/team/rooms/useRooms.tsx');

const members = [
  { key: 'me', kind: 'me', name: 'You', faceName: 'Sam Rivera', agents: 2, now: 'Signup flow' },
  { key: 'room:r-team', kind: 'chat', team: true, name: 'Team chat', faces: [{ name: 'Maya Costa', url: null }], last: 'Theo: Lock screen works', unread: true, agents: null, now: null },
  { key: 'person:p-maya', kind: 'person', name: 'Maya Costa', agents: 14, now: 'Billing page', level: 80 },
  { key: 'mate:t-ada', kind: 'mate', name: 'Ada', letter: 'A', role: 'Maintainer', agents: 6, now: 'Triage' },
];
const strip = (props = {}) => renderToStaticMarkup(h(TeamStrip, { members, picked: 'me', onPick() {}, onMove() {}, ...props }));

describe('the tabs, with a team on', () => {
  const tabs = (on) => renderToStaticMarkup(h(StateTabs, { view: on ? 'progress' : 'inbox', counts: { inbox: 3, progress: 5 }, onView() {}, onSearch() {},
    team: { on, onNeeds() {}, onEverything() {}, corner: on ? null : h('i', { className: 'corner' }) } }));

  it('are two: Needs you with its number, and Everything else', () => {
    const html = tabs(false);
    expect(html.match(/class="tm-tab( [^"]*)?"/g)).toHaveLength(2);
    expect(html).toContain('Needs you<b>3</b>');
    expect(html).toContain('Everything else');
    expect(html).not.toContain('In progress');
  });

  it('light Everything else while it is open, and put the team\'s faces before Search only on Needs you', () => {
    expect(tabs(true)).toMatch(/class="tm-tab on"[^>]*>Everything else/);
    expect(tabs(false)).toMatch(/class="corner"><\/i><button[^>]*class="th-search"/);
    expect(tabs(true)).not.toContain('corner');
  });

  it('stay four without a team', () => {
    const html = renderToStaticMarkup(h(StateTabs, { view: 'inbox', counts: {}, onView() {} }));
    expect(html.match(/class="tm-tab( [^"]*)?"/g)).toHaveLength(4);
  });
});

describe('the cards', () => {
  it('can each be dragged, and say which one is open', () => {
    const html = strip();
    expect(html.match(/draggable="true"/g)).toHaveLength(4);
    expect(html).toMatch(/class="ev-card me on"/);
  });

  it('draw a chat as a chat: no fill, its people\'s faces, a speech mark and its newest line, never agents', () => {
    const html = strip();
    const chat = html.slice(html.indexOf('ev-card chat'), html.indexOf('ev-card person'));
    expect(chat).toContain('ev-bubble');
    expect(chat).toContain('ev-mosaic');
    expect(chat).toContain('Theo: Lock screen works');
    expect(chat).not.toContain('AGENTS WORKING');
    const person = html.slice(html.indexOf('ev-card person'));
    expect(person).not.toContain('ev-bubble');
    expect(person).toContain('14 AGENTS WORKING');
  });

  it('shrink to one line each while a chat is open, keeping each one\'s agents', () => {
    const html = strip({ compact: true });
    expect(html).toContain('ev-strip compact');
    expect(html).not.toContain('ev-t');
    expect(html).toMatch(/Maya Costa<\/span><\/span><span class="ev-c">.*14<\/span>/);
  });

  it('end with a card that makes a new AI teammate', () => {
    expect(strip({ onAdd() {} })).toContain('New teammate');
    expect(strip()).not.toContain('New teammate');
  });

  it('on Needs you are the people and AI teammates as faces, never the chats', () => {
    const html = renderToStaticMarkup(h(CornerFaces, { members, onPick() {} }));
    expect(html.match(/class="ev-cf"/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Open Maya Costa"');
  });
});

describe('a card opens the chat the Chats page held, under the cards', () => {
  it('has no Chats page or sidebar row of its own with a team on', () => {
    expect(app).toContain('groups={teamMode ? null : roomsUi.live ? roomsUi.sidebarGroups(');
    expect(app).toContain('<ChatsContext.Provider value={teamMode ? null : chatsValue}>');
  });

  it('draws the teammate chat, the group chat and a direct record under the cards', () => {
    expect(app).toContain('<div className="ev-space">{teammatesUi.page}</div>');
    expect(app).toContain('<div className="ev-space">{roomsUi.page}</div>');
    expect(app).toMatch(/\{inTeamChat && <>\{evTabsRow\}\{evTop\}<\/>\}\s*<ChatsFrame/);
  });

  it('opens a person\'s direct record, else your chat with them in Groups', () => {
    expect(app).toMatch(/const talk = person \? directWith\(person\) : null;\s*const chat = person && !talk \? personChats\.get\(person\) : undefined;/);
  });

  it('leaves the group\'s list and, for the team or one person, its people to the cards', () => {
    expect(rooms).toContain('page = <GroupPage key={open.id} inline={inline}');
    expect(rooms).toContain('people={inline && (open.teamId || open.members <= 2) ? null : <PeoplePanel');
  });

  it('keeps the order you dragged the cards into', () => {
    expect(app).toContain('const reorderMembers = (keys: string[]) => { setEvOrder(keys); writeOrder(keys); };');
  });
});
