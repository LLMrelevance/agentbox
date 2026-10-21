// A ROOM READS THE WAY IT WAS APPROVED (w-3d0fa23ffb, 2026-10-20).
//
// Round 23 was approved: pinned rooms as tabs after Done, the first room pinned
// for you, an unpinned room sitting at the end of the tabs while you are in it,
// "N agents working" under each card, @names that land on the right person, and
// the notice "You are invisible for N more minutes. Nobody in your rooms can
// see you." These are the rules behind those pictures, measured on plain data.
import { describe, it, expect } from 'vitest';
import { roomTabs, tabWalk, weekRank, agentsWords, mentionsIn, markMentions, invisibleNotice, minutesToMidnight, initialsOf, UNTIL_TURNED_OFF_MS } from '../renderer/src/team/rooms/room-rules.ts';

const room = (id, pinned) => ({ id, name: id, pinned });

describe('room tabs', () => {
  const rooms = [room('Northwind', true), room('Design', true), room('General', false)];
  it('pinned rooms, in order', () => {
    expect(roomTabs(rooms, null).map((t) => t.room.id)).toEqual(['Northwind', 'Design']);
  });
  it('an unpinned room sits at the end while it is open, and only then', () => {
    expect(roomTabs(rooms, 'General').map((t) => [t.room.id, t.visiting])).toEqual([['Northwind', false], ['Design', false], ['General', true]]);
    expect(roomTabs(rooms, 'Design').map((t) => t.room.id)).toEqual(['Northwind', 'Design']);
  });
  it('a room I am not in is never a tab', () => {
    expect(roomTabs(rooms, 'Elsewhere').map((t) => t.room.id)).toEqual(['Northwind', 'Design']);
  });
  it('Tab walks the state tabs and then the rooms, and wraps', () => {
    const tabs = roomTabs(rooms, null);
    const states = ['inbox', 'progress', 'snoozed', 'done'];
    expect(tabWalk(states, tabs, 'done')).toBe('room:Northwind');
    expect(tabWalk(states, tabs, 'room:Design')).toBe('inbox');
    expect(tabWalk(states, tabs, 'inbox', true)).toBe('room:Design');
  });
});

describe('hours, in words', () => {
  it('whole hours from ten up, one decimal below, and never a 0 for some', async () => {
    const { hoursWords } = await import('../renderer/src/team/rooms/room-rules.ts');
    expect([4810, 41.6, 9.94, 0.25, 0.02, 0].map(hoursWords)).toEqual(['4,810', '42', '9.9', '0.3', 'under 0.1', '0']);
  });
});

describe('their activity on their page', () => {
  it('a teammate who shares it, and always my own; never a stranger, never someone who turned it off', async () => {
    const { activityShown } = await import('../renderer/src/team/rooms/room-rules.ts');
    expect(activityShown({ me: false, teammate: true, showActivity: true })).toBe(true);
    expect(activityShown({ me: false, teammate: true, showActivity: false })).toBe(false);
    expect(activityShown({ me: false, teammate: false, showActivity: true })).toBe(false);
    expect(activityShown({ me: true, teammate: false, showActivity: false })).toBe(true);
  });
});

describe('ranks this week', () => {
  const wall = [{ id: 'a', hoursWeek: 30 }, { id: 'b', hoursWeek: 12 }, { id: 'c', hoursWeek: 12 }, { id: 'd', hoursWeek: 0 }];
  it('most hours first, a tie shares a place', () => {
    expect(['a', 'b', 'c', 'd'].map((id) => weekRank(wall, id))).toEqual([1, 2, 2, 4]);
  });
});

describe('words on a card', () => {
  it('agents working', () => {
    expect(agentsWords(4)).toBe('4 agents working');
    expect(agentsWords(1)).toBe('1 agent working');
    expect(agentsWords(0)).toBe('Not running');
    expect(agentsWords(null)).toBe('Not running');
  });
  it('initials when there is no photo', () => {
    expect(initialsOf('Sam R.')).toBe('SA');
    expect(initialsOf('')).toBe('?');
  });
});

describe('@names', () => {
  const people = [{ id: 'm', name: 'Maya C.' }, { id: 't', name: 'Theo B.' }, { id: 'j1', name: 'Jun O.' }, { id: 'j2', name: 'Jun K.' }];
  it('the name on the card, or the first name alone', () => {
    expect(mentionsIn('@Maya C. can you look', people)).toEqual(['m']);
    expect(mentionsIn('thanks @theo!', people)).toEqual(['t']);
  });
  it('a first name two people share names nobody unless the whole name is written', () => {
    expect(mentionsIn('@Jun are you there', people)).toEqual([]);
    expect(mentionsIn('@Jun K. are you there', people)).toEqual(['j2']);
  });
  it('an email or a word that only starts with a name is not a mention', () => {
    expect(mentionsIn('mail maya@x.com', people)).toEqual([]);
    expect(mentionsIn('@Mayan ruins', people)).toEqual([]);
  });
  it('drawn as marks inside the text', () => {
    expect(markMentions('hi @Maya C. and @Theo B.', ['Maya C.', 'Theo B.'])).toEqual([
      { text: 'hi ', mention: false }, { text: '@Maya C.', mention: true }, { text: ' and ', mention: false }, { text: '@Theo B.', mention: true },
    ]);
  });
});

describe('invisible', () => {
  const now = Date.parse('2026-10-22T15:00:00-07:00');
  it('says how long, in plain words', () => {
    expect(invisibleNotice(new Date(now + 52 * 60_000).toISOString(), now)).toBe('You are invisible for 52 more minutes. Nobody in your rooms can see you.');
    expect(invisibleNotice(new Date(now + 30_000).toISOString(), now)).toBe('You are invisible for 1 more minute. Nobody in your rooms can see you.');
    expect(invisibleNotice(new Date(now + 150 * 60_000).toISOString(), now)).toBe('You are invisible for 3 more hours. Nobody in your rooms can see you.');
    expect(invisibleNotice(new Date(now + 59.8 * 60_000).toISOString(), now)).toBe('You are invisible for 1 more hour. Nobody in your rooms can see you.');
    expect(invisibleNotice(new Date(now + 59 * 60_000).toISOString(), now)).toBe('You are invisible for 59 more minutes. Nobody in your rooms can see you.');
    expect(invisibleNotice(new Date(now + UNTIL_TURNED_OFF_MS).toISOString(), now)).toBe('You are invisible until you turn it off. Nobody in your rooms can see you.');
  });
  it('says nothing when it has run out or was never on', () => {
    expect(invisibleNotice(new Date(now - 1).toISOString(), now)).toBeNull();
    expect(invisibleNotice(null, now)).toBeNull();
  });
  it('until tomorrow is until midnight here', () => {
    expect(minutesToMidnight(now)).toBe(9 * 60);
  });
});
