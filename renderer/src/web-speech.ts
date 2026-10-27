// DICTATION IN THE WEB APP: the browser's own speech recognition as the
// dictation controller's speech (dictation.ts), and whether this account may
// use it. On an iPhone, Safari's recogniser is Apple's; the page records nothing.
import { PLANS } from '../../cloud/gateway/plans.mjs';
import type { Speech, SpeechEvents } from './dictation';

type Plans = Record<string, { agents: number }>;
type SettingsRow = { updated_at?: string; settings?: { workspace?: { plan?: unknown } } };

/** True on a paid Agentbox Cloud plan, as the computer heard from most recently read it. */
export function dictationAllowed(rows: SettingsRow[]): boolean {
  const newest = [...rows].sort((a, b) => (Date.parse(b.updated_at ?? '') || 0) - (Date.parse(a.updated_at ?? '') || 0))[0];
  const plan = newest?.settings?.workspace?.plan;
  return typeof plan === 'string' && Object.hasOwn(PLANS, plan) && (PLANS as Plans)[plan].agents > 0;
}

let allowed = false;
const listeners = new Set<() => void>();
export const dictationAllowedNow = () => allowed;
export function onDictationAllowed(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function setDictationAllowed(next: boolean) {
  if (next === allowed) return;
  allowed = next;
  for (const fn of listeners) fn();
}

interface RecognitionResult { isFinal: boolean; 0: { transcript: string } }
interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean;
  onstart: (() => void) | null;
  onresult: ((e: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((e: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type Win = {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
  navigator?: { language?: string; permissions?: { query(d: { name: string }): Promise<{ state: string }> } };
};

// The browser asks for the microphone once start() is called, so the start
// waits on the person's answer as well as on the recogniser.
const ASKING_MS = 20_000;

/** The browser's recogniser as a Speech, or null where it has none. */
export function webSpeech(win: Win): Speech | null {
  const Make = win.SpeechRecognition ?? win.webkitSpeechRecognition;
  if (!Make) return null;
  let on: SpeechEvents | null = null;
  let live: Recognition | null = null;
  return {
    onDevice: () => false,
    // Refused here before is said at once; otherwise the browser asks on start.
    async allow() {
      const state = await win.navigator?.permissions?.query({ name: 'microphone' }).then((p) => p.state, () => null);
      return state === 'denied' ? { granted: false, canAskAgain: false } : { granted: true, canAskAgain: true };
    },
    startMs: ASKING_MS,
    start() {
      const r = new Make();
      live = r;
      r.lang = win.navigator?.language ?? '';
      r.continuous = true;
      r.interimResults = true;
      r.onstart = () => on?.start();
      // Each final result once, and what is still being heard after the last one.
      r.onresult = (e) => {
        const heard: string[] = [];
        for (let i = e.resultIndex; i < e.results.length; i += 1) {
          const res = e.results[i];
          if (res.isFinal) on?.result(res[0].transcript, true);
          else heard.push(res[0].transcript);
        }
        if (heard.length) on?.result(heard.join(' '), false);
      };
      r.onerror = (e) => on?.error(e.error, e.message ?? '');
      r.onend = () => { if (live === r) live = null; on?.end(); };
      r.onspeechstart = () => on?.level(7);
      r.onspeechend = () => on?.level(0);
      r.start();
    },
    stop() { live?.stop(); },
    abort() { live?.abort(); },
    listen(events) {
      on = events;
      return () => { if (on === events) on = null; };
    },
  };
}
