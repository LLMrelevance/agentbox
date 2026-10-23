// NEO STAYS OFF ONCE ITS SWITCH IS OFF (w-09835f4874, 2026-10-22).
//
// What broke: Neo's switch in Settings, Alpha features, read off, and tapping
// ⌘ twice still woke it. The gate turned Neo on when the switch was on OR when
// a hand-made `neo-alpha` file sat in the app's data folder, while Settings
// drew the switch from the setting alone, so a Mac that had the file from
// before the switch existed showed off and ran Neo. Turning the switch off also
// changed nothing until a restart.
//
// Measured here: the gate with the file present and the switch off or never
// touched; that Settings and the gate agree for every value of the setting;
// and a running Neo handed a double tap after the switch is saved off through
// the real setWorkspaceSetting.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { neoEnabled } from '../main/neo/gate.mjs';
import { createNeo } from '../main/neo/index.mjs';
import { alphaFeatures, setWorkspaceSetting } from '../main/settings.mjs';

const fileThere = (p) => p === path.join('/data', 'neo-alpha');
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('the switch is the one thing that turns Neo on', () => {
  it('is off with the switch off, even with the old file in the data folder', () => {
    expect(neoEnabled({ userData: '/data', platform: 'darwin', exists: fileThere, config: { alphaNeo: false } })).toBe(false);
  });
  it('is off with the old file and a switch nobody has touched', () => {
    expect(neoEnabled({ userData: '/data', platform: 'darwin', exists: fileThere, config: {} })).toBe(false);
    expect(neoEnabled({ userData: '/data', platform: 'darwin', exists: fileThere })).toBe(false);
  });
  it('is on with the switch on, with or without the file', () => {
    expect(neoEnabled({ platform: 'darwin', config: { alphaNeo: true } })).toBe(true);
    expect(neoEnabled({ userData: '/data', platform: 'darwin', exists: fileThere, config: { alphaNeo: true } })).toBe(true);
  });
  it('Settings draws the switch the way the gate decides', () => {
    for (const config of [null, {}, { alphaNeo: true }, { alphaNeo: false }, { alphaNeo: 'yes' }]) {
      expect(alphaFeatures(config).neo, JSON.stringify(config)).toBe(neoEnabled({ userData: '/data', platform: 'darwin', exists: fileThere, config }));
    }
  });
});

function runningNeo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-switch-'));
  const config = { appDir: dir, alphaNeo: true };
  const userData = path.join(dir, 'data');
  fs.mkdirSync(userData);
  fs.writeFileSync(path.join(userData, 'neo-alpha'), '');
  let onWake = null;
  let windows = 0;
  let finishLoad = () => {};
  const neoSent = [];
  const neoContents = { send: (ch, p) => neoSent.push([ch, p]), once: (ev, fn) => { if (ev === 'did-finish-load') finishLoad = fn; } };
  class BrowserWindow {
    constructor() { windows++; this.webContents = neoContents; }
    setAlwaysOnTop() {} setVisibleOnAllWorkspaces() {} setIgnoreMouseEvents() {}
    setBounds(b) { this.bounds = { ...b }; } getBounds() { return { ...this.bounds }; }
    on() {} showInactive() {} hide() {} moveTop() {} isDestroyed() { return false; }
  }
  const neo = createNeo({
    app: { on() {} }, BrowserWindow, ipcMain: { handle() {}, on() {} },
    screen: { getCursorScreenPoint: () => ({ x: 0, y: 0 }), getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) },
    powerMonitor: { on() {} },
    systemPreferences: { getMediaAccessStatus: () => 'granted', askForMediaAccess: async () => true },
    owner: { id: 'com.apple.Terminal', name: 'Terminal' },
    session: { fromPartition: () => ({ setPermissionRequestHandler() {}, setPermissionCheckHandler() {} }) },
    globalShortcut: { register: () => true, unregister() {} },
    mainWindow: { isDestroyed: () => false, isFocused: () => true, getContentBounds: () => ({ x: 0, y: 0, width: 1920, height: 1080 }), on() {}, webContents: { send() {} } },
    preload: '/x', load: () => {}, userData, config, platform: 'darwin',
    listen: (o) => { onWake = o.onWake; return { stop() {} }; },
  });
  const switchOff = () => setWorkspaceSetting({ config, supervisor: { onChange() {} }, store: {} }, { key: 'alphaNeo', value: false });
  const tap = async () => { onWake(); await tick(); finishLoad(); await tick(); };
  return { neo, switchOff, tap, windows: () => windows, neoSent, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

describe('switching Neo off while the app is running', () => {
  it('a double tap after the switch goes off wakes nothing', async () => {
    const n = runningNeo();
    expect(n.neo.enabled).toBe(true);
    n.switchOff();
    await n.tap();
    expect(n.windows()).toBe(0);
    expect(n.neoSent.some(([ch]) => ch === 'neo:wake')).toBe(false);
    n.done();
  });

  it('with the switch still on, the same tap wakes it', async () => {
    const n = runningNeo();
    await n.tap();
    expect(n.windows()).toBe(1);
    expect(n.neoSent.some(([ch]) => ch === 'neo:wake')).toBe(true);
    n.done();
  });

  it('a tap during a conversation still puts Neo to sleep after the switch goes off', async () => {
    const n = runningNeo();
    await n.tap();
    n.switchOff();
    await n.tap();
    expect(n.neoSent.filter(([ch]) => ch === 'neo:sleep')).toEqual([['neo:sleep', { reason: 'tapped' }]]);
    n.done();
  });
});
