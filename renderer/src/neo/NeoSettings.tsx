/* THE NEO PAGE IN SETTINGS (w-6a1c405642). What somebody writes for Neo, and
 * the lines Neo was told to remember out loud; both reach every conversation
 * after this one (shared/neo-memory.mjs).
 *
 * It is the Instructions page's own card and sections, down to the component:
 * "we already have components like this in Instructions... just make it
 * similar where possible". So the memories are a running document, one entry
 * a line, read as a list and edited as text — not a column of settings rows
 * with a button each, which was the first try and was turned down.
 */
import { useEffect, useRef, useState } from 'react';
import { Part, type Writing } from '../components/InstructionSettings';
import type { NeoMemory } from '../types';
import { VOICES } from '../../../shared/neo-tools.mjs';

const zero = () => (window as Window).zero;

/* Reading and changing what Neo keeps. Every change answers with everything
   kept, so the page draws what was saved rather than what it hoped. */
function useNeoMemory() {
  const [doc, setDoc] = useState<NeoMemory | null>(null);
  const [trouble, setTrouble] = useState('');
  useEffect(() => {
    let alive = true;
    const ask = zero()?.neoMemory;
    if (!ask) { setTrouble('Neo is not running on this computer.'); return; }
    void ask().then((d) => { if (alive) { if (d) setDoc(d); else setTrouble('Neo is not running on this computer.'); } })
      .catch(() => alive && setTrouble('Neo is not running on this computer.'));
    return () => { alive = false; };
  }, []);
  const change = async (c: { instructions?: string; memories?: string }) => {
    const d = await zero()?.neoMemory?.(c).catch(() => null);
    if (!d) throw new Error('not saved');
    setTrouble(d.error ?? '');
    setDoc(d);
  };
  return { doc, trouble, change };
}

/* One section's text, saved 400ms after the last keystroke and again on the
   way out, so a page closed mid-sentence keeps the sentence. Seeded once:
   after that the box is the truth, because a save answers with the document
   tidied up and re-seeding would move the caret while somebody is typing. */
function useWriting(loaded: string | null | undefined, save: (v: string) => Promise<void>): Writing {
  const [text, setText] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const timer = useRef<number | null>(null);
  const pending = useRef<string | null>(null);
  useEffect(() => { if (typeof loaded === 'string') setText((was) => (was === null ? loaded : was)); }, [loaded]);
  const flush = async (v: string) => {
    pending.current = null;
    try { await save(v); setStatus('Saved'); } catch { setStatus('Could not save'); }
  };
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
    if (pending.current !== null) void flush(pending.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const edit = (v: string) => {
    setText(v);
    pending.current = v;
    setStatus('Saving…');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(v), 400);
  };
  return { text, status, edit };
}

const voiceName = (v: string) => v[0].toUpperCase() + v.slice(1);
const PLAY = <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2.6v6.8L9.6 6z" fill="currentColor" /></svg>;
const STOP = <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="3" y="3" width="6" height="6" rx="1" fill="currentColor" /></svg>;

/* Which of the ten voices Neo speaks in: a row in a settings card, with the
   dropdown every other Settings page picks one-of-many with (Settings.tsx
   Picker), plus a sample to hear for each (./voices/). The
   pick holds from the next time Neo wakes. */
function VoiceRow() {
  const [voice, setVoice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const player = useRef<HTMLAudioElement | null>(null);
  const wrap = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    let alive = true;
    void zero()?.neoVoice?.().then((v) => { if (alive && v) setVoice(v); });
    return () => { alive = false; player.current?.pause(); };
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const hear = (v: string) => {
    player.current?.pause();
    if (playing === v) { setPlaying(null); return; }
    const a = new Audio(new URL(`./voices/${v}.m4a`, import.meta.url).href);
    a.onended = () => setPlaying((p) => (p === v ? null : p));
    player.current = a;
    setPlaying(v);
    void a.play().catch(() => setPlaying(null));
  };
  const pick = async (v: string) => {
    setVoice(v);
    setOpen(false);
    const kept = await zero()?.neoVoice?.(v);
    if (kept) setVoice(kept);
  };
  const now = voice ?? VOICES[0];
  return (
    <div className="set-row">
      <div className="set-row-text">
        <div className="set-row-label">Neo's voice</div>
        <div className="set-row-desc">How Neo sounds, from the next time it wakes. Play any of them to hear it first.</div>
      </div>
      <div className="set-row-ctl neo-voice-ctl">
        <button type="button" className="neo-voice-play" aria-label={`${playing === now ? 'Stop' : 'Play'} ${now}`} onClick={() => hear(now)}>{playing === now ? STOP : PLAY}</button>
        <div className={`set-picker set-picker-bare${open ? ' open' : ''}`}>
          <span className="set-picker-wrap" ref={wrap}>
            <button type="button" className="set-picker-now" aria-label="Neo's voice" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {voiceName(now)}
              <svg className="set-picker-chev" width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
                <path d="M2.2 4 L5 6.8 L7.8 4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {open && (
              <span className="set-picker-menu neo-voice-menu" role="listbox" aria-label="Neo's voice">
                {VOICES.map((v) => (
                  <span key={v} className={`neo-voice-item${v === now ? ' on' : ''}`}>
                    <button type="button" className="neo-voice-play" aria-label={`${playing === v ? 'Stop' : 'Play'} ${v}`} onClick={() => hear(v)}>{playing === v ? STOP : PLAY}</button>
                    <button type="button" role="option" aria-selected={v === now} className={`set-picker-row${v === now ? ' on' : ''}`} onClick={() => void pick(v)}>
                      {voiceName(v)}{v === VOICES[0] && <span className="neo-voice-tag">Default</span>}
                    </button>
                  </span>
                ))}
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

export function NeoSettings() {
  const { doc, trouble, change } = useNeoMemory();
  const rules = useWriting(doc?.instructions, (v) => change({ instructions: v }));
  const memories = useWriting(doc?.document, (v) => change({ memories: v }));
  return (
    <div className="set-inner instructions-page neo-page">
      <h1 className="instr-lead">Neo</h1>
      {trouble && <div className="set-error">{trouble}</div>}
      <div className="instr-body">
        <div className="set-group-label neo-section">Instructions for Neo</div>
        <div className="instr-card">
          <Part
            id="neo-rules"
            find="neo-instructions"
            label="How you want Neo to work"
            description="In your own words. This holds for every conversation, the way your agent instructions hold for every task."
            writing={rules}
          />
          <Part
            id="neo-memories"
            find="neo-memories"
            label="What Neo remembers"
            description="One memory a line. Say “remember that…” while Neo is listening and the line turns up here."
            writing={memories}
          />
        </div>
        {/* Not instructions, so not that card: a settings card like every other page's. */}
        <div className="set-group neo-section" data-find="neo-voice">
          <div className="set-group-label">Voice</div>
          <div className="set-plate"><VoiceRow /></div>
        </div>
      </div>
    </div>
  );
}
