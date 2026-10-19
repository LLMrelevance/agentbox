// From the 9 minutes of talk on 2026-10-17.
//
// Looking for a thread, Neo ran the ⌘K command `search`, and the bridge
// answered "Done: Search threads." Nothing had been searched: the command
// only opens the search box. Neo passed the claim on, and the hunt ended on
// the wrong thread — "you ended up on the wrong task, and you ended up um
// actually uh, snoozing something wrong".
//
// Snoozing is not here any more: `later` puts a thread off with the time she
// said, and run_command refuses the Later row outright. What is left is the
// commands that still only put a card on screen.
import { describe, expect, it, vi } from 'vitest';
import { neoBridge } from '../renderer/src/neo/bridge.ts';

const jarvis = { id: 'w-e85', product: 'p1', productName: 'Agentbox Team', title: 'JARVIS for Agentbox', status: 'open' };
const other = { id: 'w-b3a', product: 'p1', productName: 'Agentbox Team', title: 'Account status display', status: 'open' };

function setup({ focused = jarvis } = {}) {
  const ran = [];
  const commands = [
    { id: 'search', label: 'Search threads', run: () => ran.push('search') },
    { id: 'filter', label: 'Filter…', run: () => ran.push('filter') },
    { id: 'new-project', label: 'New Project…', run: () => ran.push('new-project') },
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
    const r = await act('run_command', { id: 'search' });
    expect(ran).toEqual(['search']);
    expect(r.said).not.toMatch(/^Done/);
    expect(r.said).toMatch(/on screen/i);
    expect(r.said).toMatch(/Search threads/);
  });

  it('says the same for the filter menu and a new project', async () => {
    const { act } = setup();
    for (const id of ['filter', 'new-project']) {
      expect((await act('run_command', { id })).said).not.toMatch(/^Done/);
    }
  });

  it('still says done for a command that really did it', async () => {
    const { act, ran } = setup();
    expect((await act('run_command', { id: 'view-done' })).said).toBe('Done: Closed.');
    expect((await act('run_command', { id: 'settings' })).said).toBe('Done: Settings….');
    expect(ran).toEqual(['view-done', 'settings']);
  });

  it('does not ask for a yes to open a card, which changes nothing yet', async () => {
    const { act, ran } = setup();
    expect(await act('run_command', { id: 'search' })).toMatchObject({ ok: true });
    expect(ran).toEqual(['search']);
  });
});

describe('a command that takes a thread out of the inbox', () => {
  it('asks first before putting one back in', async () => {
    const { act, ran } = setup();
    expect(await act('run_command', { id: 'unsnooze' })).toMatchObject({ ok: false, status: 'needs_yes' });
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
    expect(await act('run_command', { id: 'unsnooze', confirmed: true })).toMatchObject({ ok: true });
    expect(ran).toEqual(['unsnooze']);
  });
});
