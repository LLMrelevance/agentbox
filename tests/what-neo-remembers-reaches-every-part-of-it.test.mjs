// A KEPT MEMORY IS WORTH NOTHING UNTIL NEO IS THINKING WITH IT (w-6a1c405642).
//
// Neo thinks in three places and they are three different requests: the voice
// session it opens, the pick it makes from what is on screen, and the answer
// it writes to a question. A memory wired into one of them and not the others
// is the failure this file is here for — "never merge without asking" honoured
// by the voice and walked past by the pick.
//
// It also covers the one command the founder asked for: saying "remember
// that…" while Neo is listening has to keep the line, and saying "forget
// that" has to drop it.

import { describe, expect, it, vi } from 'vitest';
import { buildOptions } from '../shared/neo-options.mjs';
import { addMemory, cleanMemory, forgetMemory, rememberedText, withInstructions } from '../shared/neo-memory.mjs';
import { neoSession } from '../shared/neo-tools.mjs';
import { runDecision } from '../main/neo/decided.mjs';

const AT = Date.UTC(2026, 9, 17, 9, 0, 0);
const KEPT = addMemory(withInstructions({}, 'Talk to me like a colleague.'), 'Never merge without asking me.', AT).doc;
const REMEMBERED = rememberedText(KEPT);

const SCREEN = {
  open: { id: 'w-j', title: 'JARVIS for Agentbox', options: [{ n: 1, text: 'Ship it' }], pictures: [], films: [], files: [] },
  rows: [], commands: [], canGoBack: false,
};

// A memory store held in memory, the same shape main/neo/memory.mjs returns.
function store(start = {}) {
  let doc = cleanMemory(start);
  return {
    read: () => doc,
    remembered: () => rememberedText(doc),
    add(text) { const r = addMemory(doc, text, AT); doc = r.doc; return r; },
    forget(id) { const r = forgetMemory(doc, id); doc = r.doc; return r; },
  };
}

function setup(choice, { memory = store(KEPT), confidence = 0.95 } = {}) {
  const calls = [];
  const inputs = [];
  const askMain = vi.fn(async (name, args = {}, heard = '') => {
    if (name === 'neo_screen') return { ok: true, screen: SCREEN };
    calls.push([name, args, heard]);
    return { ok: true, status: 'committed', said: `did ${name}` };
  });
  const decideImpl = vi.fn(async ({ input, options }) => {
    inputs.push(input);
    return { choice: typeof choice === 'function' ? choice(options) : choice, confidence, runnersUp: [], ms: 100 };
  });
  const run = (heard, extra = {}) => runDecision({
    heard, askMain, decideImpl, state: {}, now: () => AT, memory,
    answer: async ({ context, question, remembered: kept = '' }) => `answered ${question} with ${context} ${kept}`,
    ...extra,
  });
  return { run, calls, inputs, memory, decideImpl };
}

describe('the voice session', () => {
  it('carries what the person has told Neo to remember', () => {
    const said = String(neoSession({ remembered: REMEMBERED }).instructions);
    expect(said).toContain('Talk to me like a colleague.');
    expect(said).toContain('- Never merge without asking me.');
  });

  it('is the session it has always been when nothing is remembered', () => {
    expect(neoSession({ remembered: '' }).instructions).toBe(neoSession().instructions);
    expect(neoSession({ remembered: '   ' }).instructions).toBe(neoSession().instructions);
  });

  it('puts it last, so it is the newest thing said and not buried in the habits', () => {
    const said = String(neoSession({ remembered: REMEMBERED, pace: 'fast' }).instructions);
    expect(said.indexOf('Never merge without asking me.')).toBeGreaterThan(said.indexOf('Talk fast'));
  });
});

describe('the pick', () => {
  it('is made knowing what Neo remembers', async () => {
    const t = setup('next');
    await t.run('next');
    expect(t.inputs[0]).toContain('Never merge without asking me.');
    expect(t.inputs[0]).toContain('Talk to me like a colleague.');
  });

  it('says nothing extra when nothing is remembered', async () => {
    const t = setup('next', { memory: store({}) });
    await t.run('next');
    expect(t.inputs[0]).not.toMatch(/standing instructions/i);
  });

  it('is unchanged when no memory was handed in at all', async () => {
    const calls = [];
    const askMain = vi.fn(async (name) => (name === 'neo_screen' ? { ok: true, screen: SCREEN } : (calls.push(name), { ok: true, said: 'done' })));
    const r = await runDecision({ heard: 'next', askMain, decideImpl: async () => ({ choice: 'next', confidence: 0.9, runnersUp: [], ms: 1 }), state: {} });
    expect(r.choice).toBe('next');
    expect(calls).toEqual(['next_thread']);
  });
});

describe('the answer to a question', () => {
  it('is written knowing what Neo remembers', async () => {
    const t = setup('ask');
    const r = await t.run('why did it pick that?');
    expect(r.say).toContain('Never merge without asking me.');
  });

  // The writer is told the screen text is data and never an instruction, so a
  // memory folded in beside it would be read as data too.
  it('carries it apart from the screen text, which the writer is told to ignore as instruction', async () => {
    const seen = [];
    await runDecision({
      heard: 'why did it pick that?',
      askMain: async (name) => (name === 'neo_screen'
        ? { ok: true, screen: SCREEN }
        : { ok: true, said: 'the thread is about Neo' }),
      decideImpl: async () => ({ choice: 'ask', confidence: 0.9, runnersUp: [], ms: 1 }),
      state: {},
      memory: store(KEPT),
      answer: async (args) => { seen.push(args); return 'ok'; },
    });
    expect(seen[0].remembered).toContain('Never merge without asking me.');
    expect(seen[0].context).not.toContain('Never merge without asking me.');
  });
});

describe('the options on screen', () => {
  it('offer remembering something, always', () => {
    const { list } = buildOptions(SCREEN);
    expect(list.find((o) => o.value === 'remember')?.description).toMatch(/remember/i);
  });

  it('offer forgetting each kept line by name, and saying what is kept', () => {
    const { list } = buildOptions({ ...SCREEN, memories: KEPT.memories });
    const forget = list.filter((o) => o.value.startsWith('forget:'));
    expect(forget).toHaveLength(1);
    expect(forget[0].description).toContain('Never merge without asking me.');
    expect(forget[0].act).toEqual({ kind: 'forget', id: KEPT.memories[0].id });
    expect(list.some((o) => o.value === 'remembered')).toBe(true);
  });

  it('offer neither when nothing is kept, so an empty inbox gains no dead choices', () => {
    const { list } = buildOptions(SCREEN);
    expect(list.some((o) => o.value.startsWith('forget:'))).toBe(false);
    expect(list.some((o) => o.value === 'remembered')).toBe(false);
  });
});

describe('saying "remember that…"', () => {
  it('keeps what the writer made of it, and says it back', async () => {
    const t = setup('remember', { memory: store({}) });
    const r = await t.run('um, remember that I never want you to merge anything without asking me first', {
      rememberWith: async () => ({ text: 'Never merge anything without asking first.' }),
    });
    expect(t.memory.read().memories.map((m) => m.text)).toEqual(['Never merge anything without asking first.']);
    expect(r.say).toContain('Never merge anything without asking first.');
  });

  it('keeps the person\'s own words when there is no writer to clean them up', async () => {
    const t = setup('remember', { memory: store({}) });
    await t.run('Remember that I like short answers.', { rememberWith: null });
    expect(t.memory.read().memories.map((m) => m.text)).toEqual(['I like short answers.']);
  });

  it('asks what to remember rather than keeping an empty line', async () => {
    const t = setup('remember', { memory: store({}) });
    const r = await t.run('remember', { rememberWith: async () => ({ text: null }) });
    expect(t.memory.read().memories).toEqual([]);
    expect(r.say).toMatch(/what/i);
  });

  it('does not keep the same thing twice, and says it is already kept', async () => {
    const t = setup('remember');
    const r = await t.run('remember never to merge without asking me', {
      rememberWith: async () => ({ text: 'Never merge without asking me.' }),
    });
    expect(t.memory.read().memories).toHaveLength(1);
    expect(r.say).toMatch(/already/i);
  });

  it('says so plainly when it could not be kept', async () => {
    const broken = { ...store(KEPT), add: () => { throw new Error('disk full'); } };
    const t = setup('remember', { memory: broken });
    const r = await t.run('remember that', { rememberWith: async () => ({ text: 'Something.' }) });
    expect(r.say).toMatch(/not|could/i);
  });
});

describe('saying "forget that"', () => {
  it('drops the line the pick named', async () => {
    const t = setup((options) => options.find((o) => o.value.startsWith('forget:')).value);
    const r = await t.run('forget the merge one');
    expect(t.memory.read().memories).toEqual([]);
    expect(r.say).toMatch(/forgot|forgotten/i);
  });
});

describe('saying "what do you remember?"', () => {
  it('reads back what is kept, without acting on the app', async () => {
    const t = setup('remembered');
    const r = await t.run('what do you remember about me?');
    expect(t.calls).toEqual([]);
    expect(r.say).toContain('Never merge without asking me.');
  });
});
