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

function fakes({ onListen, getMicImpl, mic = { status: 'granted' }, userData: given, startLiveImpl, onReview, clock, decideImpl } = {}) {
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
    on() {} showInactive() {} hide() {} moveTop() {} isDestroyed() { return false; }
  }
  const mainSent = [];
  const mainWindow = { isDestroyed: () => false, isFocused: () => true, getContentBounds: () => ({ x: 0, y: 0, width: 1920, height: 1080 }), on: () => {}, webContents: { send: (ch, p) => mainSent.push([ch, p]) } };
  const power = new Map();
  const neo = createNeo({
    app: { on() {} }, BrowserWindow, ipcMain,
    screen: { getCursorScreenPoint: () => ({ x: 0, y: 0 }), getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }) },
    powerMonitor: { on: (ev, fn) => power.set(ev, fn) },
    systemPreferences: { getMediaAccessStatus: () => mic.status, askForMediaAccess: async () => mic.status === 'granted' },
    getMicImpl, startLiveImpl, onReview, decideImpl, ...(clock ? { now: clock } : {}), owner: { id: 'com.apple.Terminal', name: 'Terminal' },
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

// "When I put it in the top-left corner, the chat container moves
// appropriately so it's not off-screen" (2026-10-16). Over the left half of
// the display the card sits on the orb's right, and the orb stays under the
// pointer as it changes sides.
describe('the card on the side with room', () => {
  const ORB_RIGHT = 600 - 24 - 75; // orb centre in the window, card on its left
  const ORB_LEFT = 24 + 75;        // and with the card on its right
  async function awake(userData) {
    const f = fakes({ userData });
    const w = f.neo.wake('test');
    f.finishLoad();
    await w;
    return f;
  }
  const sides = (f) => f.neoSent.filter(([ch]) => ch === 'neo:side').map(([, p]) => p.side);

  it('starts with the card on the orb\'s left, in the bottom-right corner', async () => {
    const f = await awake();
    expect(sides(f).at(-1)).toBe('right');
  });

  it('moves the card to the orb\'s right over the left half, keeping the orb under the pointer', async () => {
    const f = await awake();
    const start = f.windows.last.getBounds();
    const orbAt = start.x + ORB_RIGHT;
    f.listeners.get('neo:drag')(f.fromNeo, { phase: 'start' });
    f.listeners.get('neo:drag')(f.fromNeo, { phase: 'move', dx: -1500, dy: -300 });
    expect(sides(f).at(-1)).toBe('left');
    const b = f.windows.last.getBounds();
    expect(b.x + ORB_LEFT).toBe(orbAt - 1500);
    expect(b.y).toBe(start.y - 300);
  });

  it('lets the orb reach the left edge once the card is on its right', async () => {
    const f = await awake();
    f.listeners.get('neo:drag')(f.fromNeo, { phase: 'start' });
    f.listeners.get('neo:drag')(f.fromNeo, { phase: 'move', dx: -5000, dy: -5000 });
    expect(f.windows.last.getBounds()).toMatchObject({ x: 0, y: 0 });
  });

  it('keeps the side with the place', async () => {
    const f = await awake();
    f.listeners.get('neo:drag')(f.fromNeo, { phase: 'start' });
    f.listeners.get('neo:drag')(f.fromNeo, { phase: 'move', dx: -1500, dy: -800 });
    f.listeners.get('neo:drag')(f.fromNeo, { phase: 'end' });
    const again = await awake(f.userData);
    expect(sides(again).at(-1)).toBe('left');
  });
});

// "Quite often I'd like to use Neo in a mode where I basically don't even have
// to see the little chat that comes up. Sometimes I want it, sometimes I
// don't" (her words, 2026-10-16). Captions on or off, kept like the pace.
describe('captions', () => {
  it('are on until she turns them off, and stay as she left them', async () => {
    const f = fakes();
    expect(await f.handlers.get('neo:captions')(null)).toBe(true);
    expect(await f.handlers.get('neo:captions')(null, false)).toBe(false);
    const again = fakes({ userData: f.userData });
    expect(await again.handlers.get('neo:captions')(null)).toBe(false);
    expect(await again.handlers.get('neo:captions')(null, true)).toBe(true);
  });

  it('a value that is not on or off changes nothing', async () => {
    const f = fakes();
    await f.handlers.get('neo:captions')(null, false);
    expect(await f.handlers.get('neo:captions')(null, 'off')).toBe(false);
  });
});

// "Listen in on our conversations, track our conversations, and as we run
// into issues, maybe every few minutes of usage, patch them as we go. Just
// sort of do that continuously for the first couple weeks" (her words,
// 2026-10-16). The transcript is kept on this Mac; every few minutes of talk
// it is handed to a review.
describe('listening in', () => {
  async function talking(opts = {}) {
    const f = fakes(opts);
    const w = f.neo.wake('test');
    f.finishLoad();
    await w;
    return f;
  }
  const say = (f, who, text) => f.listeners.get('neo:log')(f.fromNeo, { who, text });

  it('keeps what was said, word for word, in a file of this session on this Mac', async () => {
    const f = await talking();
    say(f, 'you', 'Full screen the picture.');
    say(f, 'neo', 'One sec. Done.');
    const dir = path.join(f.userData, 'neo', 'talk');
    const [file] = fs.readdirSync(dir);
    const lines = fs.readFileSync(path.join(dir, file), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.map((l) => [l.who, l.text])).toEqual([['you', 'Full screen the picture.'], ['neo', 'One sec. Done.']]);
    expect(typeof lines[0].at).toBe('string');
  });

  it('takes lines only from Neo\'s own window, and only of the three kinds', async () => {
    const f = await talking();
    f.listeners.get('neo:log')(f.fromMainWindow, { who: 'you', text: 'not from neo' });
    say(f, 'system', 'odd');
    const dir = path.join(f.userData, 'neo', 'talk');
    expect(fs.existsSync(dir) ? fs.readdirSync(dir) : []).toEqual([]);
  });

  it('hands the talk to a review once a few minutes have been spoken, at the end of that session', async () => {
    const onReview = vi.fn();
    const f = await talking({ onReview });
    say(f, 'you', 'that was wrong');
    f.listeners.get('neo:usage')(f.fromNeo, { seconds: 200 });
    expect(onReview).not.toHaveBeenCalled();
    f.listeners.get('neo:closed')(f.fromNeo);
    expect(onReview).toHaveBeenCalledTimes(1);
    const [{ files, seconds }] = onReview.mock.calls[0];
    expect(seconds).toBe(200);
    expect(files).toHaveLength(1);
    expect(fs.readFileSync(files[0], 'utf8')).toMatch(/that was wrong/);
  });

  it('waits for more when a session was short, and counts it toward the next', async () => {
    const onReview = vi.fn();
    const f = await talking({ onReview });
    say(f, 'you', 'hi');
    f.listeners.get('neo:usage')(f.fromNeo, { seconds: 60 });
    f.listeners.get('neo:closed')(f.fromNeo);
    expect(onReview).not.toHaveBeenCalled();
    const w = f.neo.wake('test'); await w;
    say(f, 'you', 'second time');
    f.listeners.get('neo:usage')(f.fromNeo, { seconds: 150 });
    f.listeners.get('neo:closed')(f.fromNeo);
    expect(onReview).toHaveBeenCalledTimes(1);
    expect(onReview.mock.calls[0][0].files).toHaveLength(2);
    expect(onReview.mock.calls[0][0].seconds).toBe(210);
  });

  it('starts counting again after a review', async () => {
    const onReview = vi.fn();
    const f = await talking({ onReview });
    say(f, 'you', 'a');
    f.listeners.get('neo:usage')(f.fromNeo, { seconds: 200 });
    f.listeners.get('neo:closed')(f.fromNeo);
    const w = f.neo.wake('test'); await w;
    say(f, 'you', 'b');
    f.listeners.get('neo:usage')(f.fromNeo, { seconds: 30 });
    f.listeners.get('neo:closed')(f.fromNeo);
    expect(onReview).toHaveBeenCalledTimes(1);
  });
});

// "I quite often want to drag Jarvis anywhere on the screen, further up from
// where it is. I feel like I've hit a limit" (her words, 2026-10-16). The orb
// sat at the foot of its window, so it stopped 66px short of the top. In the
// upper part of the display the window turns over: orb on top, card below.
describe('dragging the orb up', () => {
  async function awake() {
    const f = fakes();
    const w = f.neo.wake('test');
    f.finishLoad();
    await w;
    return f;
  }
  const last = (f) => f.neoSent.filter(([ch]) => ch === 'neo:side').at(-1)?.[1];

  it('turns the window over near the top, keeping the orb under the pointer', async () => {
    const f = await awake();
    const start = f.windows.last.getBounds();
    const orbY = start.y + (240 - 24 - 75);
    f.listeners.get('neo:drag')(f.fromNeo, { phase: 'start' });
    f.listeners.get('neo:drag')(f.fromNeo, { phase: 'move', dx: 0, dy: -700 });
    expect(last(f)).toMatchObject({ up: true });
    expect(f.windows.last.getBounds().y + (24 + 75)).toBe(orbY - 700);
  });

  it('lets the orb reach the top of the screen', async () => {
    const f = await awake();
    f.listeners.get('neo:drag')(f.fromNeo, { phase: 'start' });
    f.listeners.get('neo:drag')(f.fromNeo, { phase: 'move', dx: 0, dy: -5000 });
    expect(f.windows.last.getBounds().y).toBe(0);
    expect(last(f)).toMatchObject({ up: true });
  });

  it('stays the right way up lower down', async () => {
    const f = await awake();
    f.listeners.get('neo:drag')(f.fromNeo, { phase: 'start' });
    f.listeners.get('neo:drag')(f.fromNeo, { phase: 'move', dx: 0, dy: -200 });
    expect(last(f)?.up).toBeFalsy();
  });
});

// The trial run of Neo on the Decisions API (plans/neo-decisions.md, approved
// 2026-10-16: "yes build it"): after each thing she says, Neo also decides
// from the options on screen and writes what it would have done beside what
// it did. It acts on nothing.
describe('the trial run', () => {
  const SCREEN = { open: { id: 'w-j', title: 'JARVIS for Agentbox', options: [], pictures: [], films: [] }, rows: [], commands: [], canGoBack: false };
  // The trial run belongs to the earlier way; on the Decisions way the pick is acted on.
  async function talking(decideImpl) {
    const f = fakes({ decideImpl });
    fs.mkdirSync(path.join(f.userData, 'neo'), { recursive: true });
    fs.writeFileSync(path.join(f.userData, 'neo', 'prefs.json'), JSON.stringify({ engine: 'tools' }));
    const w = f.neo.wake('test');
    f.finishLoad();
    await w;
    return f;
  }
  const answerScreen = async (f) => {
    for (let i = 0; i < 20; i++) {
      const asked = f.mainSent.filter(([ch, p]) => ch === 'neo:act' && p.name === 'neo_screen');
      if (asked.length) { f.listeners.get('neo:act-result')(f.fromMainWindow, { id: asked.at(-1)[1].id, result: { ok: true, screen: SCREEN } }); return; }
      await tick();
    }
    throw new Error('never asked for the screen');
  };
  const talkLines = (f) => {
    const dir = path.join(f.userData, 'neo', 'talk');
    return fs.readdirSync(dir).flatMap((file) => fs.readFileSync(path.join(dir, file), 'utf8').trim().split('\n')).map((l) => JSON.parse(l));
  };

  it('decides from what is on screen and writes it beside the talk, acting on nothing', async () => {
    const decideImpl = vi.fn(async () => ({ choice: 'later', confidence: 0.97, runnersUp: [{ value: 'close', probability: 0.02 }], ms: 140 }));
    const f = await talking(decideImpl);
    f.listeners.get('neo:log')(f.fromNeo, { who: 'you', text: 'snooze this for ten minutes' });
    await answerScreen(f);
    for (let i = 0; i < 10; i++) await tick();
    const { input, options } = decideImpl.mock.calls[0][0];
    expect(input).toMatch(/JARVIS for Agentbox/);
    expect(input).toMatch(/snooze this for ten minutes/);
    expect(options.map((o) => o.value)).toContain('later');
    const shadow = talkLines(f).find((l) => l.who === 'shadow');
    expect(shadow.text).toMatch(/later \(0\.97\)/);
    expect(shadow.text).toMatch(/Put the open thread "JARVIS for Agentbox" off/);
    expect(f.mainSent.filter(([ch, p]) => ch === 'neo:act' && p.name !== 'neo_screen' && p.name !== 'describe_screen')).toEqual([]);
  });

  it('a failed decision is written down and changes nothing else', async () => {
    const f = await talking(vi.fn(async () => { throw new Error('OpenAI refused the decision (500).'); }));
    f.listeners.get('neo:log')(f.fromNeo, { who: 'you', text: 'next' });
    await answerScreen(f);
    for (let i = 0; i < 10; i++) await tick();
    expect(talkLines(f).find((l) => l.who === 'shadow').text).toMatch(/failed/);
  });

  it('only her words are decided on, not Neo\'s or an action\'s', async () => {
    const decideImpl = vi.fn();
    const f = await talking(decideImpl);
    f.listeners.get('neo:log')(f.fromNeo, { who: 'neo', text: 'One sec.' });
    f.listeners.get('neo:log')(f.fromNeo, { who: 'tool', text: 'next_thread {} -> committed' });
    for (let i = 0; i < 5; i++) await tick();
    expect(decideImpl).not.toHaveBeenCalled();
  });
});

// Live on the Decisions API (2026-10-16): the page hands main what she said;
// main decides, acts through the app, and answers what the voice should say.
describe('deciding live', () => {
  const SCREEN = { open: { id: 'w-j', title: 'JARVIS for Agentbox', options: [], pictures: [], films: [] }, rows: [], commands: [], canGoBack: false };
  async function awake(decideImpl) {
    const f = fakes({ decideImpl });
    const w = f.neo.wake('test');
    f.finishLoad();
    await w;
    return f;
  }
  // Plays the main window: answers what is on screen and every act.
  function playWindow(f, results = {}) {
    let seen = 0;
    const timer = setInterval(() => {
      const acts = f.mainSent.filter(([ch]) => ch === 'neo:act');
      for (; seen < acts.length; seen++) {
        const { id, name } = acts[seen][1];
        const result = name === 'neo_screen' ? { ok: true, screen: SCREEN } : results[name] ?? { ok: true, status: 'committed', said: `did ${name}` };
        f.listeners.get('neo:act-result')(f.fromMainWindow, { id, result });
      }
    }, 1);
    return () => clearInterval(timer);
  }

  it('decides, acts through the app, and answers what to say', async () => {
    const decideImpl = vi.fn(async () => ({ choice: 'close', confidence: 0.96, runnersUp: [], ms: 120 }));
    const f = await awake(decideImpl);
    const stop = playWindow(f, { close_thread: { ok: true, status: 'committed', said: 'Closed JARVIS for Agentbox.' }, brief_open: { ok: true, status: 'committed', said: 'Now open: Pricing page copy.' } });
    const r = await f.handlers.get('neo:decide')(f.fromNeo, { heard: 'close it' });
    stop();
    expect(r.say).toBe('Done. Now open: Pricing page copy.');
    expect(f.mainSent.some(([ch, p]) => ch === 'neo:act' && p.name === 'close_thread' && p.args.id === 'w-j')).toBe(true);
  });

  it('only Neo\'s own window can ask, and only while Neo is awake', async () => {
    const decideImpl = vi.fn();
    const f = await awake(decideImpl);
    expect(await f.handlers.get('neo:decide')(f.fromMainWindow, { heard: 'close it' })).toMatchObject({ say: '' });
    f.listeners.get('neo:closed')(f.fromNeo);
    expect(await f.handlers.get('neo:decide')(f.fromNeo, { heard: 'close it' })).toMatchObject({ say: '' });
    expect(decideImpl).not.toHaveBeenCalled();
  });

  it('a failed decision tells the voice to say so, and does nothing', async () => {
    const f = await awake(vi.fn(async () => { throw new Error('OpenAI refused the decision (500).'); }));
    const stop = playWindow(f);
    const r = await f.handlers.get('neo:decide')(f.fromNeo, { heard: 'next' });
    stop();
    expect(r.say).toMatch(/did not work|could not/i);
    expect(f.mainSent.filter(([ch, p]) => ch === 'neo:act' && p.name !== 'neo_screen')).toEqual([]);
  });

  it('the session is started with the app deciding, unless the earlier way was chosen', async () => {
    const startLiveImpl = vi.fn(async () => ({ sdp: 'v=0 answer', id: 's' }));
    const f = fakes({ startLiveImpl });
    const w = f.neo.wake('test'); f.finishLoad(); await w;
    const stop = playWindow(f);
    await f.handlers.get('neo:start-live')(f.fromNeo, { sdp: 'v=0 offer', outside: false });
    stop();
    expect(startLiveImpl.mock.calls[0][0].session.delegation).toEqual({ type: 'client' });
  });
});
