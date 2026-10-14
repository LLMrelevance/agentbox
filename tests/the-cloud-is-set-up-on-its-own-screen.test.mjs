// THE CLOUD IS SET UP ON ITS OWN SCREEN, AND THE MENU ONLY POINTS AT IT.
//
// What broke: on 2026-10-14 the cloud menu walked her through each account's
// sign-in inside the menu itself. Her words: "imagine this component: what is
// it for? If you're getting set up with Claude for the first time, it should
// maybe say, 'You're not set up. You should get set up,' and then it should
// walk you through it. The component shouldn't walk you through it." So the
// menu says one line and offers Set up, and the setup is a full screen built
// from the first-run walk's setup card (components/CloudSetup.tsx). Here:
// what the menu says, which account the setup is on, and the three steps it
// shows for each, measured against the states a real sign-in passes through
// (main/cloud/logins.mjs).

import { describe, it, expect } from 'vitest';
import { menuSetupLine, currentAccount, stepsFor, keyOf, WHERE_ROWS, SETUP } from '../renderer/src/cloud-setup';

const acct = (extra) => ({ engine: 'claude', profile: 'default', name: 'me@example.com', ready: false, state: 'none', signIn: null, ...extra });
const status = (accounts, mode = 'full') => ({ setUp: true, mode, running: 0, month: { runs: 0, agentHours: 0, estimatedCost: 0, costPerAgentHour: null }, accounts });
const si = (state, extra = {}) => ({ signIn: { state, url: null, code: null, message: null, ...extra } });

describe('what the cloud menu says about setup', () => {
  it('says it is not set up when no account has signed in, and offers Set up', () => {
    expect(menuSetupLine(status([acct(), acct({ engine: 'codex' })]))).toEqual({ say: 'Not set up yet.', go: 'Set up' });
  });

  it('says how many are left once some have, and offers to finish', () => {
    expect(menuSetupLine(status([acct({ ready: true, state: 'ready' }), acct({ profile: '/b' })]))).toEqual({ say: '1 account still needs to sign in.', go: 'Finish setup' });
    expect(menuSetupLine(status([acct({ ready: true, state: 'ready' }), acct({ profile: '/b' }), acct({ profile: '/c' })])).say).toBe('2 accounts still need to sign in.');
  });

  it('asks for a sign-in again when one stopped working', () => {
    expect(menuSetupLine(status([acct({ state: 'broken' }), acct({ profile: '/b', ready: true, state: 'ready' })])).say).toBe('An account needs to sign in again.');
  });

  it('says nothing when every account is set up, while a Codex login is only renewing, or when threads stay on this Mac', () => {
    expect(menuSetupLine(status([acct({ ready: true, state: 'ready' })]))).toBe(null);
    expect(menuSetupLine(status([acct({ engine: 'codex', state: 'renew' })]))).toBe(null);
    expect(menuSetupLine(status([acct()], 'mac'))).toBe(null);
  });
});

describe('which account the setup is on', () => {
  const a = acct({ profile: '/a' }); const b = acct({ profile: '/b' }); const c = acct({ engine: 'codex', profile: 'default' });
  const order = [a, b, c].map(keyOf);

  it('takes them in order, passing the ones that are ready and the ones she skipped', () => {
    expect(currentAccount([a, b, c], order)).toBe(a);
    const aDone = { ...a, ready: true };
    expect(currentAccount([aDone, b, c], order)).toBe(b);
    expect(currentAccount([aDone, b, c], order, [keyOf(b)])).toBe(c);
    expect(currentAccount([aDone, { ...b, ready: true }, { ...c, ready: true }], order)).toBe(null);
  });

  it('stays on one that is signing in, whatever the order says', () => {
    const live = { ...c, ...si('waiting', { code: 'X' }) };
    expect(currentAccount([a, b, live], order)).toBe(live);
  });
});

describe('the three steps of one sign-in', () => {
  const states = (a) => stepsFor(a).map((s) => s.state);

  it('walks Claude: open the page, paste its code, then check', () => {
    expect(states(acct(si('starting')))).toEqual(['now', 'todo', 'todo']);
    expect(states(acct(si('needs-code', { url: 'https://claude.com/x' })))).toEqual(['done', 'now', 'todo']);
    expect(states(acct(si('checking')))).toEqual(['done', 'done', 'now']);
    expect(states(acct({ ready: true, state: 'ready', ...si('saved') }))).toEqual(['done', 'done', 'done']);
    expect(stepsFor(acct(si('needs-code')))[1].title).toMatch(/paste the code Claude shows/);
  });

  it('walks Codex: open the page, type the code shown here, and it finishes by itself', () => {
    const waiting = stepsFor(acct({ engine: 'codex', ...si('waiting', { url: 'https://auth.openai.com/codex/device', code: 'WY6D-YCCOE' }) }));
    expect(waiting.map((s) => s.state)).toEqual(['done', 'now', 'todo']);
    expect(waiting[0].title).toMatch(/OpenAI/);
    expect(waiting[1].sub).toMatch(/finishes by itself/);
  });

  it('claims nothing is opening once a sign-in has failed', () => {
    const failed = stepsFor(acct(si('failed', { message: 'Claude did not accept that code.' })));
    expect(failed.map((s) => s.state)).toEqual(['todo', 'todo', 'todo']);
    expect(failed[0].sub).toBeUndefined();
  });
});

describe('the last screen', () => {
  it('asks where new threads start, with the two choices that use the cloud', () => {
    expect(WHERE_ROWS.map((r) => r.key)).toEqual(['all', 'full']);
    expect(SETUP.doneHead).toBe('You’re set up');
  });
});

// Her second look, 2026-10-14: the first screen was the old corner layout
// ("nobody reads text that's just in the bottom corner"), picking a choice
// jumped to a whole new page "without your approval", and the menu's Setup
// row was "very strange and I don't even notice it".
describe('the way in', () => {
  it('opens the setup only when she asks for it, never when she picks where threads run', async () => {
    const fs = await import('node:fs');
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    const pick = app.slice(app.indexOf('onCloudMode={'), app.indexOf('onCloudSetUp={'));
    expect(pick).not.toMatch(/setCloudSetupOpen/);
    expect(app).toMatch(/onCloudSetUp=\{\(\) => setCloudSetupOpen\(true\)\}/);
  });

  it('starts with what the cloud gives and who signs in, and one button naming how many', () => {
    expect(SETUP.introGets.map((g) => g.key)).toEqual(['lid', 'many', 'plans']);
    expect(SETUP.introGo(3)).toBe('Set up 3 accounts');
    expect(SETUP.introGo(1)).toBe('Set up');
    expect(SETUP.inviteGo).toBe('Set up the cloud');
  });
});
