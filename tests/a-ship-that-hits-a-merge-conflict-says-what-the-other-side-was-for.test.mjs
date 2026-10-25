// A SHIP THAT HITS A MERGE CONFLICT SAYS WHAT THE OTHER SIDE WAS FOR.
//
// When main/ship-queue.mjs ran the ship script and the merge of main
// conflicted, the thread got the script's words and nothing else: the
// conflicting files, but not what the work on main was for or which thread
// made it. Threads could not resolve it on their own, so the conflict went to
// the person to sort out. Measured by building a real conflict in a throwaway
// repository, running the real scripts/ship.mjs against it, and reading the
// reply: before this it named the files and no thread, no commit, no purpose.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ShipQueue, SHIP_LABEL } from '../main/ship-queue.mjs';

const SHIP_SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'ship.mjs');

let tmp; let base; let task; let userDir;
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } }).trim();
const write = (dir, file, text) => fs.writeFileSync(path.join(dir, file), text);

function startAnotherThread(id, file, text, subject) {
  git(base, 'checkout', '-q', '-b', `agentbox/${id}`, 'main');
  write(base, file, text);
  git(base, 'commit', '-q', '-am', subject);
  git(base, 'checkout', '-q', 'main');
}

// The way `npm run ship` lands a branch: main is merged into it if main moved,
// then main moves to the branch.
function shipAnotherThread(id) {
  git(base, 'checkout', '-q', `agentbox/${id}`);
  git(base, 'merge', '-q', '--no-ff', 'main', '-m', `Merge origin/main into agentbox/${id}`);
  git(base, 'checkout', '-q', 'main');
  git(base, 'merge', '-q', '--ff-only', `agentbox/${id}`);
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ship-conflict-'));
  userDir = path.join(tmp, 'user');
  fs.mkdirSync(userDir);
  git(tmp, 'init', '-q', '--bare', '-b', 'main', 'origin.git');
  base = path.join(tmp, 'base');
  git(tmp, 'init', '-q', '-b', 'main', 'base');
  git(base, 'config', 'user.email', 'test@example.com');
  git(base, 'config', 'user.name', 'Test');
  git(base, 'remote', 'add', 'origin', path.join(tmp, 'origin.git'));
  write(base, 'sidebar.css', 'width: 200px;\n');
  write(base, 'list.mjs', 'export const rows = 10;\n');
  write(base, 'readme.txt', 'hello\n');
  git(base, 'add', '.');
  git(base, 'commit', '-q', '-m', 'init');
  git(base, 'push', '-q', 'origin', 'main');

  // This thread's own change, in its own task folder.
  task = path.join(tmp, 'w-mine');
  git(base, 'worktree', 'add', '-q', '-b', 'agentbox/w-mine', task, 'main');
  write(task, 'sidebar.css', 'width: 240px;\n');
  write(task, 'list.mjs', 'export const rows = 20;\n');
  git(task, 'commit', '-q', '-am', 'Wider sidebar and more rows');

  // Meanwhile main moved: two threads touched the same files, one did not.
  startAnotherThread('w-narrow', 'sidebar.css', 'width: 160px;\n', 'Narrow the sidebar on small screens');
  startAnotherThread('w-unrelated', 'readme.txt', 'hello there\n', 'Say hello properly');
  shipAnotherThread('w-unrelated');
  shipAnotherThread('w-narrow');
  write(base, 'list.mjs', 'export const rows = 5;\n');
  git(base, 'commit', '-q', '-am', 'Fewer rows by hand');
  git(base, 'push', '-q', 'origin', 'main');
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const threads = {
  'w-narrow': { id: 'w-narrow', title: 'Sidebar crowds the phone', progress: 'Narrowed the sidebar to 160px below 600px wide.' },
  'w-unrelated': { id: 'w-unrelated', title: 'Readme greeting', progress: 'Changed the greeting.' },
};
const product = { slug: 'team', repoPath: base };
const item = { id: 'w-mine', product: 'team', labels: [SHIP_LABEL], updatedAt: 1 };

async function shipAndReadTheReply(run) {
  const handed = [];
  const store = {
    shipped: () => {},
    shipFailed: () => {},
    readItem: (slug, id) => (slug === 'team' ? threads[id] ?? null : null),
  };
  const q = new ShipQueue({ store, userDir, folderFor: () => task, isLive: () => false, handBack: (_, reply) => handed.push(reply), ...(run ? { run } : {}) });
  await q.ship({ item, product, script: SHIP_SCRIPT, cwd: task });
  expect(handed).toHaveLength(1);
  return handed[0];
}

describe('a ship that fails on a merge conflict', () => {
  it('names the files, the thread that changed them on main, what it was for, and its commit', async () => {
    const reply = await shipAndReadTheReply();
    expect(reply).toContain('CONFLICT');
    expect(reply).toContain('sidebar.css');
    expect(reply).toContain('list.mjs');
    expect(reply).toContain('Sidebar crowds the phone');
    expect(reply).toContain('w-narrow');
    expect(reply).toContain('Narrowed the sidebar to 160px below 600px wide.');
    expect(reply).toContain('Narrow the sidebar on small screens');
  });

  it('lists a commit no thread made by its own subject', async () => {
    const reply = await shipAndReadTheReply();
    expect(reply).toContain('Fewer rows by hand');
  });

  it('leaves out work on main that touched none of the conflicting files', async () => {
    const reply = await shipAndReadTheReply();
    expect(reply).not.toContain('Readme greeting');
    expect(reply).not.toContain('w-unrelated');
    expect(reply).not.toContain('Say hello properly');
  });

  it('tells the thread to keep both changes and when to ask the person', async () => {
    const reply = await shipAndReadTheReply();
    expect(reply).toContain('Resolve it keeping both changes where they fit. Only ask the person if the two changes want opposite things, and then say which you kept and why.');
  });

  it('names a thread the store no longer has by its id alone', async () => {
    delete threads['w-narrow'];
    try {
      const reply = await shipAndReadTheReply();
      expect(reply).toContain('w-narrow');
      expect(reply).toContain('Narrow the sidebar on small screens');
    } finally {
      threads['w-narrow'] = { id: 'w-narrow', title: 'Sidebar crowds the phone', progress: 'Narrowed the sidebar to 160px below 600px wide.' };
    }
  });
});

describe('a ship that fails for any other reason', () => {
  it('carries no conflict brief', async () => {
    const reply = await shipAndReadTheReply(async () => ({ code: 1, out: 'FAIL  tests/x.test.mjs > it works\nTests  1 failed | 3 passed (4)\n' }));
    expect(reply).toContain('FAIL  tests/x.test.mjs');
    expect(reply).not.toContain('Resolve it keeping both changes');
    expect(reply).not.toContain('Sidebar crowds the phone');
  });
});
