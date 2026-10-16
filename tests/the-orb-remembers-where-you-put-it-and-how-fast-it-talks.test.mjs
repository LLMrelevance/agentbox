// DRAGGING THE ORB, AND THE SPEED CONTROL BEHIND IT (w-5520063011).
//
// Her words on the first Neo alpha: "I'd like to control voice speed, perhaps
// by hovering over the orb to reveal controls; and I'd like to drag the orb
// around the screen."
//
// Both are the main process's, because the orb is a window: moving it means
// moving the window under the cursor, and the speed has to outlive the session
// it was changed in, or every conversation starts at normal again. Measured
// here against fake Electron parts, the way the other main-process Neo tests
// are (main/neo/index.mjs).
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createNeo } from '../main/neo/index.mjs';
import { NEO, defaultOrbPoint } from '../shared/neo-orb.mjs';

const AREA = { x: 0, y: 0, width: 1920, height: 1080 };

function fakes({ userData = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-orb-')), cursor = { x: 1800, y: 1000 }, displays = [AREA] } = {}) {
  fs.writeFileSync(path.join(userData, 'neo-alpha'), '');
  const handlers = new Map();
  const listeners = new Map();
  const ipcMain = { handle: (ch, fn) => handlers.set(ch, fn), on: (ch, fn) => listeners.set(ch, fn) };
  const neoSent = [];
  let finishLoad;
  const neoContents = { send: (ch, p) => neoSent.push([ch, p]), once: (ev, fn) => { if (ev === 'did-finish-load') finishLoad = fn; } };
  let bounds = null;
  let through = true;
  class BrowserWindow {
    constructor() { this.webContents = neoContents; }
    setAlwaysOnTop() {} setVisibleOnAllWorkspaces() {}
    setIgnoreMouseEvents(on) { through = on; }
    setBounds(b) { bounds = b; }
    on() {} showInactive() {} hide() {} moveTop() {} isDestroyed() { return false; }
  }
  // The app's window answers "what is on screen" at once, the way the real one
  // does; without that every session start waits out main's ten-second cap.
  const mainContents = {
    send: (ch, { id } = {}) => {
      if (ch !== 'neo:act') return;
      listeners.get('neo:act-result')({ sender: mainContents }, { id, result: { ok: true, status: 'committed', said: 'The inbox.' } });
    },
  };
  const mainWindow = { isDestroyed: () => false, isFocused: () => true, getContentBounds: () => ({ x: 0, y: 0, width: 1920, height: 1080 }), on: () => {}, webContents: mainContents };
  const started = [];
  const timers = [];
  const neo = createNeo({
    app: { on() {} }, BrowserWindow, ipcMain,
    screen: {
      getCursorScreenPoint: () => cursor,
      getDisplayNearestPoint: (p) => ({ workArea: displays.find((d) => p.x >= d.x && p.x < d.x + d.width) ?? displays[0] }),
    },
    powerMonitor: { on() {} },
    systemPreferences: { getMediaAccessStatus: () => 'granted', askForMediaAccess: async () => true },
    owner: { id: 'x', name: 'Terminal' },
    session: { fromPartition: () => ({ setPermissionRequestHandler() {}, setPermissionCheckHandler() {} }) },
    globalShortcut: { register: () => true, unregister() {} },
    mainWindow, preload: '/x', load: () => {}, userData,
    listen: () => ({ stop() {} }), platform: 'darwin',
    startLiveImpl: async ({ session }) => { started.push(session); return { sdp: 'v=0 answer' }; },
    every: (fn, ms) => { const t = { fn, ms, stopped: false }; timers.push(t); return t; },
    stopEvery: (t) => { if (t) t.stopped = true; },
  });
  const from = { sender: neoContents };
  return {
    userData, neo, handlers, listeners, neoSent, from, started, timers,
    bounds: () => bounds,
    through: () => through,
    orb: () => bounds && { x: bounds.x + NEO.cx, y: bounds.y + NEO.cy },
    move: (to) => { Object.assign(cursor, to); timers.filter((t) => !t.stopped).forEach((t) => t.fn()); },
    async awake() { const w = neo.wake('test'); finishLoad(); await w; return this; },
  };
}

const sideSent = (f) => [...f.neoSent].reverse().find(([ch]) => ch === 'neo:placed')?.[1];

describe('dragging the orb', () => {
  it('starts in the corner it has always rested in', async () => {
    const f = await fakes().awake();
    expect(f.orb()).toEqual(defaultOrbPoint(AREA));
  });

  it('follows the cursor while the pointer is down on it', async () => {
    const f = await fakes().awake();
    f.listeners.get('neo:drag-start')(f.from);
    f.move({ x: 1400, y: 600 });
    expect(f.orb()).toEqual({ x: defaultOrbPoint(AREA).x - 400, y: defaultOrbPoint(AREA).y - 400 });
  });

  it('stops following once the pointer comes up', async () => {
    const f = await fakes().awake();
    f.listeners.get('neo:drag-start')(f.from);
    f.move({ x: 1400, y: 600 });
    const where = f.orb();
    f.listeners.get('neo:drag-end')(f.from);
    f.move({ x: 300, y: 300 });
    expect(f.orb()).toEqual(where);
  });

  it('keeps the orb on screen however far the cursor goes', async () => {
    const f = await fakes().awake();
    f.listeners.get('neo:drag-start')(f.from);
    f.move({ x: -900, y: -900 });
    expect(f.orb().x).toBeGreaterThanOrEqual(NEO.orb / 2);
    expect(f.orb().y).toBeGreaterThanOrEqual(NEO.orb / 2 + NEO.controls);
  });

  it('tells the page to read the card out on the other side near the left edge', async () => {
    const f = await fakes().awake();
    expect(sideSent(f)).toMatchObject({ cardSide: 'left' });
    f.listeners.get('neo:drag-start')(f.from);
    f.move({ x: 20, y: 600 });
    expect(sideSent(f)).toMatchObject({ cardSide: 'right' });
  });

  it('ignores a drag from any window but Neo\'s own', async () => {
    const f = await fakes().awake();
    f.listeners.get('neo:drag-start')({ sender: { send() {} } });
    const where = f.orb();
    f.move({ x: 300, y: 300 });
    expect(f.orb()).toEqual(where);
  });

  // The window moves under the cursor, so the orb can fire a mouseleave at
  // the moment a frame lands late. Going click-through then would lose the
  // pointer release and the orb would follow the cursor until the cap.
  it('stays clickable while it is being dragged', async () => {
    const f = await fakes().awake();
    f.listeners.get('neo:clickable')(f.from, true);   // the pointer reached the orb
    f.listeners.get('neo:drag-start')(f.from);
    f.listeners.get('neo:clickable')(f.from, false);  // a mouseleave mid-drag
    expect(f.through()).toBe(false);
    f.listeners.get('neo:drag-end')(f.from);
    f.listeners.get('neo:clickable')(f.from, false);
    expect(f.through()).toBe(true);
  });

  it('stops following if the pointer release is never heard', async () => {
    const f = await fakes().awake();
    f.listeners.get('neo:drag-start')(f.from);
    const long = f.timers.find((t) => !t.stopped);
    for (let i = 0; i < 2000; i++) long.fn();
    const where = f.orb();
    f.move({ x: 300, y: 300 });
    expect(f.orb()).toEqual(where);
  });
});

describe('where you put it, next time', () => {
  it('wakes where it was dropped, after a restart', async () => {
    const first = await fakes().awake();
    first.listeners.get('neo:drag-start')(first.from);
    first.move({ x: 700, y: 400 });
    first.listeners.get('neo:drag-end')(first.from);
    const dropped = first.orb();

    const again = await fakes({ userData: first.userData, cursor: { x: 1800, y: 1000 } }).awake();
    expect(again.orb()).toEqual(dropped);
  });

  it('wakes on the display it was left on, not the one the cursor is on', async () => {
    const second = { x: 1920, y: 0, width: 1280, height: 800 };
    const first = await fakes({ displays: [AREA, second], cursor: { x: 2500, y: 400 } }).awake();
    first.listeners.get('neo:drag-start')(first.from);
    first.move({ x: 2400, y: 400 });
    first.listeners.get('neo:drag-end')(first.from);

    const again = await fakes({ userData: first.userData, displays: [AREA, second], cursor: { x: 100, y: 100 } }).awake();
    expect(again.orb().x).toBeGreaterThan(second.x);
  });

  it('comes back on screen when the display it was left on has gone', async () => {
    const second = { x: 1920, y: 0, width: 1280, height: 800 };
    const first = await fakes({ displays: [AREA, second], cursor: { x: 2500, y: 400 } }).awake();
    first.listeners.get('neo:drag-start')(first.from);
    first.move({ x: 2800, y: 700 });
    first.listeners.get('neo:drag-end')(first.from);

    const again = await fakes({ userData: first.userData, displays: [AREA], cursor: { x: 100, y: 100 } }).awake();
    expect(again.orb().x).toBeLessThanOrEqual(AREA.width - NEO.orb / 2);
  });
});

describe('how fast it talks', () => {
  const offer = 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n';

  it('opens the session at normal speed until it is changed', async () => {
    const f = await fakes().awake();
    await f.handlers.get('neo:start-live')(f.from, { sdp: offer });
    expect(f.started[0].audio.output.speed).toBe(1);
  });

  it('opens every later session at the speed you chose', async () => {
    const f = await fakes().awake();
    f.listeners.get('neo:speed')(f.from, { speed: 1.5 });
    await f.handlers.get('neo:start-live')(f.from, { sdp: offer });
    expect(f.started[0].audio.output.speed).toBe(1.5);
  });

  it('remembers the speed after a restart', async () => {
    const first = await fakes().awake();
    first.listeners.get('neo:speed')(first.from, { speed: 0.75 });
    const again = await fakes({ userData: first.userData }).awake();
    await again.handlers.get('neo:start-live')(again.from, { sdp: offer });
    expect(again.started[0].audio.output.speed).toBe(0.75);
  });

  it('tells the page the speed and the side when it wakes, so the control is already right', async () => {
    const first = await fakes().awake();
    first.listeners.get('neo:speed')(first.from, { speed: 1.25 });
    const again = await fakes({ userData: first.userData }).awake();
    expect(sideSent(again)).toMatchObject({ speed: 1.25, cardSide: 'left' });
  });

  it('refuses a speed the control does not offer, and one from another window', async () => {
    const f = await fakes().awake();
    f.listeners.get('neo:speed')(f.from, { speed: 12 });
    f.listeners.get('neo:speed')({ sender: { send() {} } }, { speed: 1.5 });
    await f.handlers.get('neo:start-live')(f.from, { sdp: offer });
    expect(f.started[0].audio.output.speed).toBe(1);
  });
});
