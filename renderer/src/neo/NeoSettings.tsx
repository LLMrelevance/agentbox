/* THE NEO PAGE IN SETTINGS (w-6a1c405642). What somebody writes for Neo, and
 * the lines Neo was told to remember out loud; both reach every conversation
 * after this one (shared/neo-memory.mjs).
 *
 * Drawn with the group, plate and row the rest of Settings uses, down to the
 * ghost button on a list row — Connected devices on the Phone page is the
 * same shape. The two controls at the foot are the ones that used to live
 * only on the orb's card, where you had to be mid-conversation to find them.
 */
import { useEffect, useRef, useState } from 'react';
import { Name } from '../../../shared/product-name.mjs';
import type { NeoMemory, NeoPace } from '../types';
import { versionLabel } from '../components/InstructionSettings';

const PACES: { id: NeoPace; label: string }[] = [
  { id: 'slow', label: 'Slow' },
  { id: 'normal', label: 'Normal' },
  { id: 'fast', label: 'Fast' },
  { id: 'faster', label: 'Faster' },
];

const EMPTY: NeoMemory = { instructions: '', memories: [] };

const zero = () => (window as Window).zero;

const Group = ({ id, label, children }: { id: string; label: string; children: React.ReactNode }) => (
  <div className="set-group" data-find={id}>
    <div className="set-group-label"><span>{label}</span></div>
    <div className="set-plate">{children}</div>
  </div>
);

const Row = ({ label, desc, stack, children }: { label: string; desc?: string; stack?: boolean; children?: React.ReactNode }) => (
  <div className={`set-row${stack ? ' set-row-stack' : ''}`}>
    <div className="set-row-text">
      <div className="set-row-label">{label}</div>
      {desc && <div className={`set-row-desc${stack ? ' set-stack-desc' : ''}`}>{desc}</div>}
    </div>
    {children && (stack ? children : <div className="set-row-ctl">{children}</div>)}
  </div>
);

/* Reading and changing what Neo keeps. Every change answers with the whole
   document, so the page draws what was saved rather than what it hoped. */
function useNeoMemory() {
  const [doc, setDoc] = useState<NeoMemory | null>(null);
  const [trouble, setTrouble] = useState('');
  useEffect(() => {
    let alive = true;
    void zero()?.neoMemory?.().then((d) => { if (alive) setDoc(d ?? EMPTY); }).catch(() => alive && setTrouble('Neo is not running on this computer.'));
    return () => { alive = false; };
  }, []);
  const change = async (c: { add?: string; forget?: string; instructions?: string }) => {
    const d = await zero()?.neoMemory?.(c).catch(() => null);
    if (!d) { setTrouble('That could not be saved.'); return; }
    setTrouble(d.error ?? '');
    setDoc(d);
  };
  return { doc, trouble, change };
}

/* Saved 400ms after the last keystroke, the same beat as the agent
   instructions box, and on the way out so a page closed mid-sentence keeps
   the sentence. */
function Instructions({ text, onSave }: { text: string; onSave: (v: string) => Promise<void> }) {
  const [value, setValue] = useState(text);
  const [status, setStatus] = useState('');
  const timer = useRef<number | null>(null);
  const pending = useRef<string | null>(null);
  const flush = async (v: string) => {
    pending.current = null;
    try { await onSave(v); setStatus('Saved'); } catch { setStatus('Could not save'); }
  };
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
    if (pending.current !== null) void flush(pending.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const edit = (v: string) => {
    setValue(v);
    pending.current = v;
    setStatus('Saving…');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(v), 400);
  };
  return (
    <>
      <textarea
        className="neo-box"
        aria-label="Instructions for Neo"
        spellCheck={false}
        value={value}
        onChange={(e) => edit(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        placeholder="Never close a thread without asking me first. Say the option number before you read it out. Keep it to two sentences unless I ask for more."
      />
      <div className="neo-save" role="status">{status}</div>
    </>
  );
}

function AddMemory({ onAdd }: { onAdd: (text: string) => void }) {
  const [text, setText] = useState('');
  const add = () => { if (text.trim()) { onAdd(text); setText(''); } };
  return (
    <div className="set-row neo-add">
      <input
        aria-label="Something for Neo to remember"
        value={text}
        placeholder="Something for Neo to remember"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') add(); }}
      />
      <div className="set-row-ctl">
        <button type="button" className="set-ghost" disabled={!text.trim()} onClick={add}>Remember</button>
      </div>
    </div>
  );
}

/* How fast Neo talks and whether its words show, read off the app rather than
   off the press: both take effect from the next conversation on. */
function HowNeoTalks() {
  const [pace, setPace] = useState<NeoPace | null>(null);
  const [captions, setCaptions] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void zero()?.neoPace?.().then((p) => { if (alive && p) setPace(p); });
    void zero()?.neoCaptions?.().then((c) => { if (alive && c !== null) setCaptions(c); });
    return () => { alive = false; };
  }, []);
  return (
    <>
      <div className="set-row set-row-models">
        <div className="set-row-text">
          <div className="set-row-label">How fast Neo talks</div>
          <div className="set-row-desc">From the next conversation on. The same strip is on Neo’s own card while it is listening.</div>
        </div>
        <div className="set-seg">
          {PACES.map((p) => (
            <button
              key={p.id}
              type="button"
              className={pace === p.id ? 'on' : ''}
              aria-pressed={pace === p.id}
              onClick={() => { setPace(p.id); void zero()?.neoPace?.(p.id); }}
            >{p.label}</button>
          ))}
        </div>
      </div>
      <Row label="Show what Neo says" desc="Neo’s words appear on its card as it speaks. Off, it only talks.">
        <button
          type="button"
          role="switch"
          aria-checked={captions !== false}
          aria-label="Show what Neo says"
          className={`set-sw ${captions !== false ? 'on' : ''}`}
          onClick={() => { const next = captions === false; setCaptions(next); void zero()?.neoCaptions?.(next); }}
        />
      </Row>
    </>
  );
}

export function NeoSettings() {
  const { doc, trouble, change } = useNeoMemory();
  return (
    <div className="set-inner neo-page">
      <h1 className="set-title">Neo</h1>
      <p className="set-lede">
        Neo is the voice in {Name}: tap ⌘ twice from any app and talk to it about your threads.
        A conversation forgets everything when it ends. What is on this page does not — it reaches every conversation after it.
      </p>
      {trouble && <div className="set-error">{trouble}</div>}

      <Group id="neo-instructions" label="Instructions for Neo">
        <Row
          stack
          label="How you want Neo to work"
          desc="In your own words. This holds for every conversation, the way your agent instructions hold for every task."
        >
          {doc && <Instructions text={doc.instructions} onSave={(v) => change({ instructions: v })} />}
        </Row>
      </Group>

      <Group id="neo-memories" label="What Neo remembers">
        {doc?.memories.length === 0 && <Row label="Nothing yet" desc="Say “remember that…” while Neo is listening and the line turns up here." />}
        {doc?.memories.map((m) => (
          <Row key={m.id} label={m.text} desc={m.at > 0 ? versionLabel(m.at) : undefined}>
            <button type="button" className="set-ghost" onClick={() => void change({ forget: m.id })}>Forget</button>
          </Row>
        ))}
        <AddMemory onAdd={(text) => void change({ add: text })} />
      </Group>

      <Group id="neo-talks" label="How Neo talks">
        <HowNeoTalks />
      </Group>
    </div>
  );
}
