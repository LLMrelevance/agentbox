// Her words, 2026-10-17: "I quite often like want to drag Jarvis to anywhere
// on the screen, like further up as to where it is. But I feel like I've hit a
// limit, so if the capacity of like where Jarvis can move could be a little
// like more extended, that'd be great."
//
// The limit was real and measurable. The window is 600x240 and the orb sits
// 24px in from its bottom right (renderer/src/neo/neo.css), so the orb's top
// is 66px below the window's. Clamping the WHOLE WINDOW to the work area left
// the orb unable to come within 66px of the top of the screen or 24px of the
// bottom, and 426px of the left edge on the side the card was on. The clamp is
// on the orb now, and the card hangs off the edge with it.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createNeo } from '../main/neo/index.mjs';

const WIDTH = 600;
const HEIGHT = 240;
const ORB = 150;
const ORB_TOP = HEIGHT - 24 - ORB;   // 66
const SCREEN = { x: 0, y: 0, width: 1920, height: 1080 };

function fakes() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-orb-'));
  fs.writeFileSync(path.join(userData, 'neo-alpha'), '');
  const handlers = new Map();
  const listeners = new Map();
  const windows = {};
  let finishLoad;
  const neoContents = { send: () => {}, once: (ev, fn) => { if (ev === 'did-finish-load') finishLoad = fn; } };
  class BrowserWindow {
    constructor() { this.webContents = neoContents; }
    setAlwaysOnTop() {} setVisibleOnAllWorkspaces() {} setIgnoreMouseEvents() {}
    setBounds(b) { this.bounds = { ...b }; windows.last = this; } getBounds() { return { ...this.bounds }; }
    on() {} showInactive() {} hide() {} moveTop() {} isDestroyed() { return false; }
  }
  const neo = createNeo({
    app: { on() {} }, BrowserWindow,
    ipcMain: { handle: (ch, fn) => handlers.set(ch, fn), on: (ch, fn) => listeners.set(ch, fn) },
    screen: { getCursorScreenPoint: () => ({ x: 0, y: 0 }), getDisplayNearestPoint: () => ({ workArea: SCREEN }) },
    powerMonitor: { on() {} },
    systemPreferences: { getMediaAccessStatus: () => 'granted', askForMediaAccess: async () => true },
    owner: { id: 'com.apple.Terminal', name: 'Terminal' },
    session: { fromPartition: () => ({ setPermissionRequestHandler() {}, setPermissionCheckHandler() {} }) },
    globalShortcut: { register: () => true, unregister() {} },
    mainWindow: { isDestroyed: () => false, isFocused: () => true, moveTop: () => {}, getContentBounds: () => ({ x: 0, y: 0, width: 1920, height: 1080 }), on: () => {}, webContents: { send: () => {} } },
    preload: '/x', load: () => {}, userData, listen: () => ({ stop() {} }), platform: 'darwin',
  });
  return { neo, windows, listeners, finishLoad: () => finishLoad?.(), from: { sender: neoContents } };
}

async function awake() {
  const f = fakes();
  const w = f.neo.wake('test');
  f.finishLoad();
  await w;
  return f;
}

// Where the orb's own box ends up, whichever side the card took.
function orbAt(bounds) {
  const left = bounds.x + WIDTH - 24 - ORB;
  const flipped = bounds.x + 24;
  // Over the left half the card flips and the orb moves to the window's left.
  const x = bounds.x + WIDTH / 2 < SCREEN.width / 2 ? flipped : left;
  return { top: bounds.y + ORB_TOP, bottom: bounds.y + ORB_TOP + ORB, left: x, right: x + ORB };
}

async function dragTo(dx, dy) {
  const f = await awake();
  f.listeners.get('neo:drag')(f.from, { phase: 'start' });
  f.listeners.get('neo:drag')(f.from, { phase: 'move', dx, dy });
  return f.windows.last.getBounds();
}

describe('dragging the orb to an edge', () => {
  it('puts it at the very top of the screen', async () => {
    expect(orbAt(await dragTo(0, -5000)).top).toBe(SCREEN.y);
  });

  it('puts it at the very bottom', async () => {
    expect(orbAt(await dragTo(0, 5000)).bottom).toBe(SCREEN.y + SCREEN.height);
  });

  it('puts it against the left edge', async () => {
    expect(orbAt(await dragTo(-5000, 0)).left).toBe(SCREEN.x);
  });

  it('puts it against the right edge', async () => {
    expect(orbAt(await dragTo(5000, 0)).right).toBe(SCREEN.x + SCREEN.width);
  });

  it('never lets the orb itself off the screen', async () => {
    for (const [dx, dy] of [[-9000, -9000], [9000, 9000], [-9000, 9000], [9000, -9000]]) {
      const o = orbAt(await dragTo(dx, dy));
      expect(o.top).toBeGreaterThanOrEqual(SCREEN.y);
      expect(o.bottom).toBeLessThanOrEqual(SCREEN.y + SCREEN.height);
      expect(o.left).toBeGreaterThanOrEqual(SCREEN.x);
      expect(o.right).toBeLessThanOrEqual(SCREEN.x + SCREEN.width);
    }
  });

  it('still moves the window by exactly how far the pointer moved in the middle of the screen', async () => {
    const f = await awake();
    const was = f.windows.last.getBounds();
    f.listeners.get('neo:drag')(f.from, { phase: 'start' });
    f.listeners.get('neo:drag')(f.from, { phase: 'move', dx: -300, dy: -200 });
    expect(f.windows.last.getBounds()).toMatchObject({ x: was.x - 300, y: was.y - 200 });
  });
});
