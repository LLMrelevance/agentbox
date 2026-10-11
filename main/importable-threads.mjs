// WHAT THE IMPORT CARD IS HANDED, in one function, so the read setup's last
// card depends on can be tested whole rather than through a copy of it
// (w-e46f2e9cea, 2026-10-11: "confirm this works during onboarding, that's the
// critical location"). `zero:agent-threads` in main/ipc.mjs is this and the
// `imported` marks; the walk's finish card and the ⌘K card both read it.
//
// Every folder either tool keeps sessions in (main/agent-homes.mjs), both
// readers, newest first. A reader that throws costs its own half, never the
// other one.

import os from 'node:os';
import { appSessionFolders } from './agent-homes.mjs';
import { readSessionThreads } from './agent-sessions.mjs';
import { readCodexThreads } from './codex-threads.mjs';

export function readImportableThreads({ config = null, supervisor = null, env = process.env, home = os.homedir(), now = Date.now() } = {}) {
  let claude = [];
  let codex = [];
  const { dirs, codexDirs } = appSessionFolders({ config, supervisor, env, home });
  try { ({ threads: claude } = readSessionThreads({ home, dirs, now })); } catch { claude = []; }
  try { ({ threads: codex } = readCodexThreads({ home, codexDirs, now })); } catch { codex = []; }
  return [...claude, ...codex].sort((a, b) => (b.when ?? 0) - (a.when ?? 0));
}
