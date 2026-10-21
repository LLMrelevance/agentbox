// A VOICE NOTE PLAYS FASTER, AND WAITS FOR A FILE THAT IS LATE.
//
// Two things asked for after the first build. The speed switch only showed
// when you pointed at a note, so it was not found ("there should be a way to
// speed it up... a little 1x button"); it is now always beside the time, and
// the speed you pick is the one the next note starts at. And a teammate's note
// whose file had not arrived yet (their sync behind, or the connection gone)
// read as broken for good; it now says it is arriving and asks again, soon and
// then less often. Also: the folded reply box names a waiting voice note as
// one, and a room send tried again after a dropped connection is not sent
// twice when the first try had in fact landed.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VoiceNote, retryAfter } from '../renderer/src/team/VoiceNote.tsx';
import { foldedReply } from '../renderer/src/folded-reply.ts';
import { landed } from '../renderer/src/team/rooms/room-chat-rules.ts';

const css = fs.readFileSync(new URL('../renderer/src/team/voice-note.css', import.meta.url), 'utf8');
const rule = (sel) => css.slice(css.indexOf(`${sel} {`), css.indexOf('}', css.indexOf(`${sel} {`)));

describe('the speed switch', () => {
  const html = renderToStaticMarkup(React.createElement(VoiceNote, { id: 'n', ms: 23_400, load: async () => null }));

  it('is drawn on every note, reading 1× until you pick another', () => {
    expect(html).toContain('class="voice-speed"');
    expect(html).toContain('>1×<');
  });

  it('is never hidden until pointed at', () => {
    expect(rule('.voice-speed')).not.toContain('visibility: hidden');
    expect(css).not.toMatch(/\.voice-note:hover \.voice-speed/);
  });

  it('remembers the speed you picked for the next note', () => {
    const src = fs.readFileSync(new URL('../renderer/src/team/VoiceNote.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/localStorage\.setItem\(SPEED_KEY, String\(next\)\)/);
    expect(src).toMatch(/useState\(speedWas\)/);
  });
});

describe('a note whose file has not arrived', () => {
  it('asks again soon, then less often, and never stops while it is on screen', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 50].map(retryAfter)).toEqual([2000, 4000, 8000, 15000, 30000, 60000, 60000, 60000]);
  });
});

describe('the folded reply box', () => {
  it('names a waiting voice note as a voice note', () => {
    expect(foldedReply('', [{ name: 'voice-note-4200ms.webm', image: false }]).text).toBe('1 voice note');
    expect(foldedReply('', [{ name: 'voice-note-4200ms.webm' }, { name: 'voice-note-900ms.webm' }]).text).toBe('2 voice notes');
  });

  it('still says files when a voice note sits with other files', () => {
    expect(foldedReply('', [{ name: 'voice-note-4200ms.webm' }, { name: 'notes.txt' }]).text).toBe('2 files');
  });
});

describe('a room send tried again', () => {
  const me = 'p-me';
  const msg = (extra) => ({ id: 'm', roomId: 'r', by: me, body: 'on my way', inReplyTo: null, mentions: [], at: 10_000, ...extra });

  it('counts as sent when the room already has it from the first try', () => {
    expect(landed([msg()], { by: me, body: 'on my way', inReplyTo: null, since: 9_000 })).toBe(true);
  });

  it('is sent when the room does not have it', () => {
    expect(landed([msg({ body: 'something else' })], { by: me, body: 'on my way', inReplyTo: null, since: 9_000 })).toBe(false);
    expect(landed([msg({ by: 'p-maya' })], { by: me, body: 'on my way', inReplyTo: null, since: 9_000 })).toBe(false);
    expect(landed([msg({ inReplyTo: 'x' })], { by: me, body: 'on my way', inReplyTo: null, since: 9_000 })).toBe(false);
  });

  it('does not mistake the same words said long before for this try', () => {
    expect(landed([msg({ at: 1_000 })], { by: me, body: 'on my way', inReplyTo: null, since: 3_600_000 })).toBe(false);
  });
});
