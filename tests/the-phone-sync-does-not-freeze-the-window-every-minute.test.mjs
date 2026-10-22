// THE PHONE'S SETTINGS PASS FROZE THE WINDOW ONCE A MINUTE (2026-10-22).
//
// The spinning wheel came up for 5 to 10 seconds in a thread while its
// pictures were loading. The app's own freeze log (memory-log/freeze-*.jsonl)
// had the window's thread held every 62 to 65 seconds from launch, every time
// in one line: the login shell `main/engine-bin.mjs` runs with execFileSync to
// find Claude Code and Codex. Usually 1 to 3 s; 6.5 s, 9.3 s and 6.5 s at
// 16:02, 16:03 and 16:04 while a stress test held memory at "tight". Pictures
// are answered on that same thread (protocol.handle in main/main.mjs), so they
// waited out each freeze.
//
// The caller was the phone link: it reads the Settings model every minute
// (SETTINGS_EVERY_MS in main/phone-inbox.mjs), the model looked both engines up
// again, and the shell answer is held for only thirty seconds, so every pass
// started two shells. The phone needs only whether each engine is here, which
// the app found at launch. So that read uses what is known, and the Settings
// screen, which a person opens, still looks again.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const shells = [];
vi.mock('node:child_process', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    // A login shell is answered here and never started: it says it ran and
    // found nothing, so a search that asks goes through every probe.
    execFileSync: (file, args, options) => {
      if (Array.isArray(args) && /^-l/.test(String(args[0]))) {
        shells.push({ file, args });
        return 'agentbox-shell-reached\n';
      }
      return actual.execFileSync(file, args, options);
    },
  };
});

const { readSettings } = await import('../main/settings.mjs');
const { forgetClaudeBin } = await import('../main/claude-bin.mjs');
const { forgetCodexBin } = await import('../main/codex-bin.mjs');

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const supervisor = {
  paused: false,
  sessions: new Map(),
  status: () => ({ capacity: 3, pausedProducts: [], accountTrouble: {} }),
  readStanding: () => '',
  readWritingRules: () => '',
  readFinishing: () => '',
  readProjectInstructions: () => '',
  projectSessionArgs: () => null,
  isDriven: () => false,
  engineChoices: () => [{ id: 'claude', label: 'Claude Code', word: 'Claude Code' }],
  engineFacts: () => ({ choices: [], workspace: 'claude', byItem: {} }),
  engineChoiceOpened: () => false,
  config: {},
  engineTrouble: () => null,
  _codexHome: () => '/nonexistent-codex-home',
  _codexProfiles: () => [],
};

// What main/config.mjs found at launch on a Mac with both engines.
const both = () => ({
  accountRoot: path.join(os.tmpdir(), 'no-store', 'accounts', 'a'), storeRoot: path.join(os.tmpdir(), 'no-store'),
  appDir: os.tmpdir(), maxConcurrentSessions: 3, sessionArgs: [], authProfiles: [],
  claudeBinConfigured: null, claudeBin: '/opt/found/claude', claudeFound: true, claudeCertain: true, claudeFrom: 'shell',
  codexBinConfigured: null, codexBin: '/opt/found/codex', codexFound: true, codexCertain: true, codexFrom: 'shell',
});

const settingsOf = (config, how) => readSettings({ config, supervisor, store: { listProducts: () => [] } }, how).workspace;

beforeEach(() => {
  shells.length = 0;
  // An answer held from an earlier read would hide whether this one asks.
  forgetClaudeBin();
  forgetCodexBin();
});

describe("the phone's read of the settings", () => {
  it('starts no login shell, with nothing held from an earlier search', () => {
    settingsOf(both(), { search: false });
    expect(shells).toEqual([]);
  });

  it('still says both engines are here, from what launch found', () => {
    const w = settingsOf(both(), { search: false });
    expect(w.claudeFound).toBe(true);
    expect(w.claudeBin).toBe('/opt/found/claude');
    expect(w.codexFound).toBe(true);
    expect(w.codex.found).toBe(true);
    expect(w.codex.bin).toBe('/opt/found/codex');
  });

  it('says Codex is not here on a Mac where launch did not find it', () => {
    const w = settingsOf({ ...both(), codexBin: null, codexFound: false, codexFrom: null }, { search: false });
    expect(w.codexFound).toBe(false);
    expect(w.codex.found).toBe(false);
    expect(w.codex.bin).toBe('');
    expect(shells).toEqual([]);
  });

  it('follows a "Check again" that found Codex after launch', () => {
    // recheckCodex moves codexBin and leaves codexFound as launch left it.
    const w = settingsOf({ ...both(), codexFound: false, codexFrom: null }, { search: false });
    expect(w.codex.found).toBe(true);
    expect(w.codexFound).toBe(true);
  });

  it('keeps a path somebody chose as chosen', () => {
    const w = settingsOf({ ...both(), claudeBinConfigured: '/opt/found/claude', claudeFrom: 'settings' }, { search: false });
    expect(w.claudeChosen).toBe(true);
    expect(w.codex.chosen).toBe(false);
  });
});

describe('the Settings screen a person opens', () => {
  it('still looks again, so an engine installed since launch turns found', () => {
    settingsOf(both());
    expect(shells.length).toBeGreaterThan(0);
  });
});

describe('the wiring', () => {
  it('the phone asks the settings channel not to search', () => {
    expect(read('main/main.mjs')).toMatch(/phoneChannels\.get\('zero:settings-read'\)\?\.\(\{ sender: null \}, \{ search: false \}\)/);
  });

  it('the settings channel hands that on', () => {
    const ipc = read('main/ipc.mjs');
    const handler = ipc.slice(ipc.indexOf("ipcMain.handle('zero:settings-read'"), ipc.indexOf("ipcMain.handle('zero:settings-read'") + 400);
    expect(handler).toMatch(/readSettings\(\{ config, supervisor, store \}, \{ search: how\?\.search !== false \}\)/);
  });
});
