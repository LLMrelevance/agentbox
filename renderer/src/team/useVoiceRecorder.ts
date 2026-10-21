// RECORDING A VOICE NOTE: press the mic, talk, press stop. While it records the
// composer shows how long it has been and a live meter, so you can see it is
// hearing you. Leaving the conversation or pressing the cross throws it away.
import { useCallback, useEffect, useRef, useState } from 'react';
import { VOICE_MAX_MS, voiceNoteName } from './voice-note';

export type VoicePhase = 'idle' | 'asking' | 'recording';
export type Recorded = { name: string; ms: number; dataBase64: string; blob: Blob };

// How often the meter takes a reading, and how many readings it shows.
const TICK_MS = 90;
const METER = 36;

const TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
const pickType = () => (typeof MediaRecorder === 'undefined' ? '' : TYPES.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? '');
const extOf = (type: string) => (/mp4/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : 'webm');

// The microphone light goes off the moment a note ends, kept or not.
function release({ timer, stream, audio }: { timer: number; stream: MediaStream; audio: AudioContext }) {
  window.clearInterval(timer);
  stream.getTracks().forEach((t) => t.stop());
  if (audio.state !== 'closed') void audio.close().catch(() => {});
}

async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function useVoiceRecorder({ onError }: { onError: (text: string) => void }) {
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const live = useRef<{
    recorder: MediaRecorder; stream: MediaStream; audio: AudioContext; timer: number;
    chunks: Blob[]; startedAt: number; keep: boolean; done: Promise<Recorded | null>;
  } | null>(null);
  const finished = useRef<((r: Recorded | null) => void) | null>(null);
  const errorRef = useRef(onError);
  errorRef.current = onError;
  // Cleared when the composer goes, so a microphone answer that lands after it
  // is let go rather than left recording into nothing. A cross pressed while
  // the Mac is still asking bumps `asked` for the same reason.
  const mounted = useRef(true);
  const asked = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const start = useCallback(async () => {
    if (live.current || phase !== 'idle') return;
    const ask = (asked.current += 1);
    const still = () => mounted.current && ask === asked.current;
    setPhase('asking');
    const access = await window.zero?.micAccess?.().catch(() => 'settings' as const) ?? 'granted';
    if (!still()) return;
    if (access !== 'granted') {
      setPhase('idle');
      errorRef.current('Allow the microphone in System Settings, then press the mic again.');
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      if (still()) { setPhase('idle'); errorRef.current('The microphone could not be opened. Check System Settings, then try again.'); }
      return;
    }
    if (!still()) { stream.getTracks().forEach((t) => t.stop()); return; }
    const type = pickType();
    const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const audio = new AudioContext();
    const meter = audio.createAnalyser();
    meter.fftSize = 512;
    audio.createMediaStreamSource(stream).connect(meter);
    const wave = new Uint8Array(meter.fftSize);
    const chunks: Blob[] = [];
    const startedAt = performance.now();
    const done = new Promise<Recorded | null>((resolve) => { finished.current = resolve; });
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = async () => {
      const l = live.current;
      live.current = null;
      release({ timer, stream, audio });
      setPhase('idle');
      setElapsed(0);
      setLevels([]);
      const ms = Math.min(VOICE_MAX_MS, performance.now() - startedAt);
      if (!l?.keep || !chunks.length || ms < 400) { finished.current?.(null); return; }
      const blob = new Blob(chunks, { type: recorder.mimeType || type || 'audio/webm' });
      finished.current?.({ name: voiceNoteName(ms, extOf(blob.type)), ms, blob, dataBase64: await toBase64(blob) });
    };
    const timer = window.setInterval(() => {
      const ms = performance.now() - startedAt;
      setElapsed(ms);
      meter.getByteTimeDomainData(wave);
      let peak = 0;
      for (const v of wave) peak = Math.max(peak, Math.abs(v - 128) / 128);
      setLevels((was) => [...was, Math.min(1, peak * 2.2)].slice(-METER));
      if (ms >= VOICE_MAX_MS && recorder.state === 'recording') { if (live.current) live.current.keep = true; recorder.stop(); }
    }, TICK_MS);
    live.current = { recorder, stream, audio, timer, chunks, startedAt, keep: false, done };
    recorder.start(250);
    setPhase('recording');
  }, [phase]);

  // Finish and hand the note back; null when it was too short to keep.
  const stop = useCallback(async (): Promise<Recorded | null> => {
    const l = live.current;
    if (!l) return null;
    l.keep = true;
    if (l.recorder.state !== 'inactive') l.recorder.stop();
    return l.done;
  }, []);

  const cancel = useCallback(() => {
    asked.current += 1;
    const l = live.current;
    if (!l) { setPhase('idle'); return; }
    l.keep = false;
    if (l.recorder.state !== 'inactive') l.recorder.stop();
    else { live.current = null; release(l); setPhase('idle'); }
  }, []);

  // A note half recorded when the composer goes away is thrown away with it.
  useEffect(() => () => {
    const l = live.current;
    if (!l) return;
    l.keep = false;
    try { if (l.recorder.state !== 'inactive') l.recorder.stop(); } catch { /* already stopped */ }
    release(l);
  }, []);

  return { phase, elapsed, levels, start, stop, cancel };
}
