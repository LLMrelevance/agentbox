// From the 7 minutes of talk on 2026-10-17 01:26.
//
// "Can you play the video for me" picked play:1 and played
// forest-animatic-final.mp4 from far up the thread. Her words:
//
//   "I asked for things, it was almost always related to the last message the
//    agent sent. Like, I know it's a thread, but the thing is is that like,
//    it's a conversation. And so, when the agent sends a message, I'm almost
//    always responding to its most recent message. So, it's a little bit
//    strange when it goes like way in the past to answer something"
//
// Pictures and files already counted the agent's latest message first. Films
// were still in document order, so film 1 was the OLDEST in the thread.
import { describe, expect, it } from 'vitest';
import { orderMedia } from '../renderer/src/neo/show.ts';

// One entry per film the thread draws, in the order it draws them. `block` is
// the message it sits in; `mine` marks one she posted herself.
const film = (block, mine = false) => ({ block, mine });
const order = (found, latest) => orderMedia(found, latest);

describe('which film is film 1', () => {
  it('is the one in the agent\'s latest message, not the oldest in the thread', () => {
    // v1 in the first message, final in the latest: final is 1.
    expect(order([film(1), film(2)])[0]).toBe(1);
  });

  it('keeps the older ones after it, newest first', () => {
    expect(order([film(1), film(2), film(3)])).toEqual([2, 1, 0]);
  });

  it('counts every film in the latest message, in the order it draws them', () => {
    // old.mp4 in message 1; a.mp4 and b.mp4 both in message 2.
    expect(order([film(1), film(2), film(2)])).toEqual([1, 2, 0]);
  });

  it('does not treat a film she posted herself as the latest message', () => {
    expect(order([film(1), film(2, true)])[0]).toBe(0);
  });

  it('leaves one film, or none, exactly as it is', () => {
    expect(order([film(1)])).toEqual([0]);
    expect(order([])).toEqual([]);
  });

  it('takes the app\'s own reading of the latest message when it has one', () => {
    // Three messages, and the app says the agent's latest is block 2.
    expect(order([film(1), film(2), film(3)], 2)).toEqual([1, 2, 0]);
  });
});
