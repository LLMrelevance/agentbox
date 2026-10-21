// ONE VOICE NOTE BEING RECORDED, without React and without the browser's own
// objects, so its promises can be tested: the microphone is let go on every
// way out (done, the cross, the limit, a failure, the box going away), and a
// note reaches whoever asked for it and nobody else. ./useVoiceRecorder.ts
// hands it the real microphone.
import { VOICE_MAX_MS, voiceNoteName } from './voice-note';

export type Recorded = { name: string; ms: number; dataBase64: string; blob: Blob };
export type VoicePhase = 'idle' | 'asking' | 'recording';

type Track = { stop: () => void };
export type StreamLike = { getTracks: () => Track[] };
export type RecorderLike = {
  state: string;
  mimeType: string;
  start: (sliceMs: number) => void;
  stop: () => void;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
};

export type RecordingEnv = {
  ask: () => Promise<'granted' | 'settings'>;
  open: () => Promise<StreamLike>;
  makeRecorder: (stream: StreamLike) => RecorderLike;
  /** How loud the microphone is right now, 0..1, and how to stop listening. */
  makeMeter: (stream: StreamLike) => { level: () => number; close: () => void };
  now: () => number;
  every: (fn: () => void, ms: number) => number;
  clear: (id: number) => void;
  pack: (blob: Blob) => Promise<string>;
};

export const TICK_MS = 90;
const METER = 36;
// Shorter than this is a slip of the finger, not a note.
const SHORTEST_MS = 400;
const extOf = (type: string) => (/mp4/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : 'webm');

export function voiceRecording(env: RecordingEnv, on: {
  phase: (p: VoicePhase) => void;
  tick: (elapsed: number, levels: number[]) => void;
  done: (note: Recorded) => void;
  error: (text: string) => void;
}) {
  type Live = { recorder: RecorderLike; stream: StreamLike; meter: { close: () => void } | null; timer: number; keep: boolean };
  let live: Live | null = null;
  let asking = 0;
  let gone = false;

  const release = (l: { stream: StreamLike; meter: { close: () => void } | null; timer: number }) => {
    env.clear(l.timer);
    l.stream.getTracks().forEach((t) => t.stop());
    try { l.meter?.close(); } catch { /* already closed */ }
  };

  async function start() {
    if (live || gone) return;
    const ask = (asking += 1);
    const still = () => !gone && ask === asking;
    on.phase('asking');
    const access = await env.ask().catch(() => 'settings' as const);
    if (!still()) return;
    if (access !== 'granted') {
      on.phase('idle');
      on.error('Allow the microphone in System Settings, then press the mic again.');
      return;
    }
    let stream: StreamLike;
    try { stream = await env.open(); } catch {
      if (still()) { on.phase('idle'); on.error('The microphone could not be opened. Check System Settings, then try again.'); }
      return;
    }
    if (!still()) { stream.getTracks().forEach((t) => t.stop()); return; }
    const mine: Live = { recorder: null as unknown as RecorderLike, stream, meter: null, timer: 0, keep: false };
    try {
      const recorder = env.makeRecorder(stream);
      mine.recorder = recorder;
      const meter = env.makeMeter(stream);
      mine.meter = meter;
      const chunks: Blob[] = [];
      const startedAt = env.now();
      let levels: number[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      // Each recording answers for itself, so one started while the last is
      // still being packed cannot take its note.
      recorder.onstop = async () => {
        if (live === mine) live = null;
        release(mine);
        on.phase('idle');
        on.tick(0, []);
        const ms = Math.min(VOICE_MAX_MS, env.now() - startedAt);
        if (!mine.keep || !chunks.length || ms < SHORTEST_MS) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const note = { name: voiceNoteName(ms, extOf(blob.type)), ms, blob, dataBase64: await env.pack(blob) };
        if (!gone) on.done(note);
      };
      mine.timer = env.every(() => {
        const ms = env.now() - startedAt;
        levels = [...levels, Math.min(1, meter.level())].slice(-METER);
        on.tick(ms, levels);
        // At the limit the note is kept, as if Done had been pressed.
        if (ms >= VOICE_MAX_MS && recorder.state === 'recording') { mine.keep = true; recorder.stop(); }
      }, TICK_MS);
      live = mine;
      recorder.start(250);
      on.phase('recording');
    } catch {
      live = null;
      release(mine);
      on.phase('idle');
      on.error('A voice note could not be recorded on this computer.');
    }
  }

  /** Finish; the note arrives through `done` once it is packed. */
  function stop() {
    if (!live) return;
    live.keep = true;
    if (live.recorder.state !== 'inactive') live.recorder.stop();
  }

  /** Throw it away, or stop waiting for the microphone. */
  function cancel() {
    asking += 1;
    const l = live;
    if (!l) { on.phase('idle'); return; }
    l.keep = false;
    if (l.recorder.state !== 'inactive') l.recorder.stop();
    else { live = null; release(l); on.phase('idle'); }
  }

  /** The box went away: whatever was being recorded goes with it. */
  function dispose() {
    gone = true;
    asking += 1;
    const l = live;
    if (!l) return;
    l.keep = false;
    try { if (l.recorder.state !== 'inactive') l.recorder.stop(); } catch { /* already stopped */ }
    live = null;
    release(l);
  }

  return { start, stop, cancel, dispose };
}
