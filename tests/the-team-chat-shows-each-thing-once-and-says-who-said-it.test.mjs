// What the team chat draws (w-4bd7b5548b), from the first real power test:
// an answer typed in a teammate's thread never reached its page; a message
// right after an activity line lost its name, so Felix's words read as
// Hugo's; and on Ada's page a message to Ada and Hugo said only "to Hugo".
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { chatEntries, involves } from '../renderer/src/teammates/chat-lines.ts';

const ADA = 't-aaaaaaaaaa';
const HUGO = 't-hhhhhhhhhh';
const msg = (id, from, to, text, ts) => ({ id, kind: 'msg', from, to, text, ts });
const run = (id, verb, ts, extra = {}) => ({ id, kind: 'run', teammate: ADA, item: 'w-1', product: 'p', title: 'Onboarding', verb, ts, ...extra });

describe('the team chat', () => {
  it('shows an answer you typed in the thread, but not one the chat already shows', () => {
    const view = {
      list: [],
      chat: [msg('m-1', 'you', [ADA], 'Use Product instead', 10)],
      runs: [run('w-1:answered', 'answered', 11, { text: 'Use Product instead' }), run('w-2:answered', 'answered', 20, { text: 'Skip the FAQ' })],
    };
    const shown = chatEntries(view).map((e) => e.id);
    expect(shown).toEqual(['m-1', 'w-2:answered']);
  });

  it('leaves out a pass\'s own start line and the message that starts a teammate', () => {
    const view = { list: [], chat: [{ ...msg('m-s', 'you', [ADA], 'Introduce yourself', 1), start: true }], runs: [run('w-1:start', 'passed', 2), run('w-2:start', 'picked', 3)] };
    expect(chatEntries(view).map((e) => e.id)).toEqual(['w-2:start']);
  });

  // "Chat got busy though: 6 picked-up/finished lines for one small ask."
  it('the team chat leaves out picked up for a run that finished, and a teammate\'s page keeps it', () => {
    const view = { list: [], chat: [], runs: [run('w-1:start', 'picked', 1, { item: 'w-1' }), run('w-1:done', 'finished', 2, { item: 'w-1' }), run('w-2:start', 'picked', 3, { item: 'w-2' })] };
    expect(chatEntries(view).map((e) => e.id)).toEqual(['w-1:done', 'w-2:start']);
    expect(chatEntries(view, ADA).map((e) => e.id)).toEqual(['w-1:start', 'w-1:done', 'w-2:start']);
  });

  it('a teammate\'s page holds what it said, did, and what was said to it, and nothing else', () => {
    expect(involves(msg('m', 'you', [ADA, HUGO], 'x', 1), ADA)).toBe(true);
    expect(involves(msg('m', HUGO, [], 'x', 1), ADA)).toBe(false);
    expect(involves({ id: 'p', kind: 'pass', from: HUGO, to: ADA, title: 't', ts: 1 }, ADA)).toBe(true);
    expect(involves(run('w', 'picked', 1), ADA)).toBe(true);
  });

  it('signs a message after an activity line, and names every person it went to', () => {
    const page = fs.readFileSync(new URL('../renderer/src/teammates/TeammatesPage.tsx', import.meta.url), 'utf8');
    expect(page).toMatch(/<Activity [^\n]*\/>\);\n\s*\/\/[^\n]*\n\s*prevFrom = '';/);
    expect(page).not.toMatch(/filter\(\(x\) => x !== only\?\.id\)/);
  });
});
