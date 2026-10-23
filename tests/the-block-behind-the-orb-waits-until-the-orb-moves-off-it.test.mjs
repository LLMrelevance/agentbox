// REACHING FOR THE ORB BROUGHT BACK THE THING THE ORB WAS COVERING
// (w-5520063011).
//
// Their words, against the Neo that shipped on 2026-10-16: "when i hover over
// the orb it actually just brings back the background in bottom right. how
// about we just only bring that back when orb is moved out of that area, so it
// can detect when i'm actually hovering over it. and make sure its ontop in
// terms of detection."
//
// The summary's Status, Priority, Owner and Project block fades while Neo is
// on, because the orb sits on top of it. It came back on `.ts-panel:hover` —
// and the orb rests in the bottom-right corner of that very panel, so the
// pointer could not reach the orb without crossing the panel first and
// bringing the whole block back underneath it. Hover was the wrong question.
// The right one is where the orb is: the block waits while the orb covers it
// and comes back the moment the orb is dragged off.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNeo } from '../main/neo/index.mjs';
import { orbCovers } from '../renderer/src/neo/orb-cover.ts';

const root = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
const styles = fs.readFileSync(path.join(root, 'renderer/src/styles.css'), 'utf8');

// The block in the corner, as the app draws it: bottom right of the panel.
const FOOT = { left: 1500, top: 880, right: 1800, bottom: 1000 };

describe('whether the orb is over the block', () => {
  it('is over it when it sits on top of it', () => {
    expect(orbCovers({ x: 1650, y: 940, r: 75 }, FOOT)).toBe(true);
  });

  it('is over it when only its edge reaches in', () => {
    expect(orbCovers({ x: 1500 - 74, y: 940, r: 75 }, FOOT)).toBe(true);
  });

  it('is clear of it one pixel further out', () => {
    expect(orbCovers({ x: 1500 - 76, y: 940, r: 75 }, FOOT)).toBe(false);
  });

  // A box test would call a corner covered that the round orb does not reach.
  it('is clear of a corner it does not actually reach', () => {
    expect(orbCovers({ x: 1500 - 60, y: 880 - 60, r: 75 }, FOOT)).toBe(false);
    expect(orbCovers({ x: 1500 - 40, y: 880 - 40, r: 75 }, FOOT)).toBe(true);
  });

  it('is clear of it when dragged across the screen', () => {
    expect(orbCovers({ x: 200, y: 300, r: 75 }, FOOT)).toBe(false);
  });

  it('answers false rather than throwing when there is no block or no orb', () => {
    expect(orbCovers(null, FOOT)).toBe(false);
    expect(orbCovers({ x: 1650, y: 940, r: 75 }, null)).toBe(false);
  });
});

describe('the rule the app draws it by', () => {
  it('no longer brings the block back on hovering the panel', () => {
    expect(styles).not.toMatch(/body\.neo-on \.ts-panel:hover/);
  });

  it('brings it back when the orb is away instead', () => {
    expect(styles).toMatch(/body\.neo-on\.neo-orb-away[^{]*\.ts-foot\s*{[^}]*opacity:\s*1/);
  });
});

// Fake Electron parts, as the other main-process Neo tests use.
const AREA = { x: 0, y: 0, width: 1920, height: 1080 };

function fakes({ userData = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-cover-')) } = {}) {
  const handlers = new Map();
  const listeners = new Map();
  const ipcMain = { handle: (ch, fn) => handlers.set(ch, fn), on: (ch, fn) => listeners.set(ch, fn) };
  let finishLoad;
  const neoContents = { send: () => {}, once: (ev, fn) => { if (ev === 'did-finish-load') finishLoad = fn; } };
  const levels = [];
  const tops = [];
  let bounds = { x: 0, y: 0, width: 600, height: 240 };
  class BrowserWindow {
    constructor() { this.webContents = neoContents; }
    setAlwaysOnTop(_on, level) { if (level) levels.push(level); }
    setVisibleOnAllWorkspaces() {} setIgnoreMouseEvents() {}
    setBounds(b) { bounds = { ...bounds, ...b }; }
    getBounds() { return bounds; }
    moveTop() { tops.push(true); }
    on() {} showInactive() {} hide() {} isDestroyed() { return false; }
  }
  const toApp = [];
  const appAt = { x: 100, y: 50 };
  const appEvents = new Map();
  const mainWindow = {
    isDestroyed: () => false, isFocused: () => true,
    getContentBounds: () => ({ ...appAt, width: 1800, height: 1000 }),
    on: (ev, fn) => appEvents.set(ev, fn),
    webContents: { send: (ch, p) => toApp.push([ch, p]) },
  };
  const neo = createNeo({
    app: { on() {} }, BrowserWindow, ipcMain,
    screen: { getCursorScreenPoint: () => ({ x: 1800, y: 1000 }), getDisplayNearestPoint: () => ({ workArea: AREA }) },
    powerMonitor: { on() {} },
    systemPreferences: { getMediaAccessStatus: () => 'granted', askForMediaAccess: async () => true },
    owner: { id: 'x', name: 'Terminal' },
    session: { fromPartition: () => ({ setPermissionRequestHandler() {}, setPermissionCheckHandler() {} }) },
    globalShortcut: { register: () => true, unregister() {} },
    mainWindow, preload: '/x', load: () => {}, userData, config: { alphaNeo: true },
    listen: () => ({ stop() {} }), platform: 'darwin',
  });
  const from = { sender: neoContents };
  return {
    neo, listeners, from, levels, tops,
    orbSent: () => [...toApp].reverse().find(([ch]) => ch === 'neo:orb')?.[1],
    orbCount: () => toApp.filter(([ch]) => ch === 'neo:orb').length,
    moveApp: (to) => { Object.assign(appAt, to); appEvents.get('move')?.(); },
    async awake() { const w = neo.wake('test'); finishLoad(); await w; return this; },
  };
}

describe('telling the app where the orb is', () => {
  it('says so when Neo wakes, in the app window\'s own coordinates', async () => {
    const f = await fakes().awake();
    const sent = f.orbSent();
    expect(sent).toBeTruthy();
    expect(sent.r).toBe(75);
    // The orb rests bottom right: well inside the app window, which starts at 100,50.
    expect(sent.x).toBeGreaterThan(1000);
    expect(sent.y).toBeGreaterThan(700);
  });

  it('says so again each time the orb is dragged', async () => {
    const f = await fakes().awake();
    const before = f.orbSent();
    f.listeners.get('neo:drag')(f.from, { phase: 'start' });
    f.listeners.get('neo:drag')(f.from, { phase: 'move', dx: -700, dy: -500 });
    const after = f.orbSent();
    expect(after.x).toBeLessThan(before.x);
    expect(after.y).toBeLessThan(before.y);
  });

  // A drag sends a frame per pointer move, and most land on the same pixel.
  it('says nothing while the orb has not actually moved', async () => {
    const f = await fakes().awake();
    f.listeners.get('neo:drag')(f.from, { phase: 'start' });
    f.listeners.get('neo:drag')(f.from, { phase: 'move', dx: -300, dy: -200 });
    const before = f.orbCount();
    f.listeners.get('neo:drag')(f.from, { phase: 'move', dx: -300, dy: -200 });
    f.listeners.get('neo:drag')(f.from, { phase: 'move', dx: -300, dy: -200 });
    expect(f.orbCount()).toBe(before);
  });

  // The orb has not moved, but what it sits over has.
  it('says so again when the app window is moved under it', async () => {
    const f = await fakes().awake();
    const before = f.orbSent();
    f.moveApp({ x: 300, y: 200 });
    expect(f.orbSent()).not.toEqual(before);
  });
});

describe('the orb wins the pointer', () => {
  // The corner tag floats at the same level, so whichever was shown last was
  // on top, and the orb could end up under a window that took the hover.
  it('floats above the corner tag rather than beside it', async () => {
    const f = await fakes().awake();
    expect(f.levels).toContain('pop-up-menu');
    expect(f.levels).not.toContain('floating');
  });

  it('is brought to the front on every wake', async () => {
    const f = await fakes().awake();
    expect(f.tops.length).toBeGreaterThan(0);
  });
});
