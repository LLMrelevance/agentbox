// A TASK THAT MOVES OFF A SIGNED-OUT ACCOUNT SAYS IT MOVED.
//
// What broke (a tester's report, 2026-10-14): with one of two Claude accounts
// signed out, a thread opened with our own "Claude Code could not sign in, so
// nothing has been done on this task. Sign that account back in and it picks
// straight up." The very next pass ran the task on the account that was
// signed in, and it finished with the right answer directly underneath. Her
// words: "the message says nothing was done while the task still finishes,
// which is confusing for someone who does not know the cause. A clearer
// message when only one account is signed out would help."
//
// The sentence was written as if the dead account were the only one.
// `restingUntil` already lets the row run at once when `_anotherLoginIsFree`,
// so the facts were known at the moment of writing; the words ignored them.
// Measured before the fix: `sayTheRunDied` with a healthy second login wrote
// "could not sign in, so nothing has been done on this task".
//
// Covered: the reported cause (signed out), the other account-shaped causes
// that move the same way (a usage limit, an admin's block, an ended
// subscription), and the case that must NOT change, one account with nowhere
// else to go, which keeps the old sentence word for word.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';
import { deadRunSentence, deadRunCause } from '../shared/spawn-trouble.mjs';

const SIGNED_OUT = 'Failed to authenticate: OAuth session expired and could not be refreshed';
const AT_LIMIT = 'API Error: Claude AI usage limit reached. Your weekly limit resets at 4pm.';

const firstSentence = (s) => s.split('. ')[0] + '.';

describe('the words', () => {
  it('says the task is moving when another account takes it', () => {
    const line = deadRunSentence({ engineWord: 'Claude Code', cause: 'signed-out', movesOn: true });
    expect(line).toMatch(/One of your Claude Code accounts is signed out/);
    expect(line).toMatch(/moving to another one/);
    expect(line).not.toMatch(/nothing has been done/);
    expect(line).not.toMatch(/picks straight up/);
    expect(firstSentence(line).length).toBeLessThan(112);
  });

  it('still says how to bring the signed-out account back', () => {
    expect(deadRunSentence({ cause: 'signed-out', movesOn: true, engineWord: 'Claude Code' })).toMatch(/Settings/);
  });

  it('moves the same way off an account at its limit, without promising a reset', () => {
    const line = deadRunSentence({ engineWord: 'Claude Code', cause: 'at-limit', resetsAt: '4pm', movesOn: true });
    expect(line).toMatch(/at its usage limit/);
    expect(line).toMatch(/moving to another one/);
    expect(line).not.toMatch(/nothing has been done/);
    expect(line).not.toMatch(/starts again on its own/);
  });

  it('keeps every first sentence under the inbox clip', () => {
    for (const cause of ['signed-out', 'at-limit', 'org-blocked', 'subscription-ended']) {
      for (const engineWord of ['Claude Code', 'Codex']) {
        const line = deadRunSentence({ engineWord, cause, movesOn: true });
        expect(line).not.toMatch(/nothing has been done/);
        expect(firstSentence(line).length).toBeLessThan(112);
      }
    }
  });

  // A moving task is not stuck, so it is not counted above her list as one
  // nothing has started.
  it('is not counted as a task nothing ran on', () => {
    expect(deadRunCause(deadRunSentence({ engineWord: 'Claude Code', cause: 'signed-out', movesOn: true }))).toBe(null);
  });

  // The case that must not change: nowhere else to go.
  it('is word for word the old sentence when no other account can take it', () => {
    const line = deadRunSentence({ engineWord: 'Claude Code', cause: 'signed-out' });
    expect(line).toBe('Claude Code could not sign in, so nothing has been done on this task. Sign that account back in and it picks straight up.');
    expect(deadRunCause(line)).toBe('signed-out');
  });

  // Causes that are not about one account never claim to move.
  it('ignores the flag for causes that are not about an account', () => {
    expect(deadRunSentence({ cause: 'workspace', movesOn: true })).toBe(deadRunSentence({ cause: 'workspace' }));
    expect(deadRunSentence({ cause: 'unknown', movesOn: true })).toBe(deadRunSentence({ cause: 'unknown' }));
  });
});

describe('what the supervisor writes on the row', () => {
  let root;
  let second;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'moves-on-'));
    for (const [name, uuid] of [['.claude', 'uuid-a'], ['.claude-2', 'uuid-b']]) {
      fs.mkdirSync(path.join(root, name), { recursive: true });
      fs.writeFileSync(path.join(root, name, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: `${name}@example.com`, accountUuid: uuid } }));
    }
    second = path.join(root, '.claude-2');
  });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  const item = () => ({ id: 'w-1', product: 'p', status: 'open', kind: 'directive', labels: ['founder'], engine: 'claude', title: 'List my downloads' });

  function makeSupervisor(authProfiles) {
    const store = {
      listItems: () => [item()],
      listProducts: () => [{ slug: 'p', name: 'P', dir: root }],
      isDue: () => true,
      written: [],
      recordSessionResult(product, id, patch) { this.written.push({ product, id, ...patch }); },
    };
    const sup = new Supervisor({ storeRoot: root, home: root, maxConcurrentSessions: 3, authProfiles }, store, root);
    sup._saveState = () => {};
    return { sup, store };
  }

  // The real exit path: the account's trouble is filed first, then the words.
  function dieOn(sup, profile, words) {
    const session = { engine: 'claude', profile, startedAt: Date.now() - 1_500, tail: ['session exited (1)'], result: words, resultIsError: true };
    sup.noteExitForBackoff(session);
    sup.sayTheRunDied(item(), session);
  }

  it('says it moved when the second account is signed out and the first is fine', () => {
    const { sup, store } = makeSupervisor(['default', second]);
    dieOn(sup, second, SIGNED_OUT);
    expect(store.written.at(-1).result).toMatch(/One of your Claude Code accounts is signed out/);
    expect(store.written.at(-1).result).not.toMatch(/nothing has been done/);
  });

  it('says it moved off an account at its limit when another has room', () => {
    const { sup, store } = makeSupervisor(['default', second]);
    dieOn(sup, 'default', AT_LIMIT);
    expect(store.written.at(-1).result).toMatch(/moving to another one/);
  });

  it('keeps the old sentence when the only account is signed out', () => {
    const { sup, store } = makeSupervisor(['default']);
    fs.rmSync(second, { recursive: true, force: true });
    dieOn(sup, 'default', SIGNED_OUT);
    expect(store.written.at(-1).result).toMatch(/could not sign in, so nothing has been done/);
  });

  it('keeps the old sentence when the other account is signed out too', () => {
    const { sup, store } = makeSupervisor(['default', second]);
    dieOn(sup, 'default', SIGNED_OUT);
    dieOn(sup, second, SIGNED_OUT);
    expect(store.written.at(-1).result).toMatch(/could not sign in, so nothing has been done/);
  });
});
