// THE PHONE APP SHOWS A THREAD AND SENDS WHAT THE DESKTOP SENDS (docs/mobile/PLAN.md).
//
// A thread on the app is the desktop's conversation (item-thread.ts) built from
// the copy a Mac sent, with the agent's options drawn as buttons while the
// offer is live (format.ts `offerIsLive`) and taken out of the message so they
// are not said twice. Every press leaves the command the phone site leaves
// (phone-rows.ts `commandFor`): a pick is the reply "Option N: <words>", the
// way App.tsx sends one, and "Close this task" closes instead of starting a run.
// These pin both halves, and the cases that must not offer anything: a spent
// offer and a thread with no options.
import { describe, it, expect } from 'vitest';
import { phoneView, phoneSlug } from '../renderer/src/phone-rows';
import { threadOf } from '../mobile/src/lib/thread';
import { commandForPress } from '../mobile/src/lib/actions';
import { withAttachments } from '../mobile/src/lib/attach';

const NOW = Date.UTC(2026, 9, 20, 12);
const DEV = 'a1b2c3d4e5f6';
const A = phoneSlug(DEV, 'alpha');
const iso = (ms) => new Date(ms).toISOString();

const OFFER = 'The plan is ready.\n\n## Options\n1. Ship it (recommended)\n2. Wait for Codex';
function rows({ item = {}, history, commands = [] } = {}) {
  const thread = {
    id: 'w-1', title: 'Plan the phone app', status: 'done', kind: 'directive', labels: ['founder'], priority: 0,
    createdAt: NOW - 9e6, updatedAt: NOW - 1000, body: 'Plan it.', result: OFFER,
    wrote: { body: { ts: NOW - 9e6, source: 'founder' }, status: { ts: NOW - 1000, source: 'agent' }, result: { ts: NOW - 1000, source: 'agent' } },
    ...item,
  };
  return {
    projects: [{ device: DEV, project: 'alpha', name: 'Alpha', updated_at: iso(NOW) }],
    threads: [{ device: DEV, project: 'alpha', item: 'w-1', updated_at: iso(NOW - 1000), snapshot: { v: 3, item: thread, history: history ?? [
      { id: 'w-1', ts: NOW - 9e6, source: 'founder', patch: { body: 'Plan it.' } },
      { id: 'w-1', ts: NOW - 1000, source: 'agent', patch: { status: 'done', result: OFFER } },
    ] } }],
    commands,
  };
}
const open = (r) => threadOf(r, phoneView(r, NOW), A, 'w-1');

describe('a thread', () => {
  it('is your words and the agent\'s, with its last word as the outcome', () => {
    const t = open(rows());
    expect(t.title).toBe('Plan the phone app');
    expect(t.events.filter((e) => e.kind !== 'work').map((e) => [e.who, e.text])).toEqual([['you', 'Plan it.']]);
    expect(t.outcome?.text.trim()).toBe('The plan is ready.');
  });

  it('draws a live offer as buttons, and not a second time in the text', () => {
    const t = open(rows());
    expect(t.options.map((o) => [o.n, o.text, o.recommended])).toEqual([[1, 'Ship it (recommended)', true], [2, 'Wait for Codex', false]]);
    expect(t.outcome?.text).not.toMatch(/Options|Wait for Codex/);
    // Headed by the question it answers, as the desktop's options card is.
    expect(t.ask).toBe('The plan is ready.');
  });

  it('offers nothing once you have answered it, and keeps the list in the text as the record', () => {
    const t = open(rows({ item: { answer: 'Option 1: Ship it (recommended)', wrote: { body: { ts: NOW - 9e6, source: 'founder' }, result: { ts: NOW - 1000, source: 'agent' }, answer: { ts: NOW - 500, source: 'founder' } } } }));
    expect(t.options).toEqual([]);
  });

  it('offers nothing on a thread without options', () => {
    const t = open(rows({ item: { result: 'Done, nothing needs you.' }, history: [{ id: 'w-1', ts: NOW - 1000, source: 'agent', patch: { result: 'Done, nothing needs you.' } }] }));
    expect(t.options).toEqual([]);
    expect(t.outcome?.text).toBe('Done, nothing needs you.');
  });

  it('shows a reply sent from the phone at once, before the Mac has it', () => {
    const t = open(rows({ commands: [{ id: 'c1', device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'Ship it' }, created_at: iso(NOW - 200), taken_at: null, outcome: null }] }));
    const mine = t.events.filter((e) => e.kind !== 'work' && e.who === 'you').map((e) => [e.text, !!e.pending]);
    expect(mine).toContainEqual(['Ship it', true]);
  });
});

describe('what a press leaves for your Mac', () => {
  const item = { product: A, id: 'w-1', status: 'done' };
  it('a pick is the reply the desktop sends, and reopens a finished thread', () => {
    expect(commandForPress({ kind: 'pick', option: { n: 2, text: 'Wait for Codex', recommended: false } }, item)).toEqual(
      { device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'Option 2: Wait for Codex' } },
    );
  });
  it('picking "Close this task" closes it rather than starting a run', () => {
    expect(commandForPress({ kind: 'pick', option: { n: 3, text: 'Close this task', recommended: false } }, item)).toMatchObject({ kind: 'close', payload: {} });
  });
  it('a typed reply goes as typed', () => {
    expect(commandForPress({ kind: 'reply', text: 'Ship it, then tell me' }, item)).toMatchObject({ kind: 'reply', payload: { text: 'Ship it, then tell me' } });
  });
  it('an empty reply sends nothing', () => {
    expect(commandForPress({ kind: 'reply', text: '   ' }, item)).toBeNull();
  });
  it('a reply carries the priority, mode and model picked in its sentence, and only those', () => {
    expect(commandForPress({ kind: 'reply', text: 'Go', choices: { priority: 9, permissionMode: 'plan', model: 'sonnet', effort: 'high', engine: 'codex' } }, item)).toEqual(
      { device: DEV, project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'Go', priority: 9, permissionMode: 'plan', model: 'sonnet', effort: 'high' } },
    );
  });
  it('a new thread goes to its project with what was picked for it', () => {
    expect(commandForPress({ kind: 'new', product: A, body: 'Draw the board', choices: { model: 'opus', priority: 5 } }, null)).toEqual(
      { device: DEV, project: 'alpha', item: null, kind: 'new', payload: { title: '', body: 'Draw the board', model: 'opus', priority: 5 } },
    );
    expect(commandForPress({ kind: 'new', product: A, body: '  ', choices: {} }, null)).toBeNull();
  });
  it('Send later sends a new thread to Later, or for a moment, as the desktop\'s Send later does', () => {
    expect(commandForPress({ kind: 'new', product: A, body: 'Draw it', choices: { start: 'later' } }, null)).toMatchObject({ kind: 'new', payload: { body: 'Draw it', start: 'later' } });
    expect(commandForPress({ kind: 'new', product: A, body: 'Draw it', choices: { runAt: NOW + 86_400_000 } }, null)).toMatchObject({ kind: 'new', payload: { body: 'Draw it', runAt: NOW + 86_400_000 } });
  });
  it('Later and Close are the site\'s snooze and close', () => {
    expect(commandForPress({ kind: 'later', until: NOW + 3_600_000 }, item)).toMatchObject({ kind: 'snooze', payload: { until: NOW + 3_600_000 } });
    expect(commandForPress({ kind: 'close' }, item)).toMatchObject({ kind: 'close' });
  });
});

describe('a message with files', () => {
  const saved = [{ rel: 'phone-files/ab.png', name: 'board.png', image: true }, { rel: 'phone-files/cd.pdf', name: 'brief.pdf', image: false }];
  it('carries each file as the desktop\'s reply box links one, under the words', () => {
    expect(withAttachments('Look at these', saved)).toBe('Look at these\n\n![board.png](phone-files/ab.png)\n[brief.pdf](phone-files/cd.pdf)');
  });
  it('is the links alone with no words, and the words alone with no files', () => {
    expect(withAttachments('  ', saved)).toBe('![board.png](phone-files/ab.png)\n[brief.pdf](phone-files/cd.pdf)');
    expect(withAttachments('Just words', [])).toBe('Just words');
  });
});
