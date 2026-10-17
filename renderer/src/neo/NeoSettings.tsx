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

export function NeoSettings() {
  const { doc, trouble, change } = useNeoMemory();
  const rules = useWriting(doc?.instructions, (v) => change({ instructions: v }));
  const memories = useWriting(doc?.document, (v) => change({ memories: v }));
  return (
    <div className="set-inner instructions-page neo-page">
      <h1 className="instr-lead">Instructions for Neo</h1>
      {trouble && <div className="set-error">{trouble}</div>}
      <div className="instr-body">
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
      </div>
    </div>
  );
}
