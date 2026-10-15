// What broke (2026-10-15): after she pasted Claude's code, the cloud setup sat
// on "Checking…" while the cloud finished the sign-in and tried the account,
// with nothing else to do: "anything over 3 seconds is too long. You should
// probably be doing it in the background. If it doesn't work, find a way to
// tell them at the right time." Measured on 2026-10-14 against the real cloud,
// the link came in 4–16 s and the check after the code is longer still.
//
// Now the check is the cloud's to finish: the moment her part is done the
// setup goes back to her accounts, where the account says it is being added
// and she can carry on, Done included. If it fails she is told on that row
// while she is on the setup, on the cloud button once she has left it, and
// once, in a toast, the moment it fails behind her back.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { SETUP, activeSignIn, addingRows, mayFinish, menuSetupLine } from '../renderer/src/cloud-setup';

const status = (accounts = [], signIns = []) => ({ setUp: true, mode: 'full', running: 0, month: { runs: 0, agentHours: 0, estimatedCost: 0, costPerAgentHour: null }, accounts, signIns });
const acct = (extra) => ({ engine: 'claude', key: 'acct-1', name: null, ready: true, state: 'ready', ...extra });
const si = (state, extra = {}) => ({ engine: 'claude', key: 'acct-9', state, url: null, code: null, message: null, attempt: `a-${state}`, ...extra });

describe('her part of a sign-in, and only her part, holds the screen', () => {
  it('a sign-in waiting on her is on screen', () => {
    for (const s of ['starting', 'needs-code', 'waiting']) expect(activeSignIn(status([], [si(s)]))?.state).toBe(s);
  });
  it('one the cloud is checking, or one that failed, is not: she is back on her accounts', () => {
    expect(activeSignIn(status([], [si('checking')]))).toBe(null);
    expect(activeSignIn(status([], [si('failed', { message: 'x' })]))).toBe(null);
    expect(activeSignIn(status([], [si('saved')]))).toBe(null);
  });
});

describe('her accounts while one is being added', () => {
  it('show the one being added, and the one that failed with why', () => {
    const rows = addingRows(status([acct()], [si('checking'), si('failed', { key: 'acct-8', engine: 'codex', message: 'Claude did not accept that code.' }), si('saved', { key: 'acct-7' })]));
    expect(rows.map((r) => [r.key, r.state])).toEqual([['acct-9', 'checking'], ['acct-8', 'failed']]);
    expect(rows[1].message).toBe('Claude did not accept that code.');
  });
  it('show an account she signs in again on its own row, not a second one', () => {
    expect(addingRows(status([acct({ key: 'acct-1' })], [si('checking', { key: 'acct-1' })]))).toEqual([]);
  });
  it('let her finish while one is being added, but not on a failure alone', () => {
    expect(mayFinish(status([], [si('checking')]))).toBe(true);
    expect(mayFinish(status([], [si('failed')]))).toBe(false);
    expect(mayFinish(status([acct()], []))).toBe(true);
    expect(mayFinish(status([acct({ ready: false, state: 'broken' })], []))).toBe(false);
  });
});

describe('telling her at the right time, once she has left the setup', () => {
  it('the cloud button says one is being added, and that one failed, before anything else', () => {
    expect(menuSetupLine(status([], [si('checking')]))).toEqual({ say: SETUP.menuAdding('claude'), go: null });
    expect(menuSetupLine(status([acct({ state: 'broken', ready: false })], [si('failed', { engine: 'codex', message: 'Sign in with a@b.c instead.' })])))
      .toEqual({ say: SETUP.menuFailed('codex', 'Sign in with a@b.c instead.'), go: SETUP.tryAgain });
    expect(SETUP.menuFailed('claude', null)).toBe('Your Claude account wasn’t added.');
  });
  it('a toast says so the moment one fails while the setup is closed, and only then', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toMatch(/newlyFailedSignIns\(/);
    const cs = fs.readFileSync(new URL('../renderer/src/cloud-setup.ts', import.meta.url), 'utf8');
    expect(cs).toMatch(/export function newlyFailedSignIns/);
  });
});
