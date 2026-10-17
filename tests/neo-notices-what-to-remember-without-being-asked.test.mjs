// NEO REMEMBERS AS IT GOES, NOT ONLY WHEN ASKED (w-6a1c405642, 2026-10-17).
//
// Their words: "As for 'remember that,' Neo should be remembering things as
// it goes along, so it should have a command to add a memory as needed."
//
// Until this, a line was kept only when somebody said the magic words. A
// preference dropped in passing — "I never want you closing these without
// asking" while asking for the next thread — went with the session. Every
// turn long enough to carry one is now asked, beside the pick rather than
// after it, whether it carried one.
//
// The cases that matter are the ones where it must NOT keep anything: a
// plain request, a guess it is not sure of, words meant for the agent, and
// a turn too short to hold a preference, which must not cost a request at
// all.

import { describe, expect, it, vi } from 'vitest';
import { NOTICE, runDecision } from '../main/neo/decided.mjs';
import { addMemory, cleanMemory, forgetMemory, rememberedText } from '../shared/neo-memory.mjs';

const AT = Date.UTC(2026, 9, 17, 9, 0, 0);
const SCREEN = {
  open: { id: 'w-j', title: 'JARVIS for Agentbox', options: [{ n: 1, text: 'Ship it' }], pictures: [], films: [], files: [] },
  rows: [{ id: 'w-p', title: 'Pricing page copy' }], commands: [], canGoBack: false,
};

function store(start = {}) {
  let doc = cleanMemory(start);
  return {
    read: () => doc,
    remembered: () => rememberedText(doc),
    add(text) { const r = addMemory(doc, text, AT); doc = r.doc; return r; },
    forget(id) { const r = forgetMemory(doc, id); doc = r.doc; return r; },
  };
}

// The noticing question is the one with a `keep` choice on it; everything
// else is the ordinary pick.
const noticingCall = (options) => options.some((o) => o.value === 'keep');

function setup({ action = 'next', keep = 'keep', sure = 0.9, pickSure = 0.95, memory = store(), wrote = 'Never close a thread without asking me first.' } = {}) {
  const asked = [];
  const askMain = vi.fn(async (name) => (name === 'neo_screen' ? { ok: true, screen: SCREEN } : { ok: true, status: 'committed', said: `did ${name}` }));
  const decideImpl = vi.fn(async ({ options, instructions }) => {
    asked.push({ noticing: noticingCall(options), instructions, options });
    return noticingCall(options)
      ? { choice: keep, confidence: sure, runnersUp: [], ms: 40 }
      : { choice: typeof action === 'function' ? action(options) : action, confidence: pickSure, runnersUp: [], ms: 100 };
  });
  const rememberWith = wrote === null ? null : vi.fn(async () => ({ text: wrote }));
  const state = {};
  const run = (heard) => runDecision({
    heard, askMain, decideImpl, state, now: () => AT, memory, rememberWith,
    answer: async () => 'answered', compose: async () => ({ send: 'sent' }),
  });
  return { run, asked, memory, rememberWith, decideImpl, state };
}

describe('a preference said in passing', () => {
  it('is kept, while the thing they asked for still happens', async () => {
    const t = setup();
    const r = await t.run('go to the next one, and never close these without asking me');
    expect(t.memory.read().memories.map((m) => m.text)).toEqual(['Never close a thread without asking me first.']);
    expect(t.rememberWith).toHaveBeenCalled();
    expect(r.choice).toBe('next');
  });

  it('is said back, so it can be corrected rather than kept in secret', async () => {
    const t = setup();
    const r = await t.run('go to the next one, and never close these without asking me');
    expect(r.say).toContain('Never close a thread without asking me first.');
    expect(r.say).toMatch(/did next_thread/);
  });

  it('replaces the bare "Okay." rather than contradicting it', async () => {
    const t = setup({ action: 'none' });
    const r = await t.run('honestly I hate it when things close themselves on me');
    expect(r.say).not.toMatch(/Say just "Okay\."/);
    expect(r.say).toContain('Never close a thread without asking me first.');
  });

  it('is asked beside the pick, not instead of it', async () => {
    const t = setup();
    await t.run('go to the next one, and never close these without asking me');
    expect(t.asked.filter((a) => a.noticing)).toHaveLength(1);
    expect(t.asked.filter((a) => !a.noticing).length).toBeGreaterThan(0);
  });
});

describe('what it leaves alone', () => {
  it('keeps nothing when the turn was only a request', async () => {
    const t = setup({ keep: 'nothing' });
    await t.run('open the pricing one for me please');
    expect(t.memory.read().memories).toEqual([]);
    expect(t.rememberWith).not.toHaveBeenCalled();
  });

  it('keeps nothing on a guess it is not sure of, because a wrong memory sticks', async () => {
    const t = setup({ sure: NOTICE - 0.01 });
    await t.run('that is not really how I want this going');
    expect(t.memory.read().memories).toEqual([]);
  });

  it('does not ask at all on a turn too short to hold a preference', async () => {
    const t = setup();
    await t.run('next one');
    expect(t.asked.filter((a) => a.noticing)).toEqual([]);
    expect(t.memory.read().memories).toEqual([]);
  });

  it('leaves words meant for the agent out of Neo\'s own memory', async () => {
    const t = setup({ action: 'reply' });
    await t.run('tell it we never want em dashes in any of the copy');
    expect(t.memory.read().memories).toEqual([]);
  });

  it('leaves a new thread\'s words out of it too', async () => {
    const t = setup({ action: 'new' });
    await t.run('start a new task to never let the build break again');
    expect(t.memory.read().memories).toEqual([]);
  });

  it('does not keep a second copy when they asked for it outright', async () => {
    const t = setup({ action: 'remember' });
    await t.run('remember that I never want threads closed without asking');
    expect(t.memory.read().memories).toHaveLength(1);
  });

  // Neo's question and a memory read back are two things to answer at once.
  it('says nothing extra on a turn where Neo itself is asking something', async () => {
    const t = setup({ action: 'close', pickSure: 0.3, sure: 0.99 });
    const r = await t.run('I would rather these never closed on their own');
    expect(t.state.pending).toBeTruthy();
    expect(r.say).toMatch(/not sure/i);
    expect(r.say).not.toContain('Never close a thread without asking me first.');
  });

  it('does not keep the same line twice', async () => {
    const memory = store();
    memory.add('Never close a thread without asking me first.');
    const t = setup({ memory });
    const r = await t.run('go to the next one, and never close these without asking me');
    expect(t.memory.read().memories).toHaveLength(1);
    expect(r.say).not.toMatch(/you will remember|noted that/i);
  });
});

describe('a Neo with nothing to remember with', () => {
  it('runs exactly as it did before, and spends no extra request', async () => {
    const t = setup({ memory: null, wrote: null });
    const r = await t.run('go to the next one, and never close these without asking me');
    expect(t.asked.filter((a) => a.noticing)).toEqual([]);
    expect(r.choice).toBe('next');
  });
});
