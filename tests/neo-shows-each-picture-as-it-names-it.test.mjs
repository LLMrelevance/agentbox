// "as it explains a task, it shows me in real time the relevant artifacts
// ... it showed me the last image while it was describing the first image"
// (2026-10-17). Neo put every picture up at once when it opened a thread and
// had no way to change them as it talked. Now the app follows what Neo says
// out loud: picture 1 goes up first, and each one comes up as Neo names it.
// Images and design pages first, as she asked; other kinds later.
import { describe, expect, it, vi } from 'vitest';
import { followTarget } from '../shared/neo-follow.mjs';
import { neoBridge } from '../renderer/src/neo/bridge.ts';

const three = { pictures: ['dust.png', 'instrument.png', 'hologram.png'], files: [], options: 3 };

describe('what Neo is talking about', () => {
  it.each([
    ['Picture two shows the tiles.', { kind: 'picture', n: 2 }],
    ['The second design keeps the orb small.', { kind: 'picture', n: 2 }],
    ['Option three makes it full screen.', { kind: 'picture', n: 3 }],
    ['1, keep the floating window. 2, switch to centered.', { kind: 'picture', n: 2 }],
    ['Design 1 is calm, but design 3 is bolder.', { kind: 'picture', n: 3 }],
    ['The last one is Hologram.', { kind: 'picture', n: 3 }],
    // Said live by the voice on 2026-10-17.
    ['1 is dense. 2 is calm, and that\'s their pick.', { kind: 'picture', n: 2 }],
    ['Number three glows.', { kind: 'picture', n: 3 }],
    ['Then there is Instrument, which is denser.', { kind: 'picture', n: 2 }],
  ])('%j', (said, want) => {
    expect(followTarget(said, three)).toEqual(want);
  });

  it('"1 is up now", repeating the app, names nothing new', () => {
    const four = { pictures: ['instrument.png', 'dust.png', 'hologram.png', 'glass.png'], files: [], options: 4 };
    expect(followTarget('3 glows. 4 is light. 1 is up now.', four)).toEqual({ kind: 'picture', n: 4 });
  });

  it('nothing named, nothing shown', () => {
    expect(followTarget('The agent finished the pages and wants your OK.', three)).toBeNull();
  });

  it('a number in passing is not a pick', () => {
    expect(followTarget('It took 2 hours.', three)).toBeNull();
    // Said live: "Four looks." put up picture four.
    expect(followTarget('Redesign one is open. Four looks.', { ...three, pictures: [...three.pictures, 'glass.png'], options: 4 })).toBeNull();
  });

  it('a number past the pictures is ignored', () => {
    expect(followTarget('Picture five is missing.', three)).toBeNull();
  });

  it('options only stand for pictures when there is one picture per option', () => {
    expect(followTarget('Option two ships it.', { pictures: ['a.png'], files: [], options: 2 })).toBeNull();
    expect(followTarget('Option two ships it.', { pictures: ['a.png', 'b.png'], files: [], options: 2 })).toEqual({ kind: 'picture', n: 2 });
  });

  it('with no pictures, designs are the design pages', () => {
    const pages = { pictures: [], files: ['calm.html', 'bold.html'], options: 2 };
    expect(followTarget('The second design is bolder.', pages)).toEqual({ kind: 'file', n: 2 });
    expect(followTarget('Option one is calm.', pages)).toEqual({ kind: 'file', n: 1 });
  });

  it('names that are not telling are not matched', () => {
    expect(followTarget('The final screenshot is ready.', { pictures: ['final-screenshot.png', 'final-v2.png'], files: [], options: 0 })).toBeNull();
  });
});

describe('Neo is told how to walk through them, once, where it is not read out', () => {
  it('the session instructions say to name each in turn', async () => {
    const { neoSession } = await import('../shared/neo-tools.mjs');
    expect(neoSession({}).instructions).toMatch(/one at a time, naming each/);
  });
});

describe('the app follows along', () => {
  function setup({ latest = 3, names = ['dust.png', 'instrument.png', 'hologram.png'], files = [] } = {}) {
    const rows = [{ id: 'w-a', product: 'p', title: 'UI redesign' }];
    const deps = {
      rows: () => rows, focused: () => rows[0], outside: () => false,
      options: () => [{ n: 1, text: 'Build Dust' }, { n: 2, text: 'Build Instrument' }, { n: 3, text: 'Build Hologram' }],
      summary: () => 'Which look?', projects: () => [],
      open: vi.fn(), pick: vi.fn(), reply: vi.fn(), close: vi.fn(), compose: vi.fn(), undo: vi.fn(), glow: vi.fn(),
      pictureNames: () => names, latestPictureCount: () => latest, waitForPictures: async () => {},
      show: vi.fn(async () => true), fileNames: () => files, openFile: vi.fn(async () => true),
      now: () => t.clock,
    };
    const t = { act: neoBridge(deps), deps, clock: 1_000_000 };
    return t;
  }

  it('opening a thread puts up picture 1 and tells Neo the rest follow its words', async () => {
    const t = setup();
    const r = await t.act('open_thread', { id: 'w-a' });
    expect(t.deps.show).toHaveBeenCalledWith([1], 'peek');
    expect(r.said).toMatch(/1\. dust\.png.*2\. instrument\.png/s);
    // Guidance in the brief was read out loud live; it lives in the session instructions.
    expect(r.said).not.toMatch(/name/);
  });

  it('shows each picture as Neo names it, once', async () => {
    const t = setup();
    await t.act('follow', { said: 'Option one is Dust.' });
    t.clock += 2000;
    await t.act('follow', { said: 'Option one is Dust. Option two is' });
    await t.act('follow', { said: 'Option one is Dust. Option two is Instrument.' });
    expect(t.deps.show.mock.calls).toEqual([[[1], 'peek'], [[2], 'peek']]);
  });

  // Said live: "You can pick Instrument, Dust, Hologram, or Glass" flicked
  // through all four in about a second.
  it('a quick list of names lands on the last one instead of flickering', async () => {
    vi.useFakeTimers();
    try {
      const t = setup();
      await t.act('follow', { said: 'Pick Dust,' });
      await t.act('follow', { said: 'Pick Dust, Instrument,' });
      await t.act('follow', { said: 'Pick Dust, Instrument, or Hologram.' });
      expect(t.deps.show.mock.calls).toEqual([[[1], 'peek']]);
      t.clock += 800;
      await vi.advanceTimersByTimeAsync(800);
      expect(t.deps.show.mock.calls).toEqual([[[1], 'peek'], [[3], 'peek']]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens design pages the same way', async () => {
    const t = setup({ latest: 0, names: [], files: ['calm.html', 'bold.html', 'loud.html'] });
    await t.act('follow', { said: 'The second design is bolder.' });
    expect(t.deps.openFile).toHaveBeenCalledWith(2);
  });

  it('starts over on a new thread', async () => {
    const t = setup();
    await t.act('follow', { said: 'Option two.' });
    await t.act('next_thread', {});
    t.deps.show.mockClear();
    await t.act('follow', { said: 'Option two.' });
    expect(t.deps.show).toHaveBeenCalledWith([2], 'peek');
  });

  it('says nothing back, so following never talks over Neo', async () => {
    const t = setup();
    expect(await t.act('follow', { said: 'Option two.' })).toMatchObject({ ok: true, said: '' });
  });
});
