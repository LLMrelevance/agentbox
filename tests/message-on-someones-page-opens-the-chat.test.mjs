// MESSAGE ON SOMEONE'S PAGE OPENS THE CHAT (w-88e1e23325, 2026-10-21).
//
// "The message button just doesn't do anything. It's just an empty click." On
// a person's page, Message for someone outside your team made or found your
// chat with them and put it in the panel beside the room, but a person's page
// draws no panel, so nothing changed on screen. Measured on the built app: the
// click made the chat and the page stayed exactly as it was.
//
// Now the chat goes beside the room only where that panel is drawn (the wall,
// its board, the ranks), and anywhere else it opens full page on Messages,
// with Back coming back to the page it was opened from.
import { describe, it, expect } from 'vitest';
import { whereChatOpens } from '../renderer/src/team/rooms/room-rules.ts';

const room = { id: 'r1', kind: 'room' };

describe('where a chat opens', () => {
  it('from a person’s page, full page, and Back comes back to that page', () => {
    expect(whereChatOpens({ open: room, full: false, pane: 'person:maya' })).toEqual({ beside: false, back: { roomId: 'r1', pane: 'person:maya' } });
  });
  it('from the wall and the ranks, beside the room as before', () => {
    expect(whereChatOpens({ open: room, full: false, pane: 'wall' })).toEqual({ beside: true });
    expect(whereChatOpens({ open: room, full: false, pane: 'ranks' })).toEqual({ beside: true });
  });
  it('from a chat already full page, or a group, full page with nowhere to come back to', () => {
    expect(whereChatOpens({ open: room, full: true, pane: 'wall' })).toEqual({ beside: false, back: null });
    expect(whereChatOpens({ open: { id: 'g1', kind: 'group' }, full: false, pane: 'wall' })).toEqual({ beside: false, back: null });
    expect(whereChatOpens({ open: null, full: false, pane: 'wall' })).toEqual({ beside: false, back: null });
  });
});
