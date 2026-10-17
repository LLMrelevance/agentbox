// From her 9 minutes with Neo on 2026-10-17.
//
// On the pictures Neo put up by itself when it opened a thread: "you keep
// showing me screenshots on the screen. And my suspicion is it's because
// you're taking screenshots to understand like where you're at. But then it
// ends up blocking my screen entirely... definitely shouldn't block my screen
// like this." The same layer is what she saw in the first minute — "on my
// screen, I still see the PNG shot" — and what hid the options she was being
// read: "as you're like explaining to me what the options are, if I could see
// them on screen."
//
// So a thread Neo opens scrolls to its picture in the thread and lights it up.
// Nothing of Neo's goes over the app unless she asks for it.
//
// And on sending: "if I've got a screenshot in the chat and I'm asking to give
// feedback, it's probably implies that I want you to send that screenshot."
// Neo sent five replies in that session and attached a picture to two. A reply
// now takes what is in her reply box unless she says not to.
import { describe, expect, it, vi } from 'vitest';
import { neoBridge } from '../renderer/src/neo/bridge.ts';

const rows = [
  { id: 'w-a', product: 'p1', productName: 'Agentbox', title: 'Account status display', status: 'open' },
  { id: 'w-b', product: 'p1', productName: 'Agentbox', title: 'Session limit routing', status: 'open' },
];

function setup({ pictures = ['one.png', 'two.png'], latest = 2, replies = undefined } = {}) {
  const calls = [];
  const deps = {
    rows: () => rows,
    focused: () => rows[0],
    outside: () => false,
    options: () => [{ n: 1, text: 'Rows' }, { n: 2, text: 'Tiles' }],
    summary: () => 'Which look should ship, rows or tiles?',
    projects: () => [{ slug: 'p1', name: 'Agentbox' }],
    open: vi.fn(), pick: vi.fn(), close: vi.fn(), compose: vi.fn(), undo: vi.fn(), glow: vi.fn(),
    reply: vi.fn(async (row, text, o) => { calls.push(['reply', row.id, text, o]); return replies; }),
    pictureNames: () => pictures,
    latestPictureCount: () => latest,
    waitForPictures: async () => {},
    show: vi.fn(async (ns, layout) => { calls.push(['show', ns, layout]); return true; }),
  };
  return { act: neoBridge(deps), calls, deps };
}

describe('opening a thread does not put anything over the app', () => {
  it('shows the picture where it already is, not lifted over the screen', async () => {
    const { act, calls } = setup({ pictures: ['shot.png'], latest: 1 });
    const r = await act('open_thread', { id: 'w-a' });
    expect(calls.filter(([n]) => n === 'show').map(([, , layout]) => layout)).toEqual(['in_place']);
    expect(r.said).toMatch(/in the thread/i);
  });

  it('never lifts or spreads several pictures either', async () => {
    const { act, calls } = setup({ pictures: ['a.png', 'b.png', 'c.png'], latest: 3 });
    await act('next_thread', {});
    for (const [, , layout] of calls.filter(([n]) => n === 'show')) {
      expect(['lifted', 'side_by_side', 'full_screen']).not.toContain(layout);
    }
  });

  it('shows nothing at all when the thread has no pictures', async () => {
    const { act, calls } = setup({ pictures: [], latest: 0 });
    await act('open_thread', { id: 'w-a' });
    expect(calls.filter(([n]) => n === 'show')).toEqual([]);
  });

  it('still lifts a picture over the app when she asks for one', async () => {
    const { act, calls } = setup();
    await act('show', { pictures: [1], layout: 'lifted' });
    expect(calls).toContainEqual(['show', [1], 'lifted']);
  });
});

describe('a reply takes what is in her reply box', () => {
  it('sends the picture without being told to', async () => {
    const { act, calls } = setup({ replies: 'with-pictures' });
    const r = await act('reply', { id: 'w-a', text: 'Another issue is quite often' });
    expect(calls).toContainEqual(['reply', 'w-a', 'Another issue is quite often', { attach: true }]);
    expect(r.said).toMatch(/pictures/);
  });

  it('says plainly "Sent" when there was no picture to take', async () => {
    const { act } = setup({ replies: 'no-pictures' });
    expect((await act('reply', { id: 'w-a', text: 'thanks' })).said).toBe('Sent.');
  });

  it('says the picture was missing when she had asked for it by name', async () => {
    const { act } = setup({ replies: 'no-pictures' });
    const r = await act('reply', { id: 'w-a', text: 'thanks', attach: true });
    expect(r.said).toMatch(/no picture/i);
  });

  it('leaves the box alone when she says not to send it', async () => {
    const { act, calls } = setup();
    await act('reply', { id: 'w-a', text: 'just the words', attach: false });
    expect(calls).toContainEqual(['reply', 'w-a', 'just the words', { attach: false }]);
  });
});
