// A ROOM'S SCREEN NAMES EVERYONE AND OPENS A ROOM-MATE'S ACTIVITY (w-3d0fa23ffb, 2026-10-22).
//
// The screen half of what the hour with a test account found. The chat named
// a message's author only off the wall, so anyone off it (invisible, or not on
// Rooms yet) wrote as "Someone". A person's Activity tab opened only for a
// teammate, so the founder saw "Progress" and "Agent hours since October" and
// no activity for a room-mate outside the team. And that chart said "since
// August" under an axis that began at July.
import { describe, it, expect } from 'vitest';
import { activityCards, activityShown, boardPeople, chartMonths, chatPeople } from '../renderer/src/team/rooms/room-rules.ts';

const card = (id, extra = {}) => ({ id, me: false, name: id, avatarUrl: null, teammate: false, showActivity: true, activity: null, ...extra });

describe("the chat's people", () => {
  const wall = [card('sav', { name: 'Sav F.' })];
  it('everyone in the room by name when the cloud says, invisible or not on Rooms yet', () => {
    const people = chatPeople({ wall, people: [{ id: 'sav', name: 'Sav F.', avatarUrl: null }, { id: 'maya', name: 'Maya C.', avatarUrl: null }] }, 'sav');
    expect(people).toEqual([{ id: 'sav', name: 'Sav F.', avatarUrl: null, me: true }, { id: 'maya', name: 'Maya C.', avatarUrl: null, me: false }]);
  });
  it('the wall on a cloud that cannot say', () => {
    expect(chatPeople({ wall, people: null }, 'me')).toEqual([{ id: 'sav', name: 'Sav F.', avatarUrl: null, me: false }]);
  });
});

describe('whose Activity tab opens', () => {
  it('a room-mate outside my team who shows it to their rooms', () => {
    expect(activityShown(card('maya', { activity: [] }))).toBe(true);
  });
  it('not one who keeps it from people outside their team', () => {
    expect(activityShown(card('maya', { activity: null }))).toBe(false);
  });
  it("a teammate's as before, off the team's cards", () => {
    expect(activityShown(card('teo', { teammate: true }))).toBe(true);
    expect(activityShown(card('teo', { teammate: true, showActivity: false }))).toBe(false);
  });
  it("the room's board still holds only people whose thread cards reach me", () => {
    expect(boardPeople([card('maya', { activity: [] }), card('teo', { teammate: true }), card('me', { me: true })]).map((c) => c.id)).toEqual(['teo', 'me']);
  });
});

describe("a room-mate's activity lines", () => {
  const activity = [{ title: 'Pick a font for the receipts', project: 'Web', state: 'waiting', at: 5 }, { title: 'Make the checkout faster', project: 'Web', state: 'running', at: 9 }];
  it('become the rows of their Activity tab', () => {
    const rows = activityCards(card('maya', { activity }), []);
    expect(rows.map((r) => [r.state, r.title, r.project, r.updatedAt])).toEqual([['waiting', 'Pick a font for the receipts', 'Web', 5], ['running', 'Make the checkout faster', 'Web', 9]]);
    expect(new Set(rows.map((r) => r.threadId)).size).toBe(2);
  });
  it("a teammate's come off the team's cards, never their presence", () => {
    const team = [{ personId: 'teo', threadId: 't1', title: 'From the team', state: 'running', updatedAt: 1 }];
    expect(activityCards(card('teo', { teammate: true, activity }), team).map((r) => r.title)).toEqual(['From the team']);
  });
});

describe('the hours chart', () => {
  it('starts from nothing the month before, and leaves that month unnamed', () => {
    const { months, named } = chartMonths([{ month: '2026-07', hours: 0 }, { month: '2026-08', hours: 900 }, { month: '2026-09', hours: 300 }]);
    expect(months.map((m) => m.month)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(named).toEqual([false, true, true]);
  });
  it('names every month when the first one already had hours', () => {
    expect(chartMonths([{ month: '2026-08', hours: 5 }, { month: '2026-09', hours: 3 }]).named).toEqual([true, true]);
  });
  it('names the last two when there are no hours yet', () => {
    expect(chartMonths([{ month: '2026-08', hours: 0 }, { month: '2026-09', hours: 0 }]).named).toEqual([true, true]);
  });
});
