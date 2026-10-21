// RECORDING A VOICE NOTE: press the mic, talk, press done. While it records the
// composer shows how long it has been and a live meter, so you can see it is
// hearing you. Leaving the conversation or pressing the cross throws it away.
// The rules are ./voice-recording.ts; this hands them the real microphone.
import { useEffect, useRef, useState } from 'react';
import { voiceRecording, type Recorded, type RecordingEnv, type StreamLike, type VoicePhase } from './voice-recording';

export type { Recorded, VoicePhase };

const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
const pickType = () => (typeof MediaRecorder === 'undefined' ? '' : TYPES.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? '');

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const browser: RecordingEnv = {
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
  now: () => performance.now(),
  every: (fn, ms) => window.setInterval(fn, ms),
  clear: (id) => window.clearInterval(id),
  pack: toBase64,
};

export function useVoiceRecorder({ onError, onDone }: {
  onError: (text: string) => void;
  /** A note finished and kept: by Done, or by reaching the limit. */
  onDone: (note: Recorded) => void;
}) {
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const said = useRef({ onError, onDone });
  said.current = { onError, onDone };
  // Made with the composer and thrown away with it, half recorded note and all.
  // Made in the effect, so a second mount (React's strict mode does one) gets
  // a recorder of its own rather than the one the first unmount disposed.
  const rec = useRef<ReturnType<typeof voiceRecording> | null>(null);
  useEffect(() => {
    const r = voiceRecording(browser, {
      phase: setPhase,
      tick: (ms, l) => { setElapsed(ms); setLevels(l); },
      done: (note) => said.current.onDone(note),
      error: (text) => said.current.onError(text),
    });
    rec.current = r;
    return () => { r.dispose(); if (rec.current === r) rec.current = null; };
  }, []);
  const [actions] = useState(() => ({
    start: () => { void rec.current?.start(); },
    stop: () => rec.current?.stop(),
    cancel: () => rec.current?.cancel(),
  }));
  return { phase, elapsed, levels, ...actions };
}
