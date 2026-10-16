// REACHING FOR THE ORB BROUGHT BACK THE THING THE ORB WAS COVERING
// (w-5520063011, second round).
//
// Their words: "when i hover over the orb it actually just brings back the
// background in bottom right. how about we just only bring that back when orb
// is moved out of that area, so it can detect when i'm actually hovering over
// it. and make sure its ontop in terms of detection."
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
import { NEO, defaultOrbPoint } from '../shared/neo-orb.mjs';

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

  // A square test would call a corner covered when the round orb is not there.
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
function fakes({ userData = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-cover-')), cursor = { x: 1800, y: 1000 } } = {}) {
  fs.writeFileSync(path.join(userData, 'neo-alpha'), '');
  const handlers = new Map();
  const listeners = new Map();
  const ipcMain = { handle: (ch, fn) => handlers.set(ch, fn), on: (ch, fn) => listeners.set(ch, fn) };
  let finishLoad;
  const neoContents = { send: () => {}, once: (ev, fn) => { if (ev === 'did-finish-load') finishLoad = fn; } };
  const levels = [];
  const tops = [];
  class BrowserWindow {
    constructor() { this.webContents = neoContents; }
    setAlwaysOnTop(_on, level) { if (level) levels.push(level); }
    setVisibleOnAllWorkspaces() {} setIgnoreMouseEvents() {} setBounds() {}
    moveTop() { tops.push(true); }
    on() {} showInactive() {} hide() {} isDestroyed() { return false; }
  }
  const toApp = [];
  const appWindowAt = { x: 100, y: 50 };
  const appEvents = new Map();
  const mainWindow = {
    isDestroyed: () => false, isFocused: () => true,
    getContentBounds: () => ({ ...appWindowAt, width: 1800, height: 1000 }),
    on: (ev, fn) => appEvents.set(ev, fn),
    webContents: { send: (ch, p) => toApp.push([ch, p]) },
  };
  const timers = [];
  const neo = createNeo({
    app: { on() {} }, BrowserWindow, ipcMain,
    screen: { getCursorScreenPoint: () => cursor, getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) },
    powerMonitor: { on() {} },
    systemPreferences: { getMediaAccessStatus: () => 'granted', askForMediaAccess: async () => true },
    owner: { id: 'x', name: 'Terminal' },
    session: { fromPartition: () => ({ setPermissionRequestHandler() {}, setPermissionCheckHandler() {} }) },
    globalShortcut: { register: () => true, unregister() {} },
    mainWindow, preload: '/x', load: () => {}, userData,
    listen: () => ({ stop() {} }), platform: 'darwin',
    every: (fn) => { const t = { fn, stopped: false }; timers.push(t); return t; },
    stopEvery: (t) => { if (t) t.stopped = true; },
  });
  const from = { sender: neoContents };
  return {
    neo, listeners, from, levels, tops,
    orbSent: () => [...toApp].reverse().find(([ch]) => ch === 'neo:orb')?.[1],
    orbCount: () => toApp.filter(([ch]) => ch === 'neo:orb').length,
    moveApp: (to) => { Object.assign(appWindowAt, to); appEvents.get('move')?.(); },
    move: (to) => { Object.assign(cursor, to); timers.filter((t) => !t.stopped).forEach((t) => t.fn()); },
    async awake() { const w = neo.wake('test'); finishLoad(); await w; return this; },
  };
}

describe('telling the app where the orb is', () => {
  it('says so when Neo wakes, in the app window\'s own coordinates', async () => {
    const f = await fakes().awake();
    const corner = defaultOrbPoint({ x: 0, y: 0, width: 1920, height: 1080 });
    expect(f.orbSent()).toEqual({ x: corner.x - 100, y: corner.y - 50, r: NEO.orb / 2 });
  });

  it('says so again each time the orb is dragged', async () => {
    const f = await fakes().awake();
    f.listeners.get('neo:drag-start')(f.from);
    f.move({ x: 500, y: 400 });
    const sent = f.orbSent();
    expect(sent.x).toBeLessThan(500);
    expect(sent.y).toBeLessThan(400);
  });

  // A drag runs sixty times a second and most of those frames land on the
  // same pixel, which would be sixty messages a second saying nothing.
  it('says nothing while the orb has not actually moved', async () => {
    const f = await fakes().awake();
    f.listeners.get('neo:drag-start')(f.from);
    f.move({ x: 500, y: 400 });
    const before = f.orbCount();
    f.move({ x: 500, y: 400 });
    f.move({ x: 500, y: 400 });
    expect(f.orbCount()).toBe(before);
  });

  // ⌘R between conversations leaves a page that knows nothing about the orb,
  // and the orb will not have moved to tell it.
  it('says so again on every wake, even standing still', async () => {
    const f = await fakes().awake();
    const first = f.orbCount();
    f.listeners.get('neo:closed')(f.from);
    await f.awake();
    expect(f.orbCount()).toBeGreaterThan(first);
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
