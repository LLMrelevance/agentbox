// Two bugs Codex found reviewing Neo's main process (2026-10-16), traced in
// main/neo/index.mjs with fake Electron parts:
// - The first wake was sent before Neo's page had loaded. The page never
//   heard it, main marked Neo live anyway, and every later tap only sent
//   "sleep" to a page with nothing to stop: Neo was dead until a restart.
// - A tool call queued behind a slow one was still carried out after Neo
//   signed off or the screen locked.
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createNeo } from '../main/neo/index.mjs';

function fakes({ onListen, getMicImpl, mic = { status: 'granted' }, userData: given, startLiveImpl } = {}) {
  const userData = given ?? fs.mkdtempSync(path.join(os.tmpdir(), 'neo-main-'));
  fs.writeFileSync(path.join(userData, 'neo-alpha'), '');
  const registered = [];
  const windows = {};
  const handlers = new Map();
  const listeners = new Map();
  const ipcMain = { handle: (ch, fn) => handlers.set(ch, fn), on: (ch, fn) => listeners.set(ch, fn) };
  const neoSent = [];
  let finishLoad;
  const neoContents = {
    send: (ch, p) => neoSent.push([ch, p]),
    once: (ev, fn) => { if (ev === 'did-finish-load') finishLoad = fn; },
  };
  class BrowserWindow {
    constructor() { this.webContents = neoContents; }
    setAlwaysOnTop() {} setVisibleOnAllWorkspaces() {} setIgnoreMouseEvents() {}
    setBounds(b) { this.bounds = { ...b }; windows.last = this; } getBounds() { return { ...this.bounds }; }
    on() {} showInactive() {} hide() {} isDestroyed() { return false; }
  }
  const mainSent = [];
  const mainWindow = { isDestroyed: () => false, isFocused: () => true, webContents: { send: (ch, p) => mainSent.push([ch, p]) } };
  const power = new Map();
  const neo = createNeo({
    app: { on() {} }, BrowserWindow, ipcMain,
    screen: { getCursorScreenPoint: () => ({ x: 0, y: 0 }), getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) },
    powerMonitor: { on: (ev, fn) => power.set(ev, fn) },
    systemPreferences: { getMediaAccessStatus: () => mic.status, askForMediaAccess: async () => mic.status === 'granted' },
    getMicImpl, startLiveImpl, owner: { id: 'com.apple.Terminal', name: 'Terminal' },
    session: { fromPartition: () => ({ setPermissionRequestHandler() {}, setPermissionCheckHandler() {} }) },
    globalShortcut: { register: (k) => { registered.push(k); return true; }, unregister() {} },
    mainWindow, preload: '/x', load: () => {}, userData,
    listen: (o) => { onListen?.(o); return { stop() {} }; }, platform: 'darwin',
  });
  const fromNeo = { sender: neoContents };
  const fromMainWindow = { sender: mainWindow.webContents };
  return { windows, userData, registered, neo, handlers, listeners, neoSent, mainSent, finishLoad: () => finishLoad?.(), power, fromNeo, fromMainWindow };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('waking', () => {
  it('waits for the page to load before telling it to wake', async () => {
    const f = fakes();
    const woke = f.neo.wake('test');
    await tick();
    expect(f.neoSent.some(([ch]) => ch === 'neo:wake')).toBe(false);
    f.finishLoad();
    await woke;
    expect(f.neoSent.some(([ch]) => ch === 'neo:wake')).toBe(true);
  });

  it('does not wake if the screen locked while it was starting', async () => {
    const f = fakes();
    const woke = f.neo.wake('test');
    await tick();
    f.power.get('lock-screen')();
    f.finishLoad();
    await woke;
    expect(f.neoSent.some(([ch]) => ch === 'neo:wake')).toBe(false);
  });

  it('a second tap while the first wake is still starting does not start a second session', async () => {
    const f = fakes();
    const a = f.neo.wake('test');
    const b = f.neo.wake('test');
    f.finishLoad();
    await Promise.all([a, b]);
    expect(f.neoSent.filter(([ch]) => ch === 'neo:wake')).toHaveLength(1);
  });
});

describe('work queued when Neo signs off', () => {
  async function awake() {
    const f = fakes();
    const w = f.neo.wake('test');
    f.finishLoad();
    await w;
    return f;
  }
  const answerMain = (f) => {
    const [, req] = f.mainSent.filter(([ch]) => ch === 'neo:act').at(-1);
    f.listeners.get('neo:act-result')(f.fromMainWindow, { id: req.id, result: { ok: true, status: 'committed', said: 'ok' } });
  };

  it('is carried out while Neo is awake', async () => {
    const f = await awake();
    const r = f.handlers.get('neo:tool')(f.fromNeo, { callId: 'c1', name: 'next_thread', args: '{}' });
    await tick();
    answerMain(f);
    expect(await r).toMatchObject({ ok: true });
  });

  it('is refused, not carried out, when the screen locks before its turn', async () => {
    const f = await awake();
    const first = f.handlers.get('neo:tool')(f.fromNeo, { callId: 'c1', name: 'next_thread', args: '{}' });
    const second = f.handlers.get('neo:tool')(f.fromNeo, { callId: 'c2', name: 'close_thread', args: '{"id":"w-1"}' });
    await tick();
    f.power.get('lock-screen')();
    answerMain(f);
    await first;
    expect(await second).toMatchObject({ ok: false, status: 'refused' });
    expect(f.mainSent.filter(([ch, p]) => ch === 'neo:act' && p.name === 'close_thread')).toHaveLength(0);
  });

  it('is refused after Neo said it was signing off', async () => {
    const f = await awake();
    await f.handlers.get('neo:tool')(f.fromNeo, { callId: 'c1', name: 'sign_off', args: '{}' });
    expect(await f.handlers.get('neo:tool')(f.fromNeo, { callId: 'c2', name: 'next_thread', args: '{}' })).toMatchObject({ ok: false });
    expect(f.mainSent.filter(([ch]) => ch === 'neo:act')).toHaveLength(0);
  });

  it('is refused once the page says it is signing off, before the service has closed', async () => {
    const f = await awake();
    f.listeners.get('neo:ending')(f.fromNeo);
    expect(await f.handlers.get('neo:tool')(f.fromNeo, { callId: 'c1', name: 'next_thread', args: '{}' })).toMatchObject({ ok: false });
    expect(f.mainSent.filter(([ch]) => ch === 'neo:act')).toHaveLength(0);
  });

  it('a sign-off does not reach out and stop the next conversation', async () => {
    vi.useFakeTimers();
    try {
      const f = await awake();
      await f.handlers.get('neo:tool')(f.fromNeo, { callId: 'c1', name: 'sign_off', args: '{}' });
      f.listeners.get('neo:closed')(f.fromNeo);
      const again = f.neo.wake('test');
      await vi.advanceTimersByTimeAsync(0);
      await again;
      const before = f.neoSent.filter(([ch]) => ch === 'neo:sleep').length;
      await vi.advanceTimersByTimeAsync(2000);
      expect(f.neoSent.filter(([ch]) => ch === 'neo:sleep').length).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });
});

// She tapped ⌘ twice and nothing happened (2026-10-16). When the listener
// cannot run, the only sign was a shortcut she had no reason to try, so Neo
// now says why on screen, once, and writes each state to a log.
describe('when tapping ⌘ twice cannot work yet', () => {
  function withListener() {
    let opts;
    const f = fakes({ onListen: (o) => { opts = o; } });
    return { ...f, state: (s, why) => opts.onState(s, why) };
  }
  const notices = (f) => f.neoSent.filter(([ch]) => ch === 'neo:notice').map(([, p]) => p.text);

  it('says Input Monitoring is missing, and that ⌃⌥⌘N works meanwhile', async () => {
    const f = withListener();
    f.state('no-permission');
    f.finishLoad();
    await tick();
    expect(notices(f)).toHaveLength(1);
    expect(notices(f)[0]).toMatch(/Input Monitoring/);
    expect(notices(f)[0]).toMatch(/⌃⌥⌘N/);
    expect(f.registered).toEqual(['Control+Alt+Command+N']);
  });

  it('says the listener could not be built, and that ⌃⌥⌘N works meanwhile', async () => {
    const f = withListener();
    f.state('failed', 'xcrun: error: invalid active developer path');
    f.finishLoad();
    await tick();
    expect(notices(f)[0]).toMatch(/⌃⌥⌘N/);
  });

  it('says nothing when the listener is ready', async () => {
    const f = withListener();
    f.state('ready');
    await tick();
    expect(notices(f)).toEqual([]);
    expect(f.registered).toEqual([]);
  });

  it('says it once, not on every restart of the helper', async () => {
    const f = withListener();
    f.state('stopped'); f.state('stopped');
    f.finishLoad();
    await tick();
    expect(notices(f)).toHaveLength(1);
  });

  it('writes each state to a log beside its usage, with the reason', () => {
    const f = withListener();
    f.state('ready');
    f.state('failed', 'no compiler');
    const log = fs.readFileSync(path.join(f.userData, 'neo', 'log.txt'), 'utf8');
    expect(log).toMatch(/listener ready/);
    expect(log).toMatch(/listener failed no compiler/);
  });
});

describe('the microphone', () => {
  it('a refused microphone tells the card which app macOS refused', async () => {
    const f = fakes({ mic: { status: 'denied' } });
    const w = f.neo.wake('test');
    f.finishLoad();
    await w;
    expect(f.neoSent).toContainEqual(['neo:no-mic', { app: 'Terminal' }]);
    expect(f.neoSent.some(([ch]) => ch === 'neo:wake')).toBe(false);
  });

  it('the card\'s Allow press gets the microphone and then starts Neo', async () => {
    const mic = { status: 'denied' };
    const getMicImpl = vi.fn(async () => { mic.status = 'granted'; return 'granted'; });
    const f = fakes({ getMicImpl, mic });
    const w = f.neo.wake('test');
    f.finishLoad();
    await w;
    expect(await f.handlers.get('neo:allow-mic')(f.fromNeo)).toBe('granted');
    await tick(); await tick();
    expect(getMicImpl).toHaveBeenCalledTimes(1);
    expect(f.neoSent.some(([ch]) => ch === 'neo:wake')).toBe(true);
  });

  it('only Neo\'s own card can press it', async () => {
    const getMicImpl = vi.fn(async () => 'granted');
    const f = fakes({ getMicImpl });
    expect(await f.handlers.get('neo:allow-mic')(f.fromMainWindow)).toBe('refused');
    expect(getMicImpl).not.toHaveBeenCalled();
  });
});

// "Be able to drag the orb around your screen" (2026-10-16). The window
// follows the drag, stays whole on the display, and comes back where she
// left it next time.
describe('dragging the orb', () => {
  async function awake(userData) {
    const f = fakes({ userData });
    const w = f.neo.wake('test');
    f.finishLoad();
    await w;
    return f;
  }

  it('moves the window by how far the pointer moved', async () => {
    const f = await awake();
    const was = f.windows.last.getBounds();
    f.listeners.get('neo:drag')(f.fromNeo, { phase: 'start' });
    f.listeners.get('neo:drag')(f.fromNeo, { phase: 'move', dx: -300, dy: -200 });
    expect(f.windows.last.getBounds()).toMatchObject({ x: was.x - 300, y: was.y - 200 });
  });

  it('keeps the whole window on the screen', async () => {
    const f = await awake();
    f.listeners.get('neo:drag')(f.fromNeo, { phase: 'start' });
    f.listeners.get('neo:drag')(f.fromNeo, { phase: 'move', dx: -5000, dy: 5000 });
    const b = f.windows.last.getBounds();
    expect(b.x).toBe(0);
    expect(b.y + b.height).toBe(1080);
  });

  it('comes back where she left it the next time Neo wakes', async () => {
    const f = await awake();
    f.listeners.get('neo:drag')(f.fromNeo, { phase: 'start' });
    f.listeners.get('neo:drag')(f.fromNeo, { phase: 'move', dx: -400, dy: -300 });
    f.listeners.get('neo:drag')(f.fromNeo, { phase: 'end' });
    const left = f.windows.last.getBounds();
    const again = await awake(f.userData);
    expect(again.windows.last.getBounds()).toMatchObject({ x: left.x, y: left.y });
  });

  it('only Neo\'s own window can move it', async () => {
    const f = await awake();
    const was = f.windows.last.getBounds();
    f.listeners.get('neo:drag')(f.fromMainWindow, { phase: 'start' });
    f.listeners.get('neo:drag')(f.fromMainWindow, { phase: 'move', dx: -300, dy: 0 });
    expect(f.windows.last.getBounds()).toEqual(was);
  });
});

// "Adjust the voice speed, maybe by hovering on the orb" (2026-10-16). GPT-Live
// has no speed setting (refused: "Unknown parameter"); told how fast to talk it
// went from about 3.7 to 4.7 words a second on "fast" and 6.3 on "faster",
// measured live. So the pace she picks is kept and goes into the next session.
describe('the voice pace', () => {
  it('is kept and goes into the session Neo starts', async () => {
    const startLiveImpl = vi.fn(async () => ({ sdp: 'v=0 answer', id: 's' }));
    const f = fakes({ startLiveImpl });
    expect(await f.handlers.get('neo:pace')(null, 'faster')).toBe('faster');
    const w = f.neo.wake('test');
    f.finishLoad();
    await w;
    const started = f.handlers.get('neo:start-live')(f.fromNeo, { sdp: 'v=0 offer', outside: false });
    await tick();
    const [, req] = f.mainSent.filter(([ch]) => ch === 'neo:act').at(-1);
    f.listeners.get('neo:act-result')(f.fromMainWindow, { id: req.id, result: { ok: true, said: 'screen' } });
    await started;
    expect(startLiveImpl.mock.calls[0][0].session.instructions).toMatch(/very fast/i);
  });

  it('is remembered across launches, and a pace that is not one of the four is refused', async () => {
    const f = fakes();
    await f.handlers.get('neo:pace')(null, 'slow');
    expect(await f.handlers.get('neo:pace')(null, 'ludicrous')).toBe('slow');
    const again = fakes({ userData: f.userData });
    expect(await again.handlers.get('neo:pace')(null)).toBe('slow');
  });
});
