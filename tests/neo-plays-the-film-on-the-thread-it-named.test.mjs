// "SHOW ME THE VIDEO" (w-5520063011).
//
// Her words on the first Neo alpha: "it couldn't play the video". A thread's
// film is drawn in the conversation with its own player, and Neo had no action
// that touched it, so the one thing asked for out loud was the one thing it
// could not do. The brain dump had it as a V1: "Maybe as a V1 it could handle
// my requests. 'Show me the video.'"
//
// Neo now plays and pauses the players already on the thread. It names the
// thread like every other action, it scrolls what it plays into view, and it
// says what it played, so you hear which one started.
import { describe, expect, it, vi } from 'vitest';
import { neoBridge, describeScreen } from '../renderer/src/neo/bridge.ts';

const rows = [
  { id: 'w-a', product: 'p1', productName: 'Agentbox', title: 'Launch film' },
  { id: 'w-b', product: 'p1', productName: 'Agentbox', title: 'No media here' },
];

function film(name) {
  return { name, playing: false, play: vi.fn(function () { this.playing = true; }), pause: vi.fn(function () { this.playing = false; }), show: vi.fn() };
}

function setup({ films = [], focused = rows[0] } = {}) {
  const deps = {
    rows: () => rows,
    focused: () => focused,
    outside: () => false,
    options: () => [],
    summary: () => '',
    projects: () => [{ slug: 'p1', name: 'Agentbox' }],
    open: vi.fn(), pick: vi.fn(), reply: vi.fn(), close: vi.fn(), compose: vi.fn(), undo: vi.fn(),
    films: vi.fn(() => films),
    glow: vi.fn(),
  };
  return { act: neoBridge(deps), deps };
}

describe('playing a film', () => {
  it('plays the one film on the thread and says its name', async () => {
    const one = film('launch-cut.mp4');
    const { act } = setup({ films: [one] });
    const r = await act('play_media', { id: 'w-a' });
    expect(r).toMatchObject({ ok: true, status: 'committed' });
    expect(r.said).toMatch(/launch-cut\.mp4/);
    expect(one.play).toHaveBeenCalled();
  });

  it('brings what it plays into view', async () => {
    const one = film('launch-cut.mp4');
    const { act } = setup({ films: [one] });
    await act('play_media', { id: 'w-a' });
    expect(one.show).toHaveBeenCalled();
  });

  it('plays the one you numbered when the thread has several', async () => {
    const films = [film('a.mp4'), film('b.mp4'), film('c.mp4')];
    const { act } = setup({ films });
    const r = await act('play_media', { id: 'w-a', n: 2 });
    expect(r.said).toMatch(/b\.mp4/);
    expect(films[1].play).toHaveBeenCalled();
    expect(films[0].play).not.toHaveBeenCalled();
  });

  it('plays the first when you numbered none', async () => {
    const films = [film('a.mp4'), film('b.mp4')];
    const { act } = setup({ films });
    await act('play_media', { id: 'w-a' });
    expect(films[0].play).toHaveBeenCalled();
    expect(films[1].play).not.toHaveBeenCalled();
  });

  it('pauses only what is playing', async () => {
    const films = [film('a.mp4'), film('b.mp4')];
    films[1].playing = true;
    const { act } = setup({ films });
    expect(await act('pause_media', { id: 'w-a' })).toMatchObject({ ok: true });
    expect(films[1].pause).toHaveBeenCalled();
    expect(films[0].pause).not.toHaveBeenCalled();
  });
});

describe('when there is nothing to play', () => {
  it('says so rather than claiming it played something', async () => {
    const { act } = setup({ films: [] });
    const r = await act('play_media', { id: 'w-a' });
    expect(r).toMatchObject({ ok: false, status: 'refused' });
    expect(r.said).toMatch(/no film|nothing to play|no video/i);
  });

  it('says so when you number past the end', async () => {
    const { act } = setup({ films: [film('a.mp4')] });
    expect(await act('play_media', { id: 'w-a', n: 4 })).toMatchObject({ ok: false, status: 'refused' });
  });

  it('says so when nothing is playing and you ask to pause', async () => {
    const { act } = setup({ films: [film('a.mp4')] });
    expect(await act('pause_media', { id: 'w-a' })).toMatchObject({ ok: false, status: 'refused' });
  });

  it('refuses a thread that has left the inbox, and touches no player', async () => {
    const one = film('a.mp4');
    const { act, deps } = setup({ films: [one] });
    expect(await act('play_media', { id: 'w-gone' })).toMatchObject({ ok: false, status: 'refused' });
    expect(one.play).not.toHaveBeenCalled();
    expect(deps.films).not.toHaveBeenCalled();
  });

  // Films are read from the open thread, so a play aimed at a thread that is
  // not the open one would play whatever is on screen instead.
  it('refuses a thread that is in the inbox but not the one open', async () => {
    const one = film('a.mp4');
    const { act } = setup({ films: [one], focused: rows[0] });
    expect(await act('play_media', { id: 'w-b' })).toMatchObject({ ok: false, status: 'refused' });
    expect(one.play).not.toHaveBeenCalled();
  });
});

describe('knowing there is a film to ask for', () => {
  it('tells Neo what the open thread has, numbered', () => {
    const { deps } = setup({ films: [film('launch-cut.mp4'), film('voice.mp3')] });
    const s = describeScreen(deps);
    expect(s).toMatch(/1\. launch-cut\.mp4/);
    expect(s).toMatch(/2\. voice\.mp3/);
  });

  it('says nothing about films when the thread has none', () => {
    const { deps } = setup({ films: [] });
    expect(describeScreen(deps)).not.toMatch(/to play/i);
  });
});
