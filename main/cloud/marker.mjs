// "A CLOUD RUN'S WORK IS STILL ON ITS WAY BACK TO THIS FOLDER."
//
// A cloud run (docs/cloud/PLAN.md) commits in the sandbox, and the commits
// reach the task folder only when the run is over. Until then the folder's
// branch is stale, and two things in the app would act on it as if it were
// not: the ship queue (a worker adds `ship` BEFORE it exits, and "there is
// nothing to ship" counts as shipped) and the folder cleaner (a clean, merged
// folder is removed). This record is what both of them check.
//
// It lives in the folder's own git directory, not in the working tree, so no
// commit, park or `git clean` can carry it off or delete it, and it names the
// run, so a later run in the same folder can bring that run's work home first.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const NAME = 'agentbox-cloud.json';

export function gitDirOf(folder) {
  try {
    return execFileSync('git', ['rev-parse', '--absolute-git-dir'], { cwd: folder, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

export function markerPath(folder) {
  const dir = gitDirOf(folder);
  return dir ? path.join(dir, NAME) : null;
}

export function readMarker(folder) {
  const file = markerPath(folder);
  if (!file) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

export function writeMarker(folder, record) {
  const file = markerPath(folder);
  if (!file) throw new Error(`${folder} is not a git folder`);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ ...record, at: Date.now() }, null, 2));
  fs.renameSync(tmp, file);
}

export function clearMarker(folder) {
  const file = markerPath(folder);
  if (file) fs.rmSync(file, { force: true });
}

// The one question the ship queue and the folder cleaner ask. A folder that
// is not there, or not a git folder, has nothing pending.
export function cloudWorkPending(folder) {
  if (!folder || !fs.existsSync(folder)) return false;
  return !!readMarker(folder);
}

// WHAT A RUN BROUGHT HOME THAT ITS ROW MUST SAY (main/cloud/run.mjs `park`):
// written by the relay, which cannot reach the store, and said by the
// supervisor (`_sayCloudNews`). Beside the marker, and outliving it.
const NEWS = 'agentbox-cloud-news.json';
const newsPath = (folder) => { const dir = gitDirOf(folder); return dir ? path.join(dir, NEWS) : null; };

export function addCloudNews(folder, news) {
  const file = newsPath(folder);
  if (!file) return;
  let all = [];
  try { all = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* none yet */ }
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify([...(Array.isArray(all) ? all : []), { ...news, at: Date.now() }], null, 2));
  fs.renameSync(tmp, file);
}

export function takeCloudNews(folder) {
  const file = folder && fs.existsSync(folder) ? newsPath(folder) : null;
  if (!file || !fs.existsSync(file)) return [];
  let all = [];
  try { all = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* unreadable: dropped */ }
  fs.rmSync(file, { force: true });
  return Array.isArray(all) ? all : [];
}
