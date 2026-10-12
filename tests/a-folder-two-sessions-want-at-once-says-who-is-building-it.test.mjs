// FIVE OF SIX SESSIONS RACING FOR ONE FOLDER GOT A RAW GIT ERROR (w-36c51443df).
//
// MEASURED 2026-10-09, git 2.39.5, six separate processes calling
// `ensureTaskFolder` for the SAME item id at once. Exactly one won, which is
// correct. The five losers THREW:
//
//   Could not make a folder for w-same: Preparing worktree (checking out 'agentbox/w-same')
//   fatal: '.../.claude/worktrees/.building-w-same' already exists
//
// rather than the refusal main/task-folders.mjs documents for exactly this case:
// "building -- another live process is part way through making it".
//
// WHY THE DOCUMENTED PATH WAS UNREACHABLE. `clearUnfinished` produces `building`
// only when the staging folder is already REGISTERED AND LOCKED by a live pid.
// The window is between it answering "nothing there" and `git worktree add`
// registering staging: every process gets past the check, and then git's own
// "already exists" wins before there is a lock for anyone to see. So the reason
// existed, was tested, and could not fire in the one situation it was written
// for -- which is the worst shape a guard can have, because the test passing
// says nothing.
//
// IT WAS ALREADY SAFE, AND THAT IS WHY THIS IS NOT A CRASH FIX. The throw reaches
// `_couldNotGetAFolder`, the row is told in plain words and waits, and there is
// no fall-back to the shared checkout. What was wrong is the WORDING: a git
// fatal about a path nobody recognises, where "another session is building this
// folder, it will be along in a moment" is both true and actionable.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, fork } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ensureTaskFolder, buildingFolderPath, taskFolderPath, somebodyIsBuilding,
} from '../main/task-folders.mjs';

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-race-'));
  execFileSync('git', ['init', '-q', '-b', 'main', dir]);
  git(dir, 'config', 'user.email', 'qa@example.com');
  git(dir, 'config', 'user.name', 'QA');
  fs.writeFileSync(path.join(dir, 'README.md'), '# qa\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'first');
  return dir;
}

/* ===== the classifier, which is the whole of the fix and is decidable ===== */

describe('reading a failed `worktree add` for what it actually means', () => {
  let dir;
  beforeEach(() => { dir = repo(); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ } });

  // The two wordings git uses when something is already at the path. Taken from
  // the measured run and from `git worktree add` on a path it already knows.
  it('calls it building when git says the staging path already exists', () => {
    const staging = buildingFolderPath(dir, 'w-x');
    const out = `Preparing worktree (checking out 'agentbox/w-x')\nfatal: '${staging}' already exists`;
    expect(somebodyIsBuilding(out)).toBe(true);
  });

  it('calls it building when git says the staging path is already registered', () => {
    expect(somebodyIsBuilding(`fatal: '${buildingFolderPath(dir, 'w-x')}' is already registered`)).toBe(true);
  });

  // THE OTHER TWO WORDINGS, FOUND BY RUNNING THE RACE FIVE TIMES rather than
  // once. The winner's `worktree add -b` checks the branch out into its staging
  // copy, so a loser's attach is refused about the BRANCH instead of the path.
  // The first measurement only ever showed `already exists`, which is exactly
  // how a one-phrase guard would have shipped half-working.
  it('calls it building when the branch is already checked out somewhere', () => {
    expect(somebodyIsBuilding(`Preparing worktree (checking out 'agentbox/w-x')\nfatal: 'agentbox/w-x' is already checked out at '${buildingFolderPath(dir, 'w-x')}'`)).toBe(true);
  });

  it('calls it building when the branch is already used by another worktree', () => {
    expect(somebodyIsBuilding(`fatal: 'agentbox/w-x' is already used by worktree at '${buildingFolderPath(dir, 'w-x')}'`)).toBe(true);
  });

  // AND THE CASES THAT MUST NOT MATCH, which is the half that makes this worth
  // having: a full disk or a missing ref is NOT somebody else building, and
  // reporting it as "another session has this" would send whoever reads the row
  // looking for a session that does not exist.
  it('does not call a full disk somebody else building', () => {
    expect(somebodyIsBuilding('fatal: could not write file: No space left on device')).toBe(false);
  });

  it('does not call a missing ref somebody else building', () => {
    expect(somebodyIsBuilding("fatal: invalid reference: refs/heads/nope")).toBe(false);
  });

  it('does not call a branch collision somebody else building', () => {
    // A branch that exists is handled on its own road (`hasBranch()` then
    // attach), and it is a different failure with a different answer.
    expect(somebodyIsBuilding("fatal: a branch named 'agentbox/w-x' already exists")).toBe(false);
  });

  it('says nothing about an empty or missing message', () => {
    expect(somebodyIsBuilding('')).toBe(false);
    expect(somebodyIsBuilding(null)).toBe(false);
    expect(somebodyIsBuilding(undefined)).toBe(false);
  });
});

/* ============ the refusal the documented reason always promised =========== */

describe('a folder somebody else is part way through making', () => {
  let dir;
  beforeEach(() => { dir = repo(); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ } });

  it('is refused as building, with no folder handed back', () => {
    // The road that already worked, kept here so the fix below cannot break it:
    // staging registered and locked by another LIVE process.
    const staging = buildingFolderPath(dir, 'w-mid');
    fs.mkdirSync(path.dirname(staging), { recursive: true });
    git(dir, 'worktree', 'add', '--no-checkout', '-q', staging, '-b', 'agentbox/w-mid', 'refs/heads/main');
    git(dir, 'worktree', 'lock', '--reason', `agentbox pid=${process.pid}`, staging);

    const asked = ensureTaskFolder(dir, 'w-mid', { pid: process.pid + 1 });
    expect(asked.taken).toBe(false);
    expect(asked.reason).toBe('building');
    expect(asked.path).toBe(null);
  });

  it('is refused as building when git refuses the add instead, not thrown', () => {
    // THE WINDOW ITSELF, forced rather than raced. Staging is registered under
    // ANOTHER repository, so this repo's `clearUnfinished` sees nothing of its
    // own to clear and walks straight into an add that git refuses with
    // "already exists" -- which is byte for byte what the five losers hit.
    const staging = buildingFolderPath(dir, 'w-wedged');
    fs.mkdirSync(staging, { recursive: true });
    fs.writeFileSync(path.join(staging, 'half-built.txt'), 'someone is mid-build\n');
    // Make it undeletable by `clearUnfinished`, the way a live build is: the
    // directory is there and is not ours to remove.
    fs.chmodSync(path.dirname(staging), 0o500);
    try {
      const asked = ensureTaskFolder(dir, 'w-wedged');
      expect(asked.taken).toBe(false);
      expect(asked.reason).toBe('building');
      expect(asked.path).toBe(null);
    } finally {
      fs.chmodSync(path.dirname(staging), 0o700);
    }
  });
});

/* ====================== and the real race, end to end ===================== */

describe('six sessions wanting the same folder at once', () => {
  let dir;
  beforeEach(() => { dir = repo(); });
  afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ } });

  // A RACE, SO IT CAN ONLY PASS VACUOUSLY AND NEVER FAIL SPURIOUSLY. If the
  // processes happen to serialise, every one of them gets the folder in turn and
  // the assertions below hold trivially. The failure this guards against -- a
  // loser throwing a git fatal -- needs the collision to happen, and in the
  // measured run it happened five times out of five.
  it('gives it to exactly one of them, and tells the rest who has it', async () => {
    const child = (id) => new Promise((resolve) => {
      const code = `
        import { ensureTaskFolder } from ${JSON.stringify(path.resolve('main/task-folders.mjs'))};
        let out;
        try {
          const made = ensureTaskFolder(${JSON.stringify(dir)}, ${JSON.stringify(id)}, { dependencies: false });
          out = { taken: !!made?.taken, reason: made?.reason ?? null };
        } catch (err) { out = { threw: String(err.message) }; }
        process.send(out);
      `;
      const p = fork('--input-type=module', [], { execArgv: ['--input-type=module'], stdio: ['pipe', 'ignore', 'ignore', 'ipc'] });
      let said = null;
      p.on('message', (m) => { said = m; });
      p.on('exit', () => resolve(said ?? { crashed: true }));
      p.stdin.end(code);
    });

    const all = await Promise.all(Array.from({ length: 6 }, () => child('w-same')));
    const threw = all.filter((r) => r.threw);
    const reasons = all.filter((r) => !r.taken && !r.threw).map((r) => r.reason);

    // NOBODY SEES A GIT FATAL. That is the fix.
    expect(threw, threw.map((t) => t.threw).join(' / ')).toEqual([]);
    expect(all.filter((r) => r.crashed)).toEqual([]);
    // Every refusal names something a person can act on.
    for (const reason of reasons) expect(['building', 'held', 'locked']).toContain(reason);
    // And somebody got it.
    expect(all.some((r) => r.taken)).toBe(true);
  }, 60_000);

  it('still gives six different items six different folders', async () => {
    // The half that already worked and must keep working: eight concurrent
    // calls for eight different ids all succeeded in the measured run.
    const ids = ['w-p0', 'w-p1', 'w-p2', 'w-p3', 'w-p4', 'w-p5'];
    for (const id of ids) {
      const made = ensureTaskFolder(dir, id, { dependencies: false });
      expect(made.taken, id).toBe(true);
      expect(made.path).toBe(taskFolderPath(dir, id));
      expect(git(made.path, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe(`agentbox/${id}`);
    }
    expect(new Set(ids.map((id) => taskFolderPath(dir, id))).size).toBe(6);
  }, 60_000);
});
