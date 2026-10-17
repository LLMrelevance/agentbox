// From her 9 minutes with Neo on 2026-10-17.
//
// She asked: "can you can you snooze this for for 10 minutes then". Neo ran
// the ⌘K command `snooze`, which only OPENS the Later card, and the bridge
// answered "Done: Later." Neo then told her "Done, 10 minutes." Her words
// back: "on my screen, I still see the PNG shot, and I also see that it
// hasn't been successfully snoozed."
//
// Later in the same session Neo searched "snoozed threads later", got the
// same command back and ran it while another thread was open. Her words:
// "you ended up on the wrong task, and you ended up um actually uh, snoozing
// something wrong".
//
// So: a command that only opens a card is never reported as done, and a
// command that acts on a thread names the thread it acted on.
import { describe, expect, it, vi } from 'vitest';
import { neoBridge } from '../renderer/src/neo/bridge.ts';

const jarvis = { id: 'w-e85', product: 'p1', productName: 'Agentbox Team', title: 'JARVIS for Agentbox', status: 'open' };
const other = { id: 'w-b3a', product: 'p1', productName: 'Agentbox Team', title: 'Account status display', status: 'open' };

function setup({ focused = jarvis } = {}) {
  const ran = [];
  const commands = [
    { id: 'snooze', label: 'Later', keywords: 'later snooze defer', run: () => ran.push('snooze') },
    { id: 'reply', label: 'Reply', run: () => ran.push('reply') },
    { id: 'search', label: 'Search threads', run: () => ran.push('search') },
    { id: 'filter', label: 'Filter…', run: () => ran.push('filter') },
    { id: 'unsnooze', label: 'Back to Inbox', run: () => ran.push('unsnooze') },
    { id: 'send-back', label: 'Send Back to Agent', run: () => ran.push('send-back') },
    { id: 'view-done', label: 'Closed', run: () => ran.push('view-done') },
    { id: 'settings', label: 'Settings…', run: () => ran.push('settings') },
  ];
  const deps = {
    rows: () => [jarvis, other],
    focused: () => focused,
    outside: () => false,
    options: () => [],
    summary: () => '',
    projects: () => [{ slug: 'p1', name: 'Agentbox Team' }],
    open: vi.fn(), pick: vi.fn(), reply: vi.fn(), close: vi.fn(async () => 'done'),
    compose: vi.fn(), undo: vi.fn(), glow: vi.fn(),
    commands: () => commands,
  };
  return { act: neoBridge(deps), ran, deps };
}

describe('a command that only opens a card', () => {
  it('is never reported as done, and says the person has to finish it', async () => {
    const { act, ran } = setup();
    const r = await act('run_command', { id: 'snooze' });
    expect(ran).toEqual(['snooze']);
    expect(r.said).not.toMatch(/^Done/);
    expect(r.said).toMatch(/on screen/i);
    expect(r.said).toMatch(/Later/);
  });

  it('names the thread the card is for, so a wrong one is heard at once', async () => {
    const { act } = setup({ focused: other });
    expect((await act('run_command', { id: 'snooze' })).said).toMatch(/Account status display/);
  });

  it('says the same for the search box, the reply box and the filter menu', async () => {
    const { act } = setup();
    for (const id of ['search', 'reply', 'filter']) {
      expect((await act('run_command', { id })).said).not.toMatch(/^Done/);
    }
  });

  it('still says done for a command that really did it', async () => {
    const { act, ran } = setup();
    expect((await act('run_command', { id: 'view-done' })).said).toBe('Done: Closed.');
    expect((await act('run_command', { id: 'settings' })).said).toBe('Done: Settings….');
    expect(ran).toEqual(['view-done', 'settings']);
  });
});

describe('a command that moves the thread it is on', () => {
  it('asks for a yes before taking a thread out of the inbox', async () => {
    const { act, ran } = setup();
    const r = await act('run_command', { id: 'unsnooze' });
    expect(r).toMatchObject({ ok: false, status: 'needs_yes' });
    expect(ran).toEqual([]);
  });

  it('asks before sending a thread back to its agent', async () => {
    const { act, ran } = setup();
    expect(await act('run_command', { id: 'send-back' })).toMatchObject({ status: 'needs_yes' });
    expect(ran).toEqual([]);
  });

  it('goes ahead once she has said yes to that very command', async () => {
    const { act, ran } = setup();
    await act('run_command', { id: 'unsnooze' });
    const r = await act('run_command', { id: 'unsnooze', confirmed: true });
    expect(r).toMatchObject({ ok: true });
    expect(r.said).toMatch(/JARVIS for Agentbox/);
    expect(ran).toEqual(['unsnooze']);
  });

  it('does not ask for a yes to open a card, which changes nothing yet', async () => {
    const { act, ran } = setup();
    expect(await act('run_command', { id: 'snooze' })).toMatchObject({ ok: true });
    expect(ran).toEqual(['snooze']);
  });
});
