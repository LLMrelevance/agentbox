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
import { getMic, micOwner } from './mic.mjs';
import { decide, answerQuestion, composeReply, composeMemory } from './decide.mjs';
import { runDecision } from './decided.mjs';
import { openMemory } from './memory.mjs';
import { buildOptions } from '../../shared/neo-options.mjs';
import { checkCall, neoSession, PACES } from '../../shared/neo-tools.mjs';
import { Name } from '../../shared/product-name.mjs';

const WIDTH = 600;
const HEIGHT = 240;
const MARGIN = 20;
export const SESSION_MAX_S = 20 * 60;
export const DAY_MAX_S = 3 * 60 * 60;
const ACT_TIMEOUT_MS = 10_000;
// "Maybe every few minutes of usage": talk is handed to a review once this much has built up.
export const REVIEW_AFTER_S = 180;
const WHO = new Set(['you', 'neo', 'tool']);

const today = (now) => new Date(now).toISOString().slice(0, 10);

export function createNeo({
  app, BrowserWindow, ipcMain, screen, powerMonitor, systemPreferences, session: electronSession, globalShortcut,
  mainWindow, preload, load, userData, now = Date.now, listen = listenForDoubleCommand, platform = process.platform,
  shell = { openExternal: () => {} }, owner = micOwner(), getMicImpl = getMic, startLiveImpl = startLive,
  // Handed the transcripts of every few minutes of talk, for a review that
  // patches what went wrong (main/main.mjs files them on a thread).
  onReview = null,
  // The trial run on the Decisions API: decides from what is on screen and
  // writes the pick beside the talk, acting on nothing (plans/neo-decisions.md).
  decideImpl = decide,
  answerImpl = answerQuestion,
  composeImpl = composeReply,
  rememberImpl = composeMemory,
}) {
  const on = neoEnabled({ userData, platform });
  ipcMain.handle('neo:enabled', () => on);
  if (!on) return { enabled: false };

  const dir = path.join(userData, 'neo');
  fs.mkdirSync(dir, { recursive: true });
  const usageFile = path.join(dir, 'usage.json');
  // Where she dragged the orb and how fast she wants Neo to talk.
  const prefsFile = path.join(dir, 'prefs.json');
  // What Neo keeps between sessions: the instructions written on the Neo page
  // in Settings, and the lines it was told to remember (./memory.mjs).
  const memory = openMemory({ dir, now });
  const readPrefs = () => { try { const p = JSON.parse(fs.readFileSync(prefsFile, 'utf8')); return p && typeof p === 'object' ? p : {}; } catch { return {}; } };
  const writePrefs = (change) => { try { fs.writeFileSync(prefsFile, JSON.stringify({ ...readPrefs(), ...change })); } catch {} };
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
  // This session's transcript, on this Mac only.
  let talkFile = null;
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

  // The whole window stays on the display it is mostly on.
  function within(x, y) {
    const { workArea: a } = screen.getDisplayNearestPoint({ x: Math.round(x + WIDTH / 2), y: Math.round(y + HEIGHT / 2) });
    return {
      x: Math.round(Math.min(Math.max(x, a.x), a.x + a.width - WIDTH)),
      y: Math.round(Math.min(Math.max(y, a.y), a.y + a.height - HEIGHT)),
      width: WIDTH, height: HEIGHT,
    };
  }

  // Which side of the orb the card sits on: 'right' puts the orb at the
  // window's right with the card to its left. Over the left half of a display
  // it flips, so the card always has room.
  const ORB_X = { right: WIDTH - 24 - 75, left: 24 + 75 };
  let side = readPrefs().side === 'left' ? 'left' : 'right';
  // And top to bottom: in the upper third the orb sits at the window's top.
  const ORB_Y = { down: HEIGHT - 24 - 75, up: 24 + 75 };
  let up = readPrefs().up === true;
  const sideFor = (b) => {
    const orbX = b.x + ORB_X[side];
    const { workArea: a } = screen.getDisplayNearestPoint({ x: Math.round(orbX), y: Math.round(b.y + HEIGHT / 2) });
    return orbX < a.x + a.width / 2 ? 'left' : 'right';
  };
  const upFor = (b) => {
    const orbY = b.y + ORB_Y[up ? 'up' : 'down'];
    const { workArea: a } = screen.getDisplayNearestPoint({ x: Math.round(b.x + WIDTH / 2), y: Math.round(orbY) });
    return orbY < a.y + a.height / 3;
  };
  const tellSide = () => win?.webContents.send('neo:side', { side, up });

  // WHAT THE ORB IS SITTING ON TOP OF (w-5520063011). The app fades the
  // summary's Status and Owner block while the orb covers it and brings it
  // back when the orb is dragged off, and only this process knows both
  // windows' bounds. A drag sends a frame per pointer move and most land on
  // the same pixel, so an unchanged place is not sent again.
  let toldOrb = '';
  function tellOrb() {
    if (!win || win.isDestroyed() || mainWindow.isDestroyed()) return;
    const b = win.getBounds();
    const app = mainWindow.getContentBounds();
    const at = { x: b.x + ORB_X[side] - app.x, y: b.y + ORB_Y[up ? 'up' : 'down'] - app.y, r: 75 };
    const key = `${at.x},${at.y}`;
    if (key === toldOrb) return;
    toldOrb = key;
    mainWindow.webContents.send('neo:orb', at);
  }
  // Moving or resizing the app window changes what the orb is over without
  // the orb itself having moved.
  mainWindow.on('move', tellOrb);
  mainWindow.on('resize', tellOrb);

  function place() {
    const kept = readPrefs().at;
    if (kept && Number.isFinite(kept.x) && Number.isFinite(kept.y)) { win.setBounds(within(kept.x, kept.y)); return; }
    side = 'right';
    up = false;
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
    // Above the corner tag, which also floats: at the same level whichever was
    // shown last sat on top, so the orb could end up under a window that took
    // the pointer meant for it (w-5520063011).
    win.setAlwaysOnTop(true, 'pop-up-menu');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    win.setIgnoreMouseEvents(true, { forward: true });
    win.on('closed', () => { win = null; loaded = null; live = false; generation++; });
    loaded = new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
    load(win);
    return win;
  }

  // Asks the main window to do something and waits for its answer.
  function askMain(name, args = {}, heard = '') {
    if (mainWindow.isDestroyed()) return Promise.resolve({ ok: false, said: `${Name} is not open.` });
    const id = ++reqSeq;
    return new Promise((resolve) => {
      const timer = setTimeout(() => { waiting.delete(id); resolve({ ok: false, status: 'failed', said: 'The app did not answer in time.' }); }, ACT_TIMEOUT_MS);
      waiting.set(id, (result) => { clearTimeout(timer); resolve(result); });
      mainWindow.webContents.send('neo:act', { id, name, args, heard });
    });
  }
  // What Neo is saying, so the main window can show the picture it names.
  ipcMain.on('neo:follow', (e, { said } = {}) => {
    if (!fromNeo(e) || !live || ending || typeof said !== 'string' || !said.trim()) return;
    void askMain('follow', { said: said.slice(-2000) });
  });
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
      win.moveTop();
      // Afresh, because the app page may have been reloaded since the last
      // wake and a reloaded page knows nothing about where the orb is.
      toldOrb = '';
      tellOrb();
      // A wake sent before the page has loaded is lost, and Neo would be
      // marked live with nothing listening.
      await loaded;
      if (!win || g !== generation) return;
      if (usage.seconds >= DAY_MAX_S) { win.webContents.send('neo:resting', {}); return; }
      if (systemPreferences.getMediaAccessStatus('microphone') !== 'granted') {
        const granted = await systemPreferences.askForMediaAccess('microphone').catch(() => false);
        if (!granted) { log(`no microphone (${systemPreferences.getMediaAccessStatus('microphone')}, asked for ${owner.id ?? 'unknown'})`); win?.webContents.send('neo:no-mic', { app: owner.name }); return; }
      }
      if (!win || g !== generation) return;
      live = true;
    } finally {
      starting = false;
    }
    if (!live) return;
    ending = false;
    decisionState = {};
    said.length = 0;
    sessionSeconds = 0;
    talkFile = path.join(dir, 'talk', `${new Date(now()).toISOString().replace(/[:.]/g, '-')}.jsonl`);
    seenCalls.clear();
    const outside = !mainWindow.isFocused();
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('neo:mode', { on: true });
    tellSide();
    win.webContents.send('neo:wake', { outside, source });
  }

  ipcMain.handle('neo:start-live', async (e, { sdp, outside } = {}) => {
    if (!fromNeo(e) || !live) return { ok: false, error: 'Neo is not awake.' };
    // Tells the app whether she is in another app; what is on screen is not
    // given to the session (shared/neo-tools.mjs neoSession says why).
    await askMain('describe_screen', { outside: !!outside });
    try {
      const answer = await startLiveImpl({ sdp, session: neoSession({ pace: readPrefs().pace, engine: engine(), remembered: memory.remembered() }) });
      log('session started');
      return { ok: true, sdp: answer.sdp };
    } catch (err) {
      log(`session failed ${err.message}`);
      return { ok: false, error: err.message };
    }
  });

  // One tool call from GPT-Live's backend, as the page received it. Checked,
  // run once, and run one at a time.
  ipcMain.handle('neo:tool', (e, { callId, name, args, heard } = {}) => {
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
      ? askMain(name, checked.args, typeof heard === 'string' ? heard.slice(0, 500) : '')
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

  const writeTalk = (file, who, text) => {
    if (!file) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, `${JSON.stringify({ at: new Date(now()).toISOString(), who, text: text.slice(0, 4000) })}\n`);
    } catch {}
  };

  ipcMain.on('neo:log', (e, { who, text } = {}) => {
    if (!fromNeo(e) || !talkFile || !WHO.has(who) || typeof text !== 'string' || !text.trim()) return;
    writeTalk(talkFile, who, text);
    if (who === 'you' || who === 'neo') { said.push({ who, text }); if (said.length > 12) said.shift(); }
    // The trial run only matters while the earlier way is the one acting.
    if (who === 'you' && engine() === 'tools') void shadowDecide(text, talkFile);
  });

  // Which way decides: the app with the Decisions API, or the earlier tool model.
  const engine = () => (readPrefs().engine === 'tools' ? 'tools' : 'decisions');
  // What waits on her yes, for this session only.
  let decisionState = {};
  // The last few turns, so "what I just told you" can be found.
  const said = [];

  // LIVE ON THE DECISIONS API: what she said, handed over by the voice, is
  // decided, done through the app, and answered with what the voice says.
  ipcMain.handle('neo:decide', async (e, { heard } = {}) => {
    if (!fromNeo(e) || !live || ending || typeof heard !== 'string') return { say: '' };
    const gen = generation;
    const file = talkFile;
    const guarded = (name, args, said) => (live && gen === generation ? askMain(name, args, said) : Promise.resolve({ ok: false, status: 'refused', said: 'Neo has signed off, so that was not done.' }));
    try {
      const r = await runDecision({ heard, askMain: guarded, state: decisionState, decideImpl, now, answer: answerImpl, compose: composeImpl, history: said.slice(), memory, rememberWith: rememberImpl });
      writeTalk(file, 'decision', `picked ${r.choice ?? '?'} (${r.confidence?.toFixed?.(2) ?? '?'}) in ${r.ms ?? '?'} ms -> ${r.say || '(nothing)'}`);
      if (r.signoff) { generation++; ending = true; setTimeout(() => { if (live) win?.webContents.send('neo:sleep', { reason: 'asked' }); }, 1500); }
      return { say: r.say ?? '' };
    } catch (err) {
      writeTalk(file, 'decision', `failed: ${err.message}`);
      return { say: 'Tell the person that did not work just now.' };
    }
  });

  // THE TRIAL RUN. What the Decisions API would have done with what she just
  // said, from the options on screen as they are now. Written down, never done.
  async function shadowDecide(said, file) {
    const got = await askMain('neo_screen');
    if (!got?.ok || !got.screen) return;
    const { version, list } = buildOptions(got.screen);
    const open = got.screen.open;
    const input = `${open ? `Screen: the open thread is "${String(open.title).slice(0, 70)}" (${(open.options ?? []).length} numbered options, ${(open.pictures ?? []).length} pictures).` : 'Screen: no thread is open.'} ${(got.screen.rows ?? []).length} threads are listed.\nThe person just said: "${said.slice(0, 600)}"`;
    try {
      const r = await decideImpl({ input, options: list });
      const picked = list.find((o) => o.value === r.choice);
      const others = (r.runnersUp ?? []).map((p) => `${p.value} ${p.probability.toFixed(2)}`).join(', ');
      writeTalk(file, 'shadow', `would do: ${r.choice} (${r.confidence?.toFixed(2) ?? '?'}) ${picked?.description ?? ''} [${r.ms} ms, ${list.length} options, v${version}${others ? `; next: ${others}` : ''}]`);
    } catch (err) {
      writeTalk(file, 'shadow', `failed: ${err.message}`);
    }
  }

  // After a session, its talk counts toward the next review.
  function countTowardReview() {
    const was = readPrefs().review ?? { seconds: 0, files: [] };
    const files = [...(was.files ?? []), ...(talkFile && fs.existsSync(talkFile) ? [talkFile] : [])];
    const seconds = (was.seconds ?? 0) + sessionSeconds;
    talkFile = null;
    if (files.length && seconds >= REVIEW_AFTER_S && onReview) {
      writePrefs({ review: { seconds: 0, files: [] } });
      log(`review after ${seconds}s of talk`);
      try { onReview({ files, seconds }); } catch (err) { log(`review failed ${err.message}`); }
      return;
    }
    writePrefs({ review: { seconds, files } });
  }

  ipcMain.on('neo:closed', (e) => {
    if (!fromNeo(e)) return;
    if (live) countTowardReview();
    live = false;
    generation++;
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('neo:mode', { on: false });
    setTimeout(() => { if (!live) win?.hide(); }, 900);
  });

  // The card's "Allow microphone" press (./mic.mjs). Then straight into a session.
  ipcMain.handle('neo:allow-mic', async (e) => {
    if (!fromNeo(e)) return 'refused';
    const got = await getMicImpl({ systemPreferences, openExternal: (url) => shell.openExternal(url), owner });
    log(`allow microphone: ${got}`);
    if (got === 'granted') void wake('mic-allowed');
    return got;
  });

  // Dragging the orb moves the window with it; where it ends is kept.
  let dragFrom = null;
  ipcMain.on('neo:drag', (e, { phase, dx, dy } = {}) => {
    if (!fromNeo(e) || !win) return;
    if (phase === 'start') { dragFrom = win.getBounds(); return; }
    if (!dragFrom) return;
    if (phase === 'move' && Number.isFinite(dx) && Number.isFinite(dy)) {
      const next = { x: dragFrom.x + dx, y: dragFrom.y + dy };
      const now = sideFor(next);
      // The orb stays under the pointer as the card changes sides.
      if (now !== side) { const shift = ORB_X[side] - ORB_X[now]; dragFrom.x += shift; next.x += shift; side = now; tellSide(); }
      const nowUp = upFor(next);
      if (nowUp !== up) { const shift = ORB_Y[up ? 'up' : 'down'] - ORB_Y[nowUp ? 'up' : 'down']; dragFrom.y += shift; next.y += shift; up = nowUp; tellSide(); }
      win.setBounds(within(next.x, next.y));
      tellOrb();
      return;
    }
    if (phase === 'end') { const { x, y } = win.getBounds(); writePrefs({ at: { x, y }, side, up }); dragFrom = null; }
  });

  // How fast Neo talks, from the next session on. Asked with no value, it answers.
  ipcMain.handle('neo:pace', (_e, pace) => {
    if (typeof pace === 'string' && Object.hasOwn(PACES, pace)) writePrefs({ pace });
    return Object.hasOwn(PACES, readPrefs().pace ?? '') ? readPrefs().pace : 'normal';
  });

  // Whether Neo's words show on the card or it only talks. Asked with no value, it answers.
  ipcMain.handle('neo:captions', (_e, on) => {
    if (typeof on === 'boolean') writePrefs({ captions: on });
    return readPrefs().captions !== false;
  });

  // THE NEO PAGE IN SETTINGS (w-6a1c405642). One door for the whole thing:
  // asked with nothing it reads, and every change answers with what is now
  // kept, so the page never draws a guess at what was saved. `document` is
  // the memories as the page writes them, one entry a line.
  ipcMain.handle('neo:memory', (_e, change = {}) => {
    const answer = (extra) => ({ ...extra, ...memory.read(), document: memory.document() });
    try {
      const c = change && typeof change === 'object' ? change : {};
      if (typeof c.instructions === 'string') memory.setInstructions(c.instructions);
      if (typeof c.memories === 'string') memory.setMemories(c.memories);
      if (typeof c.add === 'string') memory.add(c.add);
      if (typeof c.forget === 'string') memory.forget(c.forget);
      return answer({ ok: true });
    } catch (err) {
      log(`memory failed ${err.message}`);
      return answer({ ok: false, error: err.message });
    }
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
