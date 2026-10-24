// A THROWAWAY COPY'S NOTE SAYS WHAT THAT COPY WILL DO, NOT WHAT IS BROKEN.
//
// Found by the tester, 2026-10-23 (F-16). Opening Agentbox as a new user put up
// "Claude Code is not at ~/.local/bin/claude, so agents will not run in it." and
// took it away again on its own. Read cold that is a dead end with a file path
// in it: no link, no choice, nothing to press.
//
// It is read cold because it reads as a fault, and it is not one. The note is
// said in the window that RAN the command, about the copy it just opened, and
// that copy's own setup offers to install Claude Code or to sign in to ChatGPT
// instead -- which is exactly the "install link or use-Codex-only choice" the
// finding asks for. The sentence was describing the hole and not the door.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openFreshUser } from '../main/fresh-user.mjs';

const home = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-note-'));

/** A fresh copy opened with nothing stubbed out but the spawn and the clock. */
const open = (opts) => openFreshUser({
  spawnFn: () => ({ pid: 1, unref() {} }),
  execPath: process.execPath,
  argv: [process.execPath, 'main.mjs'],
  packaged: false,
  now: new Date('2026-10-24T00:22:25Z'),
  ...opts,
});

describe('the note about a missing Claude Code', () => {
  const out = open({ withTools: true, withAgents: false });
  const note = (out.notes ?? []).find((n) => /Claude Code/.test(n));

  it('says what that copy will do about it', () => {
    expect(note).toBeTruthy();
    expect(note).toMatch(/set one up|install/i);
    expect(note).toMatch(/ChatGPT/);
  });

  // THE CASE THAT MUST NOT MATCH. "agents will not run" was the whole of the
  // old sentence and it is the part that read as a dead end.
  it('no longer says agents will not run, because that copy can still set one up', () => {
    expect(note).not.toMatch(/will not run/);
  });

  it('is still about that copy and not about the computer it was opened from', () => {
    expect(note).toMatch(/copy/i);
  });
});

describe('the notes that are not about a missing tool', () => {
  // THE CASE THAT MUST NOT MATCH, at the other end: the honest notes about a
  // throwaway home stay exactly as they were.
  it('still says when there is no keychain for Claude Code to read', () => {
    const out = open({ withTools: true, withAgents: false, home: home() });
    expect((out.notes ?? []).join(' ')).toMatch(/Keychains|\.claude/);
  });
});
