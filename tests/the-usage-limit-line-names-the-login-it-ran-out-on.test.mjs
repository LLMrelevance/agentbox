// THE LINE ABOUT A USAGE LIMIT NAMED NO LOGIN.
//
// Both power testers ran two Claude accounts and hit it (run 1 issue 10, run 2
// issue 20). The thread said "Claude Code is at its usage limit, so nothing has
// been done on this task. Agentbox runs it again on another account that has
// room", and neither account was named anywhere on the thread or in the side
// panel: no way to tell which subscription was spent, or which one answered
// next. "Which login hit its limit, and which login ran answer 2, so I know
// whether my personal account got billed for work."
//
// An account is named by the rule the Settings page already uses, which is now
// shared (shared/account-names.mjs): the email the vendor gave, else a counted
// name.
//
// THE CASE THAT MUST NOT MATCH is a Mac with one login, where naming it tells
// nobody anything. There the sentence is word for word what it was.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { accountName } from '../shared/account-names.mjs';
import { deadRunCause, deadRunSentence } from '../shared/spawn-trouble.mjs';
import { Store } from '../main/store.mjs';
import { Supervisor } from '../main/supervisor.mjs';

describe('what one account is called', () => {
  it('is the email the vendor gave', () => {
    expect(accountName({ email: 'alex@example.com', engine: 'claude', index: 1, total: 2 })).toBe('alex@example.com');
  });

  it('is a counted name when there is no email and more than one account', () => {
    expect(accountName({ email: null, engine: 'claude', index: 1, total: 2 })).toBe('Claude account 2');
    expect(accountName({ email: null, engine: 'codex', index: 0, total: 2 })).toBe('Codex account 1');
  });

  it('is not counted when there is only one', () => {
    expect(accountName({ email: null, engine: 'claude', index: 0, total: 1 })).toBe('Claude account');
  });
});

describe('the sentence on a thread whose login ran out', () => {
  const limit = (extra) => deadRunSentence({ engineWord: 'Claude Code', cause: 'at-limit', ...extra });

  it('names the account it ran out on, and the one it moves to', () => {
    expect(limit({ account: 'alex@work.com', elsewhere: true, instead: 'alex@home.com' })).toBe(
      'Claude Code is at its usage limit on alex@work.com, so nothing has been done on this task.'
      + ' Agentbox runs it again on alex@home.com, which has room.',
    );
  });

  it('names the account it ran out on while it waits for the reset', () => {
    expect(limit({ account: 'alex@work.com', resetsAt: '6pm' })).toBe(
      'Claude Code is at its usage limit on alex@work.com, so nothing has been done on this task.'
      + ' It starts again on its own at 6pm.',
    );
  });

  it('says so on a run that had already done some work', () => {
    expect(limit({ account: 'alex@work.com', worked: true, resetsAt: '6pm' })).toBe(
      'Claude Code hit its usage limit on alex@work.com partway through, so this task is not finished.'
      + ' It starts again on its own at 6pm.',
    );
  });

  // The one-login Mac, and every row written before this landed.
  it('is word for word what it was when no account is named', () => {
    expect(limit({ resetsAt: '6pm' })).toBe(
      'Claude Code is at its usage limit, so nothing has been done on this task. It starts again on its own at 6pm.',
    );
    expect(limit({ elsewhere: true })).toBe(
      'Claude Code is at its usage limit, so nothing has been done on this task.'
      + ' Agentbox runs it again on another account that has room.',
    );
  });

  // Every other cause is untouched: an account is a fact about a limit.
  it('leaves the other causes alone', () => {
    expect(deadRunSentence({ engineWord: 'Codex', cause: 'signed-out', account: 'alex@work.com' }))
      .toBe('Codex could not sign in, so nothing has been done on this task. Sign that account back in and it picks straight up.');
  });

  // AND IT STILL READS BACK AS A ROW NOTHING RAN ON, which is what the count
  // above her list is built on (`deadRunCause`). The name sits inside the
  // opener, so matching the whole of it is not enough any more.
  it('is still read back as a run that did nothing', () => {
    expect(deadRunCause(limit({ account: 'alex@work.com', resetsAt: '6pm' }))).toBe('at-limit');
    expect(deadRunCause(limit({ resetsAt: '6pm' }))).toBe('at-limit');
    // A run that worked and then hit the limit is not one nothing ran on.
    expect(deadRunCause(limit({ account: 'alex@work.com', worked: true }))).toBe(null);
  });
});

describe('the supervisor names its own logins', () => {
  let root, sup;
  const signedIn = (dir, email) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: email, accountUuid: email } }));
  };
  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'limit-login-'));
    const store = await new Store({ accountRoot: root, storeRoot: root, products: [], personalProducts: [] }).init();
    sup = new Supervisor({ accountRoot: root, storeRoot: root, home: root, products: [], personalProducts: [] }, store, path.resolve('.'), root);
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('says nothing about a login on a Mac with one', () => {
    signedIn(path.join(root, '.claude'), 'only@example.com');
    expect(sup._accountNameFor('claude', 'default')).toBe(null);
  });

  it('names a login by its email where there are two', () => {
    signedIn(path.join(root, '.claude'), 'work@example.com');
    signedIn(path.join(root, '.claude-second'), 'home@example.com');
    const profiles = sup._profilesFor('claude');
    expect(profiles.length).toBe(2);
    const named = profiles.map((p) => sup._accountNameFor('claude', sup._accountKey('claude', p)));
    expect(named).toContain('work@example.com');
    expect(named).toContain('home@example.com');
  });

  it('answers nothing for a key it does not know', () => {
    signedIn(path.join(root, '.claude'), 'work@example.com');
    signedIn(path.join(root, '.claude-second'), 'home@example.com');
    expect(sup._accountNameFor('claude', 'codex:nowhere')).toBe(null);
  });

  // THE WHOLE THING, through the method that really writes it: a run that died
  // at its limit on one login while the other had room.
  it('writes both names onto the thread when a run dies at its limit', () => {
    signedIn(path.join(root, '.claude'), 'work@example.com');
    const second = path.join(root, '.claude-second');
    signedIn(second, 'home@example.com');
    const written = [];
    sup.store = {
      ...sup.store,
      recordSessionResult: (product, id, patch) => { written.push(patch); return null; },
    };
    const item = { id: 'w-1', product: 'p', status: 'open', title: 'Dedupe pass@k' };
    sup.sayTheRunDied(item, {
      engine: 'claude',
      profile: second,
      accountFault: { account: second, cause: 'at-limit' },
      tail: ['stderr: API Error: Claude AI usage limit reached.'],
      result: null,
    });
    expect(written[0].result).toContain('usage limit on home@example.com');
    expect(written[0].result).toContain('runs it again on work@example.com, which has room');
  });
});
