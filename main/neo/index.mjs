// Neo, the voice of Agentbox (alpha, w-e85fd9144f). Plan: plans/neo-build.md
// in the product's documents.
//
// This process owns everything that must not be in a page: whether Neo is on
// at all, the OpenAI key, the GPT-Live session request, the ⌘ listener, the
// limits on how long a session runs, and the door between the Neo window and
// the app's main window. The Neo page owns the microphone and the audio; the
// main window carries out actions with the app's own functions.
import fs from 'node:fs';
import path from 'node:path';
import { neoEnabled } from './gate.mjs';
import { startLive } from './live.mjs';
import { listenForDoubleCommand } from './cmd-tap.mjs';
import { checkCall, neoSession } from '../../shared/neo-tools.mjs';
import { Name } from '../../shared/product-name.mjs';

const WIDTH = 600;
const HEIGHT = 240;
const MARGIN = 20;
export const SESSION_MAX_S = 20 * 60;
export const DAY_MAX_S = 3 * 60 * 60;
const ACT_TIMEOUT_MS = 10_000;

const today = (now) => new Date(now).toISOString().slice(0, 10);

export function createNeo({
  app, BrowserWindow, ipcMain, screen, powerMonitor, systemPreferences, session: electronSession, globalShortcut,
  mainWindow, preload, load, userData, now = Date.now, listen = listenForDoubleCommand, platform = process.platform,
}) {
  const on = neoEnabled({ userData, platform });
  ipcMain.handle('neo:enabled', () => on);
  if (!on) return { enabled: false };

  const dir = path.join(userData, 'neo');
  fs.mkdirSync(dir, { recursive: true });
  const usageFile = path.join(dir, 'usage.json');
  const readUsage = () => {
    try { const u = JSON.parse(fs.readFileSync(usageFile, 'utf8')); if (u.date === today(now())) return u; } catch {}
    return { date: today(now()), seconds: 0 };
  };
  const writeUsage = (u) => { try { fs.writeFileSync(usageFile, JSON.stringify(u)); } catch {} };
  // What Neo did and why it could not, for whoever looks into "nothing happened".
  const log = (line) => { try { fs.appendFileSync(path.join(dir, 'log.txt'), `${new Date(now()).toISOString()} ${line}\n`); } catch {} };

  let win = null;
  let loaded = null;         // resolves when Neo's page can hear a wake
  let live = false;          // a session is starting or running
  let starting = false;
  // Bumped whenever a session ends or is asked to, so a tool call queued in
  // that session is refused rather than carried out after Neo has gone.
  let generation = 0;
  let ending = false;        // asked to sign off; takes no new work
  let sessionSeconds = 0;
  const seenCalls = new Set();
  let chain = Promise.resolve();
  let reqSeq = 0;
  const waiting = new Map();

  // Neo's page has its own session, so its microphone permission is its own
  // and nothing else in the app gains one.
  const neoSessionStore = electronSession.fromPartition('neo');
  neoSessionStore.setPermissionRequestHandler((wc, permission, done, details) => {
    const audioOnly = permission === 'media' && (details?.mediaTypes ?? []).every((t) => t === 'audio');
    done(!!win && wc === win.webContents && audioOnly);
  });
  neoSessionStore.setPermissionCheckHandler((wc, permission) => permission === 'media' && !!win && wc === win.webContents);

  const fromNeo = (e) => !!win && e.sender === win.webContents;
  const fromMain = (e) => e.sender === mainWindow.webContents;

  function place() {
    const point = screen.getCursorScreenPoint();
    const { workArea } = screen.getDisplayNearestPoint(point);
    win.setBounds({ x: workArea.x + workArea.width - WIDTH - MARGIN, y: workArea.y + workArea.height - HEIGHT - MARGIN, width: WIDTH, height: HEIGHT });
  }

  function ensureWindow() {
    if (win && !win.isDestroyed()) return win;
    win = new BrowserWindow({
      show: false, frame: false, transparent: true, backgroundColor: '#00000000', roundedCorners: false, hasShadow: false,
      resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true,
      // As the corner tag learned: a window that may not take focus hands a
      // click to the main window, which jumps forward. Shown inactive instead.
      focusable: true, acceptFirstMouse: true, alwaysOnTop: true, type: 'panel',
      width: WIDTH, height: HEIGHT,
      // Chimes and Neo's voice play the moment it wakes, with no click in the page.
      webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true, partition: 'neo', backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' },
    });
    win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    win.setIgnoreMouseEvents(true, { forward: true });
    win.on('closed', () => { win = null; loaded = null; live = false; generation++; });
    loaded = new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    load(win);
    return win;
  }

  // Asks the main window to do something and waits for its answer.
  function askMain(name, args = {}) {
    if (mainWindow.isDestroyed()) return Promise.resolve({ ok: false, said: `${Name} is not open.` });
    const id = ++reqSeq;
    return new Promise((resolve) => {
      const timer = setTimeout(() => { waiting.delete(id); resolve({ ok: false, status: 'failed', said: 'The app did not answer in time.' }); }, ACT_TIMEOUT_MS);
      waiting.set(id, (result) => { clearTimeout(timer); resolve(result); });
      mainWindow.webContents.send('neo:act', { id, name, args });
    });
  }
  ipcMain.on('neo:act-result', (e, { id, result } = {}) => {
    if (!fromMain(e)) return;
    const done = waiting.get(id);
    if (done) { waiting.delete(id); done(result ?? { ok: false }); }
  });

  function askSleep(reason) {
    generation++;
    ending = true;
    win?.webContents.send('neo:sleep', { reason });
  }

  async function wake(source) {
    log(`wake ${source}${live ? ' (asleep now)' : ''}`);
    if (live) { askSleep('tapped'); return; }
    if (starting) return;
    starting = true;
    const g = generation;
    try {
      const usage = readUsage();
      ensureWindow();
      place();
      win.showInactive();
      // A wake sent before the page has loaded is lost, and Neo would be
      // marked live with nothing listening.
      await loaded;
      if (!win || g !== generation) return;
      if (usage.seconds >= DAY_MAX_S) { win.webContents.send('neo:resting', {}); return; }
      if (systemPreferences.getMediaAccessStatus('microphone') !== 'granted') {
        const granted = await systemPreferences.askForMediaAccess('microphone').catch(() => false);
        if (!granted) { win?.webContents.send('neo:no-mic', {}); return; }
      }
      if (!win || g !== generation) return;
      live = true;
    } finally {
      starting = false;
    }
    if (!live) return;
    ending = false;
    sessionSeconds = 0;
    seenCalls.clear();
    const outside = !mainWindow.isFocused();
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('neo:mode', { on: true });
    win.webContents.send('neo:wake', { outside, source });
  }

  ipcMain.handle('neo:start-live', async (e, { sdp, outside } = {}) => {
    if (!fromNeo(e) || !live) return { ok: false, error: 'Neo is not awake.' };
    const screenNow = await askMain('describe_screen', { outside: !!outside });
    try {
      const answer = await startLive({ sdp, session: neoSession({ screen: screenNow?.said ?? '' }) });
      log('session started');
      return { ok: true, sdp: answer.sdp };
    } catch (err) {
      log(`session failed ${err.message}`);
      return { ok: false, error: err.message };
    }
  });

  // One tool call from GPT-Live's backend, as the page received it. Checked,
  // run once, and run one at a time.
  ipcMain.handle('neo:tool', (e, { callId, name, args } = {}) => {
    if (!fromNeo(e) || !live || ending) return { ok: false, status: 'refused', said: 'Neo is not awake.' };
    if (typeof callId !== 'string' || seenCalls.has(callId)) return { ok: false, status: 'refused', said: 'Already done.' };
    seenCalls.add(callId);
    const checked = checkCall(name, args);
    if (!checked.ok) return { ok: false, status: 'refused', said: checked.error };
    if (name === 'sign_off') {
      generation++; ending = true;
      const g = generation;
      setTimeout(() => { if (live && g === generation) win?.webContents.send('neo:sleep', { reason: 'asked' }); }, 1500);
      return { ok: true, status: 'committed', said: 'Signing off.' };
    }
    const gen = generation;
    const run = chain.then(() => (live && gen === generation
      ? askMain(name, checked.args)
      : { ok: false, status: 'refused', said: 'Neo has signed off, so that was not done.' }));
    chain = run.catch(() => {});
    return run;
  });

  ipcMain.on('neo:usage', (e, { seconds } = {}) => {
    if (!fromNeo(e) || !Number.isFinite(seconds)) return;
    const added = Math.max(0, seconds - sessionSeconds);
    sessionSeconds = seconds;
    const usage = readUsage();
    usage.seconds += added;
    writeUsage(usage);
    if (sessionSeconds >= SESSION_MAX_S || usage.seconds >= DAY_MAX_S) askSleep('limit');
  });

  ipcMain.on('neo:closed', (e) => {
    if (!fromNeo(e)) return;
    live = false;
    generation++;
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('neo:mode', { on: false });
    setTimeout(() => { if (!live) win?.hide(); }, 900);
  });

  ipcMain.on('neo:clickable', (e, on) => {
    if (fromNeo(e)) win?.setIgnoreMouseEvents(!on, { forward: true });
  });

  // Lock or sleep ends a conversation at once.
  const hush = () => { if (live) askSleep('lock'); else if (starting) generation++; };

  // The page is signing off on its own (the orb clicked, idle): no more work
  // from this session, even before the service has closed it.
  ipcMain.on('neo:ending', (e) => {
    if (!fromNeo(e) || !live) return;
    generation++;
    ending = true;
  });
  powerMonitor.on('lock-screen', hush);
  powerMonitor.on('suspend', hush);

  // Tap ⌘ twice. If the listener cannot run (no Input Monitoring yet, or no
  // compiler), ⌃⌥⌘N wakes Neo instead so the alpha can still be tried.
  let fallback = false;
  const useFallback = () => {
    if (fallback) return;
    fallback = globalShortcut.register('Control+Alt+Command+N', () => wake('fallback'));
  };
  // Said once a launch, on screen, so a ⌘⌘ that cannot work is not just silence.
  let noticed = false;
  const notice = (text) => {
    if (noticed) return;
    noticed = true;
    ensureWindow();
    place();
    win.showInactive();
    loaded.then(() => {
      win?.webContents.send('neo:notice', { text });
      setTimeout(() => { if (!live) win?.hide(); }, 10_000);
    });
  };
  const SAY = {
    'no-permission': `To wake me by tapping ⌘ twice, turn on Input Monitoring for the app that opened ${Name} (System Settings, Privacy & Security), then reopen ${Name}. ⌃⌥⌘N wakes me meanwhile.`,
    failed: 'I could not set up tapping ⌘ twice on this Mac. ⌃⌥⌘N wakes me instead.',
    stopped: `Tapping ⌘ twice stopped working. ⌃⌥⌘N wakes me until ${Name} reopens.`,
  };
  const listener = listen({
    outDir: dir,
    onWake: () => wake('double-command'),
    onState: (state, why) => {
      log(`listener ${state}${why ? ` ${String(why).slice(0, 300)}` : ''}`);
      if (!SAY[state]) return;
      useFallback();
      notice(SAY[state]);
    },
  });
  app.on('will-quit', () => { listener.stop(); if (fallback) globalShortcut.unregister('Control+Alt+Command+N'); });

  return { enabled: true, wake };
}
