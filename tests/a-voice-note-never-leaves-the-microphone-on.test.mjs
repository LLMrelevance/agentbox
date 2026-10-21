// A VOICE NOTE NEVER LEAVES THE MICROPHONE ON, AND REACHES ONLY WHOEVER ASKED.
//
// Recording a voice note opens the microphone. Codex's review of the first
// build found three ways out that left it open or lost the note: a recorder
// that failed to start after the microphone opened kept its tracks live; a
// second note started while the first was still being packed took the
// first's answer; and a note that reached the five minute limit was stopped
// and handed to nobody. Measured here with a stand-in microphone that counts
// its live tracks: every way out (done, the cross while recording, the cross
// while the Mac is still asking, a failure to start, the box going away, the
// limit) ends with no track live, the limit keeps the note, a slip shorter
// than 0.4 s is not a note, and two notes in a row each arrive once.
import { describe, it, expect } from 'vitest';
import { voiceRecording, TICK_MS } from '../renderer/src/team/voice-recording.ts';
import { VOICE_MAX_MS } from '../renderer/src/team/voice-note.ts';

function world({ access = 'granted', recorderFails = false, holdAsk = false } = {}) {
  let clock = 0;
  const timers = new Map();
  let nextTimer = 1;
  const live = new Set();
  let releaseAsk = null;
  const recorders = [];
  const env = {
    ask: () => (holdAsk ? new Promise((r) => { releaseAsk = () => r(access); }) : Promise.resolve(access)),
    open: async () => {
      const track = { stop: () => live.delete(track) };
      live.add(track);
      return { getTracks: () => [track] };
    },
    makeRecorder: () => {
      if (recorderFails) throw new Error('no recorder here');
      const rec = {
        state: 'inactive', mimeType: 'audio/webm', ondataavailable: null, onstop: null,
        start() { this.state = 'recording'; },
        stop() { if (this.state === 'inactive') return; this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['x']) }); queueMicrotask(() => this.onstop?.()); },
      };
      recorders.push(rec);
      return rec;
    },
    makeMeter: () => ({ level: () => 0.5, close: () => {} }),
    now: () => clock,
    every: (fn) => { const id = nextTimer++; timers.set(id, fn); return id; },
    clear: (id) => { timers.delete(id); },
    pack: async () => 'QUJD',
  };
  const notes = [];
  const errors = [];
  const phases = [];
  const on = { phase: (p) => phases.push(p), tick: () => {}, done: (n) => notes.push(n), error: (t) => errors.push(t) };
  const r = voiceRecording(env, on);
  const pass = (ms) => { clock += ms; for (const fn of [...timers.values()]) fn(); };
  const settle = () => new Promise((res) => setTimeout(res, 0));
  return { r, env, on, live, notes, errors, phases, pass, settle, timers, recorders, ask: () => releaseAsk?.() };
}

describe('every way out lets the microphone go', () => {
  it('done keeps the note, at its length, and closes the microphone', async () => {
    const w = world();
    await w.r.start();
    expect(w.live.size).toBe(1);
    w.pass(2500);
    w.r.stop();
    await w.settle();
    expect(w.live.size).toBe(0);
    expect(w.timers.size).toBe(0);
    expect(w.notes).toHaveLength(1);
    expect(w.notes[0].name).toBe('voice-note-2500ms.webm');
  });

  it('the cross throws it away and closes the microphone', async () => {
    const w = world();
    await w.r.start();
    w.pass(2500);
    w.r.cancel();
    await w.settle();
    expect(w.live.size).toBe(0);
    expect(w.notes).toHaveLength(0);
  });

  it('the cross while the Mac is still asking never opens the microphone', async () => {
    const w = world({ holdAsk: true });
    const started = w.r.start();
    w.r.cancel();
    w.ask();
    await started;
    expect(w.live.size).toBe(0);
    expect(w.recorders).toHaveLength(0);
  });

  it('a recorder that cannot start closes the microphone it was given and says so', async () => {
    const w = world({ recorderFails: true });
    await w.r.start();
    expect(w.live.size).toBe(0);
    expect(w.errors).toEqual(['A voice note could not be recorded on this computer.']);
    expect(w.phases.at(-1)).toBe('idle');
  });

  it('the box going away mid-note closes the microphone at once and sends nothing', async () => {
    const w = world();
    await w.r.start();
    w.pass(3000);
    w.r.dispose();
    expect(w.live.size).toBe(0);
    await w.settle();
    expect(w.notes).toHaveLength(0);
  });

  it('a refused microphone opens nothing and says where to allow it', async () => {
    const w = world({ access: 'settings' });
    await w.r.start();
    expect(w.live.size).toBe(0);
    expect(w.errors[0]).toMatch(/System Settings/);
  });
});

describe('what counts as a note', () => {
  it('stops itself at the limit and keeps the note', async () => {
    const w = world();
    await w.r.start();
    w.pass(VOICE_MAX_MS - TICK_MS);
    expect(w.notes).toHaveLength(0);
    w.pass(TICK_MS);
    await w.settle();
    expect(w.live.size).toBe(0);
    expect(w.notes).toHaveLength(1);
    expect(w.notes[0].ms).toBe(VOICE_MAX_MS);
  });

  it('a slip shorter than 0.4 s is not a note, and 0.4 s is', async () => {
    const short = world();
    await short.r.start();
    short.pass(399);
    short.r.stop();
    await short.settle();
    expect(short.notes).toHaveLength(0);
    const just = world();
    await just.r.start();
    just.pass(400);
    just.r.stop();
    await just.settle();
    expect(just.notes).toHaveLength(1);
  });

  it('a second note recorded while the first is still being packed: each arrives once, as itself', async () => {
    const packs = [];
    const w = world();
    w.r = voiceRecording({ ...w.env, pack: () => new Promise((res) => packs.push(res)) }, w.on);
    await w.r.start();
    w.pass(1000);
    w.r.stop();
    await w.settle();
    expect(packs).toHaveLength(1);
    await w.r.start();
    w.pass(2000);
    w.r.stop();
    await w.settle();
    packs[1]('second');
    packs[0]('first');
    await w.settle();
    expect(w.notes.map((n) => [n.ms, n.dataBase64])).toEqual([[2000, 'second'], [1000, 'first']]);
    expect(w.live.size).toBe(0);
  });
});
