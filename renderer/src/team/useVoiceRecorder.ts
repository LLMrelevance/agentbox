// RECORDING A VOICE NOTE: press the mic, talk, press the tick. While it records
// the composer shows how long it has been and a live meter, so you can see it
// is hearing you. The rules, and why nothing said is lost, are
// ./voice-recording.ts; this hands them the real microphone and this Mac's
// store, and puts back into the box whatever was kept for it.
import { useEffect, useRef, useState } from 'react';
import { voiceRecording, type Arrival, type Recorded, type RecordingEnv, type StreamLike, type VoicePhase } from './voice-recording';
import { indexedVoiceStore, listedVoiceStore, memoryVoiceStore, type VoiceDraftStore } from './voice-drafts';

export type { Arrival, Recorded, VoicePhase };

const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
const pickType = () => (typeof MediaRecorder === 'undefined' ? '' : TYPES.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? '');

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

let store: VoiceDraftStore | null = null;
const theStore = () => (store ??= listedVoiceStore(typeof indexedDB === 'undefined' ? memoryVoiceStore() : indexedVoiceStore()));
const busy = { id: null as string | null };

const browser = (): RecordingEnv => ({
  ask: async () => (await window.zero?.micAccess?.()) ?? 'granted',
  open: () => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }),
  makeRecorder: (stream) => {
    const type = pickType();
    return new MediaRecorder(stream as MediaStream, type ? { mimeType: type } : undefined) as unknown as ReturnType<RecordingEnv['makeRecorder']>;
  },
  makeMeter: (stream: StreamLike) => {
    const ctx = new AudioContext();
    const meter = ctx.createAnalyser();
    meter.fftSize = 512;
    ctx.createMediaStreamSource(stream as MediaStream).connect(meter);
    const wave = new Uint8Array(meter.fftSize);
    return {
      level: () => {
        meter.getByteTimeDomainData(wave);
        let peak = 0;
        for (const v of wave) peak = Math.max(peak, Math.abs(v - 128) / 128);
        return peak * 2.2;
      },
      close: () => { if (ctx.state !== 'closed') void ctx.close().catch(() => {}); },
    };
  },
  now: () => Date.now(),
  every: (fn, ms) => window.setInterval(fn, ms),
  clear: (id) => window.clearInterval(id),
  pack: toBase64,
  store: theStore(),
  busy,
  newId: () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`),
});

/** A note that went out, or was taken out of the box, is no longer kept. */
export function forgetVoiceDraft(draftId: string | undefined) {
  if (draftId) void theStore().remove(draftId).catch(() => {});
}

/** What a box can ask of its recorder from outside the bar: is it recording, and finish it now. */
export type VoiceControl = { recording: () => boolean; finish: () => Promise<Recorded | null> };

export function useVoiceRecorder({ key, onSay, onDone }: {
  /** The conversation and box the notes belong to. */
  key: string;
  onSay: (text: string) => void;
  /** A note for the box: just recorded, kept from before, or recovered. */
  onDone: (note: Recorded, how: Arrival) => void;
}) {
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const said = useRef({ onSay, onDone });
  said.current = { onSay, onDone };
  // Made with the box and set aside with it. Made in the effect, so a second
  // mount (React's strict mode does one) gets a recorder of its own rather
  // than the one the first unmount set aside.
  const rec = useRef<ReturnType<typeof voiceRecording> | null>(null);
  useEffect(() => {
    const r = voiceRecording(browser(), key, {
      phase: setPhase,
      tick: (ms, l) => { setElapsed(ms); setLevels(l); },
      done: (note, how) => said.current.onDone(note, how),
      say: (text) => said.current.onSay(text),
    });
    rec.current = r;
    void r.restore();
    return () => { r.dispose(); if (rec.current === r) rec.current = null; };
  }, [key]);
  const [actions] = useState(() => ({
    start: () => { void rec.current?.start(); },
    stop: () => rec.current?.stop(),
    cancel: () => rec.current?.cancel(),
    finish: () => rec.current?.finish() ?? Promise.resolve(null),
    recording: () => !!rec.current?.recording(),
  }));
  return { phase, elapsed, levels, ...actions };
}
