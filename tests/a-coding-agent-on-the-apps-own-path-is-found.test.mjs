// A CODING AGENT ON THE APP'S OWN PATH IS FOUND.
//
// Reported (QA batch 007, F-133): a brand-new desktop run on Debian with Codex
// at /home/box/.local/bin/codex, on the PATH the app itself was started with,
// opened on "No coding agent found" and pushed the person through Install
// Codex. Measured on Debian 13 while tracing it: a login shell is where the
// finder looks first, and /etc/profile sets PATH outright, so
//
//   PATH=/tmp/fakebin2:$PATH bash -lic 'echo $PATH'
//   -> /usr/local/bin:/usr/bin:/bin:/usr/local/games:/usr/games
//
// The dir the app was started with is gone before `command -v` runs, and the
// probe exits 1, which `exitedSayingNo` reads as a real "not installed". The
// fixed list is then searched under HOME, and on that run HOME was a fresh
// folder, so nothing there either. The one source that did know -- the app's
// own environment -- was the one source nothing asked.
//
// So the process's own PATH is a search step of its own, between the shell and
// the list. It is a fact about this machine rather than a guess about it, which
// is why it goes above the list; the shell stays first because it is their
// PATH with their profile loaded.
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { findEngine } from '../main/engine-bin.mjs';

const HOME = '/tmp/agentbox-fresh-user/v0118-2203';
const ON_PATH = '/home/box/.local/bin';
const only = (...paths) => (p) => paths.includes(p);
const never = () => false;
// The Debian login shell's answer: it ran, and it said no.
const saidNo = () => ({ path: null, answered: true });

describe('the PATH the app was started with', () => {
  it.each(['claude', 'codex'])('finds %s the login shell could not see', (key) => {
    const real = path.join(ON_PATH, key);
    const found = findEngine(key, {
      home: HOME,
      env: { PATH: `${ON_PATH}:/usr/bin:/bin` },
      exists: only(real),
      shellLookup: saidNo,
      readdir: () => [],
    });
    expect(found.found).toBe(true);
    expect(found.path).toBe(real);
    expect(found.from).toBe('path');
  });

  // The case that must NOT match: a directory on PATH is not a coding agent.
  it.each(['claude', 'codex'])('does not invent %s from a PATH entry with no such file', (key) => {
    const found = findEngine(key, {
      home: HOME,
      env: { PATH: `${ON_PATH}:/usr/bin:/bin` },
      exists: never,
      shellLookup: saidNo,
      readdir: () => [],
    });
    expect(found.found).toBe(false);
    expect(found.path).toBe(null);
  });

  // The boundary on the other side: a relative entry is never joined and
  // searched. `.` and `` are both on real PATHs, and a `codex` in whatever
  // folder the app happens to sit in is not the person's Codex.
  it('ignores a relative entry on PATH', () => {
    const found = findEngine('codex', {
      home: HOME,
      env: { PATH: `.:${path.join('', '')}:relative/bin` },
      exists: only('codex', './codex', 'relative/bin/codex'),
      shellLookup: saidNo,
      readdir: () => [],
    });
    expect(found.found).toBe(false);
  });

  // The order either side of the new step. The shell is still first: it is the
  // only source with their profile loaded, and it already resolves PATH itself.
  it('is below the shell answer', () => {
    const theirs = '/opt/volta/bin/codex';
    const found = findEngine('codex', {
      home: HOME,
      env: { PATH: ON_PATH },
      exists: only(theirs, path.join(ON_PATH, 'codex')),
      shellLookup: () => ({ path: theirs, answered: true }),
      readdir: () => [],
    });
    expect(found.path).toBe(theirs);
    expect(found.from).toBe('shell');
  });

  // And above the fixed list, which is the guess: a stale /usr/local/bin/codex
  // from an npm install nobody uses any more sits on that list, while the one
  // the app would actually run is the one on its PATH.
  it('is above the hand-written list', () => {
    const stale = '/usr/local/bin/codex';
    const real = path.join(ON_PATH, 'codex');
    const found = findEngine('codex', {
      home: HOME,
      env: { PATH: ON_PATH },
      exists: only(stale, real),
      shellLookup: saidNo,
      readdir: () => [],
    });
    expect(found.path).toBe(real);
    expect(found.from).toBe('path');
  });

  // A path somebody pointed at themselves is still never searched around.
  it('does not override a path they chose', () => {
    const chosen = '/opt/theirs/codex';
    const found = findEngine('codex', {
      configured: chosen,
      home: HOME,
      env: { PATH: ON_PATH },
      exists: only(chosen, path.join(ON_PATH, 'codex')),
      shellLookup: saidNo,
      readdir: () => [],
    });
    expect(found.path).toBe(chosen);
    expect(found.from).toBe('settings');
  });

  // `certain` is untouched: finding nothing on PATH is not the app being
  // entitled to say the tool is missing. That still rides on the shell having
  // answered and on there being no trace of the tool.
  it('leaves whether we may say it is missing alone', () => {
    const where = {
      home: HOME,
      env: { PATH: ON_PATH },
      exists: never,
      readdir: () => [],
      dangles: never,
    };
    expect(findEngine('codex', { ...where, shellLookup: saidNo }).certain).toBe(true);
    expect(findEngine('codex', { ...where, shellLookup: () => ({ path: null, answered: false }) }).certain).toBe(false);
  });

  // An app with no PATH at all is the double-clicked case the list exists for,
  // and it must not throw on the way there.
  it('falls through to the list when there is no PATH', () => {
    const listed = path.join(HOME, '.local/bin/codex');
    const found = findEngine('codex', {
      home: HOME,
      env: {},
      exists: only(listed),
      shellLookup: saidNo,
      readdir: () => [],
    });
    expect(found.path).toBe(listed);
    expect(found.from).toBe('disk');
  });
});
