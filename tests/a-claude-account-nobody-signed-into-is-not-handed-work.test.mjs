// A CLAUDE ACCOUNT NOBODY HAS SIGNED INTO IS NOT HANDED WORK.
//
// What broke (a tester's report, 2026-10-14): Settings > Claude Code listed two
// rows, one signed in and one reading "Not signed in" with the command
// `CLAUDE_CONFIG_DIR=~/.claude-2 claude`. Her first task and a second one both
// opened with "This run stopped because the account was signed out" and our own
// "Claude Code could not sign in, so nothing has been done on this task", and
// then finished anyway with the right answer underneath.
//
// How: Add account (main/settings.mjs `addClaudeAccount`) makes ~/.claude-2 and
// registers it in `authProfiles` BEFORE anybody signs in, on purpose, so the
// row shows. The round-robin then gave that empty folder every other task. Each
// one died on arrival, got the "nothing has been done" sentence, and moved to
// the signed-in account on the next pass. Codex already skipped a login still
// being added (`_codexSignedIn`); the Claude harness answered `signedIn: () =>
// true` for every folder. Measured here before the fix: ten picks over
// ['default', ~/.claude-2-shaped folder with no login] went to both.
//
// The test for "signed in" is the one the Accounts page already uses to put an
// email on a row: `accountIdentity`, the account Claude Code writes into the
// folder's .claude.json after a login. A folder Claude Code has opened but
// nobody has logged into has that file without an account in it, so the file
// existing is not enough.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Supervisor } from '../main/supervisor.mjs';

let root;

function folder(name, claudeJson) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  if (claudeJson) fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify(claudeJson));
  return dir;
}

const signedInAs = (email, accountUuid) => ({ oauthAccount: { emailAddress: email, accountUuid } });

function bare(config = {}) {
  const s = Object.create(Supervisor.prototype);
  s.config = { home: root, maxConcurrentSessions: 3, ...config };
  s._profileCooldown = {};
  s._profileStrikes = {};
  s._profileTrouble = {};
  s._saveState = () => {};
  return s;
}

function picks(s, n = 10) {
  const out = new Set();
  for (let i = 0; i < n; i += 1) out.add(s._pickProfile('claude'));
  return [...out].sort();
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'unsigned-claude-'));
  // The default login, signed in.
  folder('.claude', signedInAs('person@example.com', 'uuid-a'));
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('the pick', () => {
  it('never sends work to a folder Add account made and nobody signed into', () => {
    const empty = folder('.claude-2');
    expect(picks(bare({ authProfiles: ['default', empty] }))).toEqual(['default']);
  });

  // Running `claude` in the folder writes .claude.json before any login does.
  it('still skips it once Claude Code has opened the folder without a login', () => {
    const opened = folder('.claude-2', { numStartups: 1, hasCompletedOnboarding: false });
    expect(picks(bare({ authProfiles: ['default', opened] }))).toEqual(['default']);
  });

  // The case that must NOT match: a second account that is signed in keeps
  // its share of the work.
  it('keeps using a second folder that is signed in', () => {
    const second = folder('.claude-2', signedInAs('other@example.com', 'uuid-b'));
    expect(picks(bare({ authProfiles: ['default', second] }))).toEqual(['default', second].sort());
  });

  // And the moment the sign-in lands, it joins without a restart.
  it('starts using the folder as soon as somebody signs into it', () => {
    const later = folder('.claude-2');
    const s = bare({ authProfiles: ['default', later] });
    expect(picks(s)).toEqual(['default']);
    fs.writeFileSync(path.join(later, '.claude.json'), JSON.stringify(signedInAs('other@example.com', 'uuid-b')));
    expect(picks(s)).toEqual(['default', later].sort());
  });

  // The default login is never judged by a file: some installs keep it where
  // this check does not look, and ruling it out would stop a working fleet.
  it('never rules out the default login', () => {
    fs.rmSync(path.join(root, '.claude', '.claude.json'));
    const second = folder('.claude-2', signedInAs('other@example.com', 'uuid-b'));
    expect(picks(bare({ authProfiles: ['default', second] }))).toEqual(['default', second].sort());
  });

  // Somewhere still has to be tried when the only account she picked is the
  // empty one; the pick never answers nothing.
  it('still tries the empty folder when it is the only one allowed', () => {
    const empty = folder('.claude-2');
    expect(picks(bare({ authProfiles: ['default', empty], activeAccount: { claude: empty } }))).toEqual([empty]);
  });
});

describe('whether another login can take a task', () => {
  // With the default login signed out, an empty second folder is not
  // "another login that is free", so the task does not claim to be moving.
  it('does not count a folder nobody signed into', () => {
    const empty = folder('.claude-2');
    const s = bare({ authProfiles: ['default', empty] });
    expect(s._anotherLoginIsFree({ engine: 'claude' }, 'default')).toBe(false);
  });

  it('counts a second folder that is signed in', () => {
    const second = folder('.claude-2', signedInAs('other@example.com', 'uuid-b'));
    const s = bare({ authProfiles: ['default', second] });
    expect(s._anotherLoginIsFree({ engine: 'claude' }, 'default')).toBe(true);
  });
});
