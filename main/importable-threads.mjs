// WHAT THE IMPORT CARD IS HANDED, in one function, so the read setup's last
// card depends on can be tested whole rather than through a copy of it
// (w-e46f2e9cea, 2026-10-11: "confirm this works during onboarding, that's the
// critical location"). `zero:agent-threads` in main/ipc.mjs is this and the
// `imported` marks; the walk's finish card and the ⌘K card both read it.
//
// Every folder either tool keeps sessions in (main/agent-homes.mjs), both
// readers, newest first. A reader that throws costs its own half, never the
// other one.
//
// AND WHEN THE LAST TEN DAYS HOLD NOTHING, THE NEWEST OLDER ONES. Setup skips
// its last card when it has nothing to offer, so somebody whose newest session
// was eleven days old was never told importing exists. The ten days stay the
// list whenever they hold anything; only an empty one reaches back, ninety days
// at most and the twenty newest, and the card says so (`listLine` in
// renderer/src/agent-import-card.ts).

import os from 'node:os';
import { appSessionFolders } from './agent-homes.mjs';
import { RECENT_DAYS, readSessionThreads } from './agent-sessions.mjs';
import { readCodexThreads } from './codex-threads.mjs';

export const OLDER_DAYS = 90;
export const OLDER_MOST = 20;

export function readImportableThreads({ config = null, supervisor = null, env = process.env, shellEnv, home = os.homedir(), now = Date.now() } = {}) {
  const { dirs, codexDirs } = appSessionFolders({ config, supervisor, env, home, ...(shellEnv ? { shellEnv } : {}) });
  const read = (days, max) => {
    let claude = [];
    let codex = [];
    try { ({ threads: claude } = readSessionThreads({ home, dirs, now, days, ...(max ? { max } : {}) })); } catch { claude = []; }
    try { ({ threads: codex } = readCodexThreads({ home, codexDirs, now, days })); } catch { codex = []; }
    return [...claude, ...codex].sort((a, b) => (b.when ?? 0) - (a.when ?? 0));
  };
  const recent = read(RECENT_DAYS);
  if (recent.length) return recent;
  return read(OLDER_DAYS, OLDER_MOST).slice(0, OLDER_MOST);
}

/* ------------------------ AND THE ONE THE SEARCH USES ---------------------- */
// THE CARD'S LIST IS TEN DAYS. THE NAME FIELD IS NOT (w-6418318cd5, from
// GitHub #31). A chat you had in July could not be brought in at all, so a
// field that only searched the same ten days would be decoration.
//
// IT IS A SECOND READ, NOT A WIDER FIRST ONE. The ten-day list is what the
// card draws the moment it opens and it has to be quick; this one is taken
// once, lazily, the first time somebody types, and the window keeps it (see
// `zero:search-agent-threads` in main/ipc.mjs) so every keystroke after that
// is a filter rather than a disk walk.
//
// AND IT CANNOT PROMISE EVERYTHING. A chat's name lives inside its transcript,
// and the Mac this was written on holds 29,703 of them. So it goes newest
// first until the cap or the budget stops it and reports `reached`, the moment
// it gave up at, which the card prints. Eight seconds rather than three: this
// is the read somebody is waiting on, watching a spinner, having already typed
// the word they want.

export const SEARCH_DAYS = 365;
const SEARCH_MOST = 6000;
const SEARCH_BUDGET_MS = 8000;

export function readSearchableThreads({
  config = null, supervisor = null, env = process.env, shellEnv, home = os.homedir(), now = Date.now(),
  days = SEARCH_DAYS, max = SEARCH_MOST, budgetMs = SEARCH_BUDGET_MS,
} = {}) {
  const { dirs, codexDirs } = appSessionFolders({ config, supervisor, env, home, ...(shellEnv ? { shellEnv } : {}) });
  let claude = [];
  let codex = [];
  let reached = 0;
  try {
    ({ threads: claude, reached } = readSessionThreads({ home, dirs, now, days, max, budgetMs }));
  } catch { claude = []; }
  // Codex keeps its names in an index of its own (main/codex-threads.mjs), so
  // its side costs no transcript reads and never gives up early. Only the
  // Claude side can run out of budget, which is why `reached` comes off it.
  try { ({ threads: codex } = readCodexThreads({ home, codexDirs, now, days })); } catch { codex = []; }
  const threads = [...claude, ...codex].sort((a, b) => (b.when ?? 0) - (a.when ?? 0));
  return { threads, reached };
}
