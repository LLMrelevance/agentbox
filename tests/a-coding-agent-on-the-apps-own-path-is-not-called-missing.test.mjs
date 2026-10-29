// "NO CODING AGENT FOUND" ON A MACHINE WHOSE PATH HELD CODEX (F-140).
//
// The README's own desktop path is `git clone && npm install && npm start`,
// so the app is started FROM A TERMINAL and inherits that terminal's PATH. On
// the Linux QA box 2026-10-28 that PATH had `/home/box/.local/bin/codex` on it
// and the first screen still said NO CODING AGENT FOUND, with Install Codex
// under it. Three fresh homes out of three.
//
// WHY THE SEARCH MISSED IT. The shell probe goes first and it is a LOGIN
// shell, and measured here on Debian 13 with the real /bin/bash:
//
//   PATH=/tmp/fakehome/bin:$PATH HOME=/tmp/fakehome bash -lic 'echo $PATH'
//   /usr/local/bin:/usr/bin:/bin:/usr/local/games:/usr/games
//
// /etc/profile sets PATH outright, so the login shell throws away the PATH the
// app was started with and `command -v codex` honestly says no. The fixed list
// is searched under the app's HOME, and the QA box's fresh HOME has no
// ~/.local/bin. Nothing in the search ever looked at the app's own PATH, which
// is where the tool was all along.
//
// So the app's own PATH is searched too, after the list and before the desktop
// apps' copies: nothing that was found before is found anywhere else now, and
// a tool that is plainly on the PATH we were handed is no longer missing.
//
// It is not in `searched`, which is the fixed list and is read as such.
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { findEngine, pathDirs } from '../main/engine-bin.mjs';
import { findCodexBin } from '../main/codex-bin.mjs';

const HOME = '/tmp/agentbox-fresh-user/readme-2301';
const only = (...paths) => (p) => paths.includes(p);
const never = () => false;
const noShell = () => ({ path: null, answered: true });
const silent = () => ({ path: null, answered: false });

describe('the PATH the app was started with', () => {
  // The reported machine, with its real numbers.
  it('finds a Codex the login shell could not see', () => {
    const out = findCodexBin({
      home: HOME,
      env: { PATH: '/home/box/.local/bin:/usr/local/bin:/usr/bin:/bin' },
      exists: only('/home/box/.local/bin/codex'),
      shellLookup: noShell,
    });
    expect(out).toMatchObject({ path: '/home/box/.local/bin/codex', found: true, certain: true, from: 'path' });
  });

  it.each(['claude', 'codex'])('does it for %s, since one search serves both', (key) => {
    const out = findEngine(key, {
      home: HOME,
      env: { PATH: `/opt/tools/bin:/usr/bin` },
      exists: only(`/opt/tools/bin/${key}`),
      shellLookup: noShell,
    });
    expect(out).toMatchObject({ path: `/opt/tools/bin/${key}`, found: true, from: 'path' });
  });

  // The order either side of the new step, because it must take nothing away.
  it('still lets the shell answer first', () => {
    const out = findEngine('codex', {
      home: HOME,
      env: { PATH: '/home/box/.local/bin' },
      exists: only('/home/box/.local/bin/codex', '/opt/homebrew/bin/codex'),
      shellLookup: () => ({ path: '/opt/homebrew/bin/codex', answered: true }),
    });
    expect(out).toMatchObject({ path: '/opt/homebrew/bin/codex', from: 'shell' });
  });

  it('still lets the fixed list answer before the PATH', () => {
    const out = findEngine('codex', {
      home: HOME,
      env: { PATH: '/home/box/.local/bin' },
      exists: only('/home/box/.local/bin/codex', '/usr/local/bin/codex'),
      shellLookup: noShell,
    });
    expect(out).toMatchObject({ path: '/usr/local/bin/codex', from: 'disk' });
  });

  // What must NOT match. A PATH entry is a directory name from an environment
  // we did not write: an empty one means the current directory to a shell, and
  // a relative one would pick up whatever `codex` the folder we happen to be
  // standing in holds.
  it('ignores an empty or relative entry, so nothing is run out of the current folder', () => {
    expect(pathDirs({ PATH: '/opt/bin::.:bin:/usr/bin' })).toEqual(['/opt/bin', '/usr/bin']);
    expect(pathDirs({})).toEqual([]);
    expect(pathDirs({ PATH: '' })).toEqual([]);
    const out = findEngine('codex', {
      home: HOME, env: { PATH: '.:node_modules/.bin' }, exists: () => true, shellLookup: noShell,
    });
    expect(out.from).not.toBe('path');
  });

  it('says nothing is there when the PATH holds no such file', () => {
    const out = findEngine('codex', {
      home: HOME,
      env: { PATH: '/home/box/.local/bin:/usr/bin' },
      exists: never,
      shellLookup: noShell,
    });
    expect(out).toMatchObject({ path: null, found: false, certain: true, from: null });
  });

  // A shell that said nothing is still not an absence, and a PATH that holds
  // nothing does not turn it into one.
  it('is still not certain when no shell answered and the PATH was empty', () => {
    const out = findEngine('codex', { home: HOME, env: { PATH: '/usr/bin' }, exists: never, shellLookup: silent });
    expect(out).toMatchObject({ found: false, certain: false });
  });

  // `searched` is the list this home is searched under, and stays that: it is
  // the same list on every machine, while the PATH is whatever this run was
  // handed, and two tests read it as "the places we guess at".
  it('leaves the list of places it guesses at alone', () => {
    const out = findEngine('codex', {
      home: HOME, env: { PATH: '/home/box/.local/bin:/usr/bin' }, exists: never, shellLookup: noShell,
    });
    expect(out.searched).toContain(path.join(HOME, '.local/bin/codex'));
    expect(out.searched).not.toContain('/home/box/.local/bin/codex');
  });
});
