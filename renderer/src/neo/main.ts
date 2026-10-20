// Neo's window (main/neo/index.mjs opens it). Wakes on tap-⌘-twice, opens a
// GPT-Live session over WebRTC (the offer goes to the main process, which
// holds the key and starts the session), shows Neo's words, and signs off.
import './neo.css';
import { orbDrag } from './orb-drag';
import { dustOrb } from './dust';
import { chime } from './chime';
import { liveDriver } from './live-driver';
import { canRenew, voiceConnection } from './connection';

type NeoBridge = {
  onWake(fn: (p: { outside: boolean }) => void): () => void;
  onSleep(fn: (p: { reason: string }) => void): () => void;
  onResting(fn: () => void): () => void;
  onNoMic(fn: (p: { app?: string | null }) => void): () => void;
  allowMic(): Promise<'granted' | 'settings' | 'refused'>;
  onNotice(fn: (p: { text: string }) => void): () => void;
  onSide(fn: (p: { side: 'left' | 'right'; up?: boolean }) => void): () => void;
  startLive(sdp: string, outside: boolean, transportId: string): Promise<{ ok: boolean; sdp?: string; error?: string }>;
  activateLive(transportId: string): Promise<{ok:boolean}>;
  tool(callId: string, name: string, args: string, heard: string, transportId: string): Promise<unknown>;
  decide(heard: string, transportId: string): Promise<{ say: string; context?: string }>;
  audit(heard: string, transportId: string): Promise<boolean>;
  follow(said: string): void;
  drag(phase: 'start' | 'move' | 'end', dx?: number, dy?: number): void;
  pace(value?: string): Promise<string>;
  captions(on?: boolean): Promise<boolean>;
  usage(seconds: number, transportId: string): void;
  ending(): void;
  log(line: { who: string; text: string }): void;
  closed(): void;
  clickable(on: boolean): void;
};
const neo = (window as unknown as { neo: NeoBridge }).neo;

const root = document.getElementById('neo')!;
const words = document.getElementById('words')!;
const label = document.getElementById('label')!;
const actButton = document.getElementById('act') as HTMLButtonElement;
const orbCanvas = document.getElementById('orb') as HTMLCanvasElement;
const orb = dustOrb(orbCanvas);

// Quiet for this long and Neo signs off, so an open mic never runs up cost.
const IDLE_MS = 3 * 60 * 1000;

let pc: RTCPeerConnection | null = null;
let channel: RTCDataChannel | null = null;
let mic: MediaStream | null = null;
let player: HTMLAudioElement | null = null;
let meter: number | null = null;
let meterCtx: AudioContext | null = null;
let idle: number | null = null;
let closing = false;
let closeTimer: number | null = null;
// Which wake is current. A start still waiting on the mic or OpenAI checks
// it after every wait, so a sleep or lock in the meantime cannot leave the
// mic open behind it.
let gen = 0;
type Connection = ReturnType<typeof voiceConnection>;
let connection: Connection | null = null;
const connections = new Set<Connection>();
let lastActivity = 0, busy = 0, rotating = false, forceRenew = false, repeatAfterRenew = false, retryAt = 0;
let outsideAtWake = false;
let renewTimer: ReturnType<typeof setInterval> | null = null;

function say(text: string) {
  words.textContent = text;
  root.classList.toggle('has-words', !!text);
}
function poke() {
  if (idle) clearTimeout(idle);
  idle = window.setTimeout(() => sleep('idle'), IDLE_MS);
}

// The orb breathes with Neo's voice.
function listenTo(stream: MediaStream) {
  if (meter) cancelAnimationFrame(meter);
  void meterCtx?.close();
  const ctx = meterCtx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  const input = mic ? ctx.createAnalyser() : null;
  if (input && mic) ctx.createMediaStreamSource(mic).connect(input);
  const inputData = input ? new Uint8Array(input.fftSize) : null;
  const energy = (samples: Uint8Array) => {
    let sum = 0;
    for (const v of samples) sum += ((v - 128) / 128) ** 2;
    return Math.sqrt(sum / samples.length);
  };
  const tick = () => {
    if (ctx !== meterCtx) return;
    analyser.getByteTimeDomainData(data);
    const level = Math.min(1, energy(data) * 6);
    if (input && inputData) input.getByteTimeDomainData(inputData);
    if (level > 0.05 || (inputData && energy(inputData) > 0.01)) lastActivity = Date.now();
    orb.setLevel(level);
    if (level > 0.05) label.textContent = 'Neo · speaking';
    meter = requestAnimationFrame(tick);
  };
  tick();
}

// Neo's words as they come, so the main window can put up the picture Neo is
// naming. At most one send per 150 ms, always with the newest words.
let followTimer: ReturnType<typeof setTimeout> | null = null;
let followText = '';
function follow(text: string) {
  followText = text;
  if (followTimer) return;
  followTimer = setTimeout(() => { followTimer = null; neo.follow(followText); }, 150);
}

// One driver per session, bound to that session's channel, so neither its
// words nor a slow tool's answer can reach the next one.
function driverFor(ch: RTCDataChannel, transportId: string) {
  return liveDriver({
    send: (event) => { if (channel === ch && ch.readyState === 'open') ch.send(JSON.stringify(event)); },
    tool: async (callId, name, args, heard) => {
      if (channel !== ch) return {ok:false,said:'The voice connection changed.'};
      busy++; poke();
      try { return await neo.tool(callId, name, args, heard, transportId); } finally { busy--; }
    },
    onWords: (text) => { if (channel === ch) { poke(); say(text); follow(text); } },
    onUsage: (seconds) => neo.usage(seconds, transportId),
    onClosed: () => { if (channel === ch) finish(); },
    onLine: (line) => { if (channel === ch) neo.log(line); },
    onActivity: () => { if (channel === ch) { lastActivity = Date.now(); poke(); } },
    onUndelegated: (heard) => channel === ch ? neo.audit(heard, transportId) : Promise.resolve(false),
    onRecovery: (repeat) => {
      if (channel !== ch) return;
      forceRenew = true; repeatAfterRenew ||= repeat;
      say(repeat ? 'That request was not completed. Refreshing the voice connection.' : 'The voice reply could not be confirmed. Refreshing the connection.');
    },
    // The app decides what she asked for (main/neo/decided.mjs).
    onDelegate: async (_id, heard) => {
      if (channel !== ch) return {say:''};
      busy++; poke();
      try { return await neo.decide(heard, transportId); } finally { busy--; }
    },
  });
}

function prepareConnection(stream: MediaStream, outside: boolean) {
  const c = voiceConnection({stream,outside,start:(sdp,wasOutside,id)=>neo.startLive(sdp,wasOutside,id),driverFor,
    onTrack:(ch,remote)=>{if(channel===ch)listenTo(remote);},onClosed:(ch)=>{if(channel===ch)finish();}});
  connections.add(c);
  return c;
}

function useConnection(c: Connection) {
  const previous = connection;
  connection = c; pc = c.peer; channel = c.channel; player = c.player;
  c.activate();
  lastActivity = Date.now();
  if (previous) void previous.retire().finally(() => connections.delete(previous));
}

async function renew() {
  const previous = connection;
  if (!previous || !mic || closing || rotating || Date.now() < retryAt || !canRenew({born:previous.born,activity:lastActivity,busy,forced:forceRenew})) return;
  rotating = true;
  const my = gen, activity = lastActivity;
  previous.driver.checkpoint?.();
  let candidate: Connection | null = null;
  try {
    candidate = prepareConnection(mic, outsideAtWake);
    await candidate.ready;
    if (my !== gen || closing || connection !== previous || lastActivity !== activity || busy) return;
    const activated = await neo.activateLive(candidate.id);
    if (!activated.ok || my !== gen || closing) return;
    const interrupted = lastActivity !== activity;
    useConnection(candidate);
    if (repeatAfterRenew || interrupted) candidate.channel.send(JSON.stringify({type:'session.commentary.append',delegation_id:null,content:interrupted ? 'The voice connection refreshed while you spoke. Check the current screen and repeat anything still needed.' : 'The voice connection refreshed. That last request was not completed; please repeat it.'}));
    forceRenew = false; repeatAfterRenew = false;
  } catch (error) {
    retryAt = Date.now() + 60_000;
    neo.log({who:'tool',text:`Voice renewal failed: ${String((error as Error).message)}`});
  } finally {
    if (candidate && candidate !== connection) {
      const unused = candidate;
      if (unused.channel.readyState === 'open') void unused.retire().finally(() => connections.delete(unused));
      else { unused.close(); connections.delete(unused); }
    }
    rotating = false;
  }
}

async function wake({ outside }: { outside: boolean }) {
  dropMicCard();
  const my = ++gen;
  const stale = () => my !== gen || closing;
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  closing = false;
  chime('wake');
  root.classList.add('awake');
  label.textContent = 'Neo · listening';
  say('');
  poke();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (stale()) { stream.getTracks().forEach((t) => t.stop()); return; }
    mic = stream;
    outsideAtWake = outside; lastActivity = Date.now();
    forceRenew = false; repeatAfterRenew = false; retryAt = 0;
    const c = prepareConnection(stream, outside);
    await c.ready;
    if (stale()) { c.close(); connections.delete(c); return; }
    if (!(await neo.activateLive(c.id)).ok) throw new Error('The voice connection could not be activated.');
    if (stale()) { c.close(); connections.delete(c); return; }
    useConnection(c);
    renewTimer = setInterval(() => { void renew(); }, 1000);
  } catch (err) {
    if (stale()) return;
    say(String((err as Error).message || err));
    closing = true;
    closeTimer = window.setTimeout(() => finish(), 15_000);
  }
}

function sleep(reason: string) {
  if (closing) return;
  closing = true;
  neo.ending();
  // The mic goes off now, not when the service gets round to closing.
  mic?.getTracks().forEach((t) => t.stop());
  connections.forEach((c) => c.stopInput());
  if (channel?.readyState === 'open') {
    channel.send(JSON.stringify({ type: 'session.close' }));
    closeTimer = window.setTimeout(() => finish(), 4000);
  } else finish();
  if (reason === 'limit') say('That is a long session, so I am taking a break. Tap ⌘ twice to start again.');
}

function finish() {
  gen++;
  if (renewTimer) clearInterval(renewTimer);
  renewTimer = null;
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  // Main still hears that Neo is off even when there was nothing to tear
  // down, or it would stay marked live with nothing listening.
  if (!pc && !mic && !root.classList.contains('awake')) { neo.closed(); return; }
  if (idle) clearTimeout(idle);
  if (meter) cancelAnimationFrame(meter);
  void meterCtx?.close();
  meterCtx = null;
  mic?.getTracks().forEach((t) => t.stop());
  channel = null; pc = null; player = null; connection = null;
  connections.forEach((c) => c.close()); connections.clear();
  mic = null;
  orb.setLevel(0);
  chime('sleep');
  root.classList.remove('awake');
  setTimeout(() => say(''), 400);
  neo.closed();
}

neo.onWake(wake);
// Over the left half of the screen the card sits on the orb's right.
neo.onSide(({ side, up }) => { root.classList.toggle('left', side === 'left'); root.classList.toggle('up', !!up); });
neo.onSleep(({ reason }) => sleep(reason));
neo.onResting(() => { root.classList.add('awake'); say('I have talked for three hours today, so I am resting until tomorrow.'); setTimeout(() => { root.classList.remove('awake'); neo.closed(); }, 5000); });
// Main hides the window again on its own; this is not a session.
neo.onNotice(({ text }) => { if (pc) return; root.classList.add('awake', 'must-show'); label.textContent = 'Neo'; say(text); setTimeout(() => { if (!pc) { root.classList.remove('awake', 'must-show'); say(''); } }, 9500); });
// macOS will not ask again for an app it was once told no for, so the card
// carries the press that clears that and asks (main/neo/mic.mjs).
let micCard: number | null = null;
const dropMicCard = () => {
  if (micCard) clearTimeout(micCard);
  micCard = null;
  actButton.hidden = true;
  actButton.onclick = null;
  root.classList.remove('must-show');
};
neo.onNoMic(({ app }) => {
  root.classList.add('awake', 'must-show');
  label.textContent = 'Neo';
  say(app ? `I need the microphone. ${app} was told no once, so macOS will not ask again by itself.` : 'I need the microphone.');
  actButton.textContent = 'Allow microphone';
  actButton.disabled = false;
  actButton.hidden = false;
  const close = () => { dropMicCard(); if (!pc) { root.classList.remove('awake'); say(''); neo.closed(); } };
  actButton.onclick = async () => {
    if (micCard) clearTimeout(micCard);
    actButton.disabled = true;
    actButton.textContent = 'Asking…';
    const got = await neo.allowMic().catch(() => 'refused' as const);
    if (got === 'granted') { dropMicCard(); return; }
    actButton.hidden = true;
    say('Turn on the switch in the list that just opened, then tap ⌘ twice.');
    micCard = window.setTimeout(close, 20_000);
  };
  micCard = window.setTimeout(close, 20_000);
});

// Only the orb, the card and the speed row take the pointer; everywhere else
// clicks reach the app beneath. Not let go of mid-drag, or the drag drops.
const paceRow = document.getElementById('pace')!;
// A press on the orb that moves drags Neo around the screen; one that does
// not is the click that sends Neo to sleep (./orb-drag.ts).
const drag = orbDrag({
  send: (phase, dx, dy) => {
    orbCanvas.classList.toggle('dragging', phase === 'move');
    neo.drag(phase, dx, dy);
  },
  sleep: () => sleep('clicked'),
});
for (const el of [orbCanvas, document.getElementById('card')!, paceRow]) {
  el.addEventListener('mouseenter', () => neo.clickable(true));
  el.addEventListener('mouseleave', () => { if (!drag.pressed()) neo.clickable(false); });
}
orbCanvas.addEventListener('pointerdown', (e) => {
  orbCanvas.setPointerCapture(e.pointerId);
  drag.down(e);
});
orbCanvas.addEventListener('pointermove', (e) => drag.move(e));
orbCanvas.addEventListener('pointerup', () => drag.up());
orbCanvas.addEventListener('pointercancel', () => drag.cancel());
orbCanvas.addEventListener('lostpointercapture', () => drag.cancel());
window.addEventListener('blur', () => drag.blur());

// The speed row shows while the pointer is on the orb or on the row itself.
let paceHide: number | null = null;
const showPace = (on: boolean) => {
  if (paceHide) clearTimeout(paceHide);
  if (on) paceRow.classList.add('show');
  else paceHide = window.setTimeout(() => paceRow.classList.remove('show'), 500);
};
for (const el of [orbCanvas, paceRow]) {
  el.addEventListener('mouseenter', () => { if (!drag.pressed()) showPace(true); });
  el.addEventListener('mouseleave', () => showPace(false));
}
const markPace = (pace: string) => {
  for (const b of paceRow.querySelectorAll<HTMLButtonElement>('button[data-pace]')) b.classList.toggle('on', b.dataset.pace === pace);
};
// Captions on or off: the card with Neo's words, or only the voice.
const captionsButton = document.getElementById('captions')!;
const markCaptions = (on: boolean) => { captionsButton.classList.toggle('on', on); root.classList.toggle('no-captions', !on); };
void neo.captions().then(markCaptions).catch(() => {});
captionsButton.addEventListener('click', async () => markCaptions(await neo.captions(!captionsButton.classList.contains('on'))));
void neo.pace().then(markPace).catch(() => {});
paceRow.addEventListener('click', async (e) => {
  const pace = (e.target as HTMLElement).closest<HTMLButtonElement>('button')?.dataset.pace;
  if (!pace) return;
  markPace(await neo.pace(pace));
  // A session already running keeps the pace it started with.
  if (pc) { label.textContent = 'Neo · new speed from next wake'; setTimeout(() => { if (pc) label.textContent = 'Neo · listening'; }, 3000); }
});
