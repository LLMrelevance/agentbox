// Neo's window (main/neo/index.mjs opens it). Wakes on tap-⌘-twice, opens a
// GPT-Live session over WebRTC (the offer goes to the main process, which
// holds the key and starts the session), shows Neo's words, and signs off.
import './neo.css';
import { dustOrb } from './dust';
import { chime } from './chime';
import { liveDriver } from './live-driver';

type NeoBridge = {
  onWake(fn: (p: { outside: boolean }) => void): () => void;
  onSleep(fn: (p: { reason: string }) => void): () => void;
  onResting(fn: () => void): () => void;
  onNoMic(fn: (p: { app?: string | null }) => void): () => void;
  allowMic(): Promise<'granted' | 'settings' | 'refused'>;
  onNotice(fn: (p: { text: string }) => void): () => void;
  startLive(sdp: string, outside: boolean): Promise<{ ok: boolean; sdp?: string; error?: string }>;
  tool(callId: string, name: string, args: string, heard: string): Promise<unknown>;
  drag(phase: 'start' | 'move' | 'end', dx?: number, dy?: number): void;
  pace(value?: string): Promise<string>;
  usage(seconds: number): void;
  ending(): void;
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
  void meterCtx?.close();
  const ctx = meterCtx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  const tick = () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += ((v - 128) / 128) ** 2;
    const level = Math.min(1, Math.sqrt(sum / data.length) * 6);
    orb.setLevel(level);
    if (level > 0.05) label.textContent = 'Neo · speaking';
    meter = requestAnimationFrame(tick);
  };
  tick();
}

// One driver per session, bound to that session's channel, so neither its
// words nor a slow tool's answer can reach the next one.
function driverFor(ch: RTCDataChannel) {
  return liveDriver({
    send: (event) => { if (channel === ch && ch.readyState === 'open') ch.send(JSON.stringify(event)); },
    tool: (callId, name, args, heard) => { poke(); return neo.tool(callId, name, args, heard); },
    onWords: (text) => { if (channel === ch) { poke(); say(text); } },
    onUsage: (seconds) => { if (channel === ch) neo.usage(seconds); },
    onClosed: () => { if (channel === ch) finish(); },
  });
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
    pc = new RTCPeerConnection();
    player = new Audio();
    player.autoplay = true;
    pc.ontrack = (e) => { if (!player || stale()) return; player.srcObject = e.streams[0]; void player.play(); listenTo(e.streams[0]); };
    for (const track of mic.getAudioTracks()) pc.addTrack(track, mic);
    channel = pc.createDataChannel('oai-events');
    const driver = driverFor(channel);
    channel.onmessage = (m) => { void driver.handle(JSON.parse(String(m.data))); };
    const ch = channel;
    channel.onclose = () => { if (channel === ch) finish(); };
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise<void>((resolve) => {
      if (pc!.iceGatheringState === 'complete') return resolve();
      const timer = setTimeout(resolve, 3000);
      pc!.addEventListener('icegatheringstatechange', () => { if (pc?.iceGatheringState === 'complete') { clearTimeout(timer); resolve(); } });
    });
    if (stale() || !pc) return;
    const got = await neo.startLive(pc.localDescription!.sdp, outside);
    if (stale() || !pc) return;
    if (!got.ok || !got.sdp) throw new Error(got.error ?? 'Neo could not start.');
    await pc.setRemoteDescription({ type: 'answer', sdp: got.sdp });
  } catch (err) {
    if (stale()) return;
    say(String((err as Error).message || err));
    closing = true;
    closeTimer = window.setTimeout(() => finish(), 4000);
  }
}

function sleep(reason: string) {
  if (closing) return;
  closing = true;
  neo.ending();
  // The mic goes off now, not when the service gets round to closing.
  mic?.getTracks().forEach((t) => t.stop());
  if (channel?.readyState === 'open') {
    channel.send(JSON.stringify({ type: 'session.close' }));
    closeTimer = window.setTimeout(() => finish(), 4000);
  } else finish();
  if (reason === 'limit') say('That is a long session, so I am taking a break. Tap ⌘ twice to start again.');
}

function finish() {
  gen++;
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  // Main still hears that Neo is off even when there was nothing to tear
  // down, or it would stay marked live with nothing listening.
  if (!pc && !mic && !root.classList.contains('awake')) { neo.closed(); return; }
  if (idle) clearTimeout(idle);
  if (meter) cancelAnimationFrame(meter);
  void meterCtx?.close();
  meterCtx = null;
  mic?.getTracks().forEach((t) => t.stop());
  try { channel?.close(); } catch {}
  try { pc?.close(); } catch {}
  if (player) { player.srcObject = null; player = null; }
  mic = null; pc = null; channel = null;
  orb.setLevel(0);
  chime('sleep');
  root.classList.remove('awake');
  setTimeout(() => say(''), 400);
  neo.closed();
}

neo.onWake(wake);
neo.onSleep(({ reason }) => sleep(reason));
neo.onResting(() => { root.classList.add('awake'); say('I have talked for three hours today, so I am resting until tomorrow.'); setTimeout(() => { root.classList.remove('awake'); neo.closed(); }, 5000); });
// Main hides the window again on its own; this is not a session.
neo.onNotice(({ text }) => { if (pc) return; root.classList.add('awake'); label.textContent = 'Neo'; say(text); setTimeout(() => { if (!pc) { root.classList.remove('awake'); say(''); } }, 9500); });
// macOS will not ask again for an app it was once told no for, so the card
// carries the press that clears that and asks (main/neo/mic.mjs).
let micCard: number | null = null;
const dropMicCard = () => {
  if (micCard) clearTimeout(micCard);
  micCard = null;
  actButton.hidden = true;
  actButton.onclick = null;
};
neo.onNoMic(({ app }) => {
  root.classList.add('awake');
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
let press: { x: number; y: number; moved: boolean } | null = null;
for (const el of [orbCanvas, document.getElementById('card')!, paceRow]) {
  el.addEventListener('mouseenter', () => neo.clickable(true));
  el.addEventListener('mouseleave', () => { if (!press) neo.clickable(false); });
}

// A press on the orb that moves drags Neo around the screen; one that does
// not is the click that sends Neo to sleep.
orbCanvas.addEventListener('pointerdown', (e) => {
  press = { x: e.screenX, y: e.screenY, moved: false };
  orbCanvas.setPointerCapture(e.pointerId);
  neo.drag('start');
});
orbCanvas.addEventListener('pointermove', (e) => {
  if (!press) return;
  const dx = e.screenX - press.x, dy = e.screenY - press.y;
  if (!press.moved && Math.hypot(dx, dy) < 4) return;
  press.moved = true;
  orbCanvas.classList.add('dragging');
  neo.drag('move', dx, dy);
});
orbCanvas.addEventListener('pointerup', () => {
  if (!press) return;
  const moved = press.moved;
  press = null;
  orbCanvas.classList.remove('dragging');
  if (moved) neo.drag('end'); else sleep('clicked');
});

// The speed row shows while the pointer is on the orb or on the row itself.
let paceHide: number | null = null;
const showPace = (on: boolean) => {
  if (paceHide) clearTimeout(paceHide);
  if (on) paceRow.classList.add('show');
  else paceHide = window.setTimeout(() => paceRow.classList.remove('show'), 500);
};
for (const el of [orbCanvas, paceRow]) {
  el.addEventListener('mouseenter', () => { if (!press) showPace(true); });
  el.addEventListener('mouseleave', () => showPace(false));
}
const markPace = (pace: string) => {
  for (const b of paceRow.querySelectorAll<HTMLButtonElement>('button')) b.classList.toggle('on', b.dataset.pace === pace);
};
void neo.pace().then(markPace).catch(() => {});
paceRow.addEventListener('click', async (e) => {
  const pace = (e.target as HTMLElement).closest<HTMLButtonElement>('button')?.dataset.pace;
  if (!pace) return;
  markPace(await neo.pace(pace));
  // A session already running keeps the pace it started with.
  if (pc) { label.textContent = 'Neo · new speed from next wake'; setTimeout(() => { if (pc) label.textContent = 'Neo · listening'; }, 3000); }
});
