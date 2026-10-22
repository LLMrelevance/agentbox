// A ROOM OPENS ON ITS BOARD (w-49cd37092c, 2026-10-22).
//
// The room's board shipped behind the View button, with the grid of people as
// the room's first view. After restarting onto it: "I still don't see it... I
// should at the very least be able to see my own tasks, right?" Measured on
// the running app: it was built from the shipped code, and its saved settings
// held no rooms.view, so the room opened on the grid, which draws no threads.
// The board's row of tiles carries what the grid did (a face, a name, agents
// working), so a room now opens on the board until you pick Grid.
import { describe, it, expect } from 'vitest';
import { readRoomView, writeRoomView } from '../renderer/src/team/rooms/room-rules.ts';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };

describe('the view a room opens on', () => {
  it('is the board when nothing was ever picked', () => {
    expect(readRoomView(memory())).toBe('board');
  });
  it('is the grid once you picked Grid, and stays it', () => {
    const store = memory();
    writeRoomView('grid', store);
    expect(readRoomView(store)).toBe('grid');
    expect(readRoomView(store)).toBe('grid');
  });
  it('is the board again once you pick Board', () => {
    const store = memory();
    writeRoomView('grid', store);
    writeRoomView('board', store);
    expect(readRoomView(store)).toBe('board');
  });
  it('is the board for anything else it finds', () => {
    const store = memory();
    store.setItem('rooms.view', 'cards');
    expect(readRoomView(store)).toBe('board');
  });
  it('is the board when there is no storage, or it throws', () => {
    expect(readRoomView(null)).toBe('board');
    expect(readRoomView({ getItem: () => { throw new Error('denied'); }, setItem: () => {} })).toBe('board');
  });
});
