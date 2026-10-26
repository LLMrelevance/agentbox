// THE FIRST RUN (w-fadbbea8ef): a welcome, your folders, your Claude Code chats
// and a first real task, then the inbox. The rules are in ../first-run.ts.
//
// It holds the keyboard while it is up: one listener on the window, in the
// capture phase, so none of the inbox's own keys fire behind it. Typing in its
// fields still works, because nothing here cancels a key's default.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import type { Snapshot } from '../types';
import type { SessionThread } from '../agent-import-card';
import { projectNameFor } from '../agent-import-card';
import { shortPath } from '../onboarding';
import { ago } from '../format';
import { MAC } from '../this-keyboard';
import { taskTitle } from '../team/agent-mentions';
import { projectSwatch } from '../threads/composer-rules';
import {
  chatChoices, folderChoices, ideasFor, isSend, listKey, stepsFor, foldersLabel,
  type FolderChoice, type Step,
} from '../first-run';
import './first-run.css';

type Screen = 'welcome' | Step;
type Engine = 'claude' | 'codex';
type Made = { folder: string; slug: string; name: string };
type Sent = { id: string; title: string; at: number };

const ENGINE_NAME: Record<Engine, string> = { claude: 'Claude Code', codex: 'Codex' };
const SEND = MAC ? ['⌘', '↵'] : ['Ctrl', '↵'];
const LEAVE_MS = 260;

const Key = ({ k }: { k: string }) => <span className={`ob-key${[...k].length === 1 ? ' ob-k1' : ''}`}>{k}</span>;
const Keys = ({ ks }: { ks: string[] }) => <span className="ob-keys">{ks.map((k) => <Key key={k} k={k} />)}</span>;

/** The logo, drawn as AppMark draws it: nine dots, the top right one lit. */
function Mark() {
  const at = [21, 50, 79];
  return (
    <svg className="ob-logo" viewBox="10 10 80 80" width="56" height="56" aria-hidden="true">
      {at.map((cy, r) => at.map((cx, c) => (
        <circle key={`${r}${c}`} cx={cx} cy={cy} r="10.5"
          className={r === 0 && c === 2 ? 'ob-dot ob-dot-lit' : 'ob-dot'}
          style={{ animationDelay: r === 0 && c === 2 ? `${0.25 + 0.07 * ((2 - r) + c)}s, 1.05s` : `${0.25 + 0.07 * ((2 - r) + c)}s` }} />
      )))}
    </svg>
  );
}

function Legend({ pairs }: { pairs: Array<[string[], string]> }) {
  return (
    <div className="ob-legend">
      {pairs.map(([ks, what]) => <span key={what}><Keys ks={ks} />{what}</span>)}
    </div>
  );
}

function Steps({ steps, now }: { steps: Step[]; now: Step }) {
  const at = steps.indexOf(now);
  return (
    <div className="ob-steps" aria-hidden="true">
      {steps.map((s, i) => <i key={s} className={i < at ? 'ob-done' : i === at ? 'ob-now' : ''} />)}
    </div>
  );
}

/** ↵ beside the first thread after the first run, drawn as the app's own hint
 *  plate. It never takes the pointer and goes when a thread is opened. */
export function OpenLesson({ at }: { at: { left: number; top: number } | null }) {
  if (!at) return null;
  return (
    <div className="hint-plate ob-lesson" style={{ left: at.left, top: at.top }} aria-hidden="true">
      <div className="hint-line"><span className="hint-caps"><kbd>↵</kbd></span><span className="hint-what">Open task</span></div>
    </div>
  );
}

const said = (when: number) => {
  const a = ago(when);
  return /^\d/.test(a) ? `${a} ago` : a;
};

const clock = (since: number, now: number) => {
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function FirstRunFlow({ snap, home, onDone }: {
  snap: Snapshot | null;
  home: string;
  /** Called once, with the project the first task went to. */
  onDone: (product: string | null) => void;
}) {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [leaving, setLeaving] = useState(false);
  const [ready, setReady] = useState<Engine | null | undefined>(undefined);
  const [setup, setSetup] = useState<{ engine: Engine; phase: string; error: string | null } | null>(null);
  const [threads, setThreads] = useState<SessionThread[]>([]);
  const [extra, setExtra] = useState<FolderChoice[]>([]);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [names, setNames] = useState<Record<string, string>>({});
  const [renaming, setRenaming] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [refused, setRefused] = useState<string | null>(null);
  const [made, setMade] = useState<Made[]>([]);
  const [chatTicks, setChatTicks] = useState<Set<string>>(new Set());
  const [project, setProject] = useState(0);
  const [text, setText] = useState('');
  const [idea, setIdea] = useState(-1);
  const [sent, setSent] = useState<Sent[]>([]);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const field = useRef<HTMLTextAreaElement | null>(null);
  const renameField = useRef<HTMLInputElement | null>(null);

  // WHAT IS ON THIS COMPUTER, asked once.
  useEffect(() => {
    let live = true;
    (async () => {
      const [claude, codex] = await Promise.all([
        api.engineSetup('ready', 'claude').catch(() => null),
        api.engineSetup('ready', 'codex').catch(() => null),
      ]);
      if (!live) return;
      const ok = (s: { found?: boolean; signedIn?: boolean } | null) => !!s?.found && !!s?.signedIn;
      setReady(ok(claude) ? 'claude' : ok(codex) ? 'codex' : null);
    })();
    api.agentThreads().then((t) => { if (live) setThreads(t); }).catch(() => {});
    return () => { live = false; };
  }, []);

  // AN AGENT BEING INSTALLED OR SIGNED IN, watched until it is ready.
  useEffect(() => {
    if (!setup || setup.phase === 'ready' || setup.phase === 'failed') return undefined;
    const tick = setInterval(async () => {
      const s = await api.engineSetup('status', setup.engine).catch(() => null);
      if (!s) return;
      setSetup({ engine: setup.engine, phase: s.phase, error: s.error ?? null });
      if (s.phase === 'ready') setReady(setup.engine);
    }, 1000);
    return () => clearInterval(tick);
  }, [setup]);

  // The clock on a running task moves once a second.
  useEffect(() => {
    if (!sent.length) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sent.length]);

  const choices = useMemo(() => {
    const found = folderChoices(threads, { home });
    const seen = new Set(found.map((f) => f.folder));
    return [...found, ...extra.filter((f) => !seen.has(f.folder))];
  }, [threads, home, extra]);

  // The busiest folder starts ticked, once the list has arrived.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !choices.length) return;
    seeded.current = true;
    setTicked(new Set([choices[0].folder]));
  }, [choices]);

  const chats = useMemo(() => chatChoices(threads, made.map((m) => m.folder)), [threads, made]);
  const steps = stepsFor({ chats: made.length ? chats.length : threads.length });

  const go = useCallback((next: Screen) => {
    setLeaving(true);
    setTimeout(() => { setScreen(next); setCursor(0); setLeaving(false); }, LEAVE_MS);
  }, []);

  const startSetup = useCallback(async (engine: Engine) => {
    const s = await api.engineSetup('start', engine).catch(() => null);
    setSetup({ engine, phase: s?.phase ?? 'installing', error: s?.error ?? null });
  }, []);

  const chooseAnother = useCallback(async () => {
    const r = await api.chooseFolder(home || undefined);
    if (r.refused) { setRefused(r.refused); return; }
    if (!r.path) return;
    setRefused(null);
    const folder = r.path.replace(/\/+$/, '');
    const choice: FolderChoice = { folder, name: projectNameFor({ name: folder.split('/').pop() ?? '' }), short: shortPath(folder, home), chats: 0, when: Date.now() };
    setExtra((had) => (had.some((f) => f.folder === folder) ? had : [...had, choice]));
    setTicked((had) => new Set([...had, folder]));
  }, [home]);

  const takeFolders = useCallback(async () => {
    const picked = choices.filter((c) => ticked.has(c.folder));
    if (!picked.length || busy) return;
    setBusy(true);
    const out: Made[] = [];
    const taken: string[] = (snap?.products ?? []).map((p) => p.name);
    for (const c of picked) {
      const name = projectNameFor({ name: (names[c.folder] ?? c.name).trim() || c.name }, taken);
      try {
        const got = await api.createProduct({ name, repoPath: c.folder, ofMany: picked.length > 1 }) as { slug?: string } | null;
        if (got?.slug) { out.push({ folder: c.folder, slug: got.slug, name }); taken.push(name); }
      } catch { /* a folder the store refused is left out rather than stopping the rest */ }
    }
    setBusy(false);
    if (!out.length) return;
    setMade(out);
    const waiting = chatChoices(threads, out.map((m) => m.folder));
    setChatTicks(new Set(waiting.map((t) => t.id)));
    go(waiting.length ? 'chats' : 'task');
  }, [choices, ticked, names, busy, snap, threads, go]);

  const bringIn = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    for (const m of made) {
      const ids = chats.filter((t) => t.folder.replace(/\/+$/, '') === m.folder && chatTicks.has(t.id)).map((t) => t.id);
      if (ids.length) await api.importThreads({ product: m.slug, threads: ids, land: 'inbox' }).catch(() => null);
    }
    setBusy(false);
    go('task');
  }, [busy, made, chats, chatTicks, go]);

  const send = useCallback(async () => {
    const said = text.trim();
    const into = made[project];
    if (!said || !into || busy) return;
    setBusy(true);
    const body = said.includes('\n') ? said : undefined;
    const item = await api.compose({ product: into.slug, title: taskTitle(said), body, kind: 'directive', priority: 5 }).catch(() => null);
    setBusy(false);
    if (!item?.id) return;
    setSent((had) => [...had, { id: item.id, title: taskTitle(said), at: Date.now() }]);
    setText('');
    setIdea(-1);
    field.current?.focus();
  }, [text, made, project, busy]);

  const finish = useCallback(() => onDone(made[project]?.slug ?? made[0]?.slug ?? null), [onDone, made, project]);

  const ideas = ideasFor(made[project]?.name ?? 'your project');

  // THE KEYBOARD, for every screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (leaving) return;
      if (screen === 'welcome') {
        if (e.key === 'Enter' && ready) { e.preventDefault(); go('folders'); }
        else if (!ready && e.key === '1') startSetup('claude');
        else if (!ready && e.key === '2') startSetup('codex');
        return;
      }
      if (screen === 'folders') {
        if (renaming) {
          if (e.key === 'Enter' || e.key === 'Tab' || e.key === 'Escape') {
            e.preventDefault();
            if (e.key === 'Escape') setNames((n) => { const { [renaming]: _drop, ...rest } = n; return rest; });
            setRenaming(null);
          }
          return;
        }
        const rows = choices.length + 1;
        const k = listKey(e);
        if (!k) return;
        e.preventDefault();
        if (k === 'up') setCursor((c) => Math.max(0, c - 1));
        if (k === 'down') setCursor((c) => Math.min(rows - 1, c + 1));
        if (k === 'toggle') {
          if (cursor === choices.length) chooseAnother();
          else {
            const f = choices[cursor].folder;
            setTicked((had) => { const n = new Set(had); if (n.has(f)) n.delete(f); else n.add(f); return n; });
          }
        }
        if (k === 'rename' && cursor < choices.length) setRenaming(choices[cursor].folder);
        if (k === 'next') takeFolders();
        return;
      }
      if (screen === 'chats') {
        const k = listKey(e);
        if (!k) return;
        e.preventDefault();
        if (k === 'up') setCursor((c) => Math.max(0, c - 1));
        if (k === 'down') setCursor((c) => Math.min(chats.length - 1, c + 1));
        if (k === 'toggle' && chats[cursor]) {
          const id = chats[cursor].id;
          setChatTicks((had) => { const n = new Set(had); if (n.has(id)) n.delete(id); else n.add(id); return n; });
        }
        if (k === 'next') bringIn();
        if (k === 'skip') go('task');
        return;
      }
      if (screen === 'task') {
        if (isSend(e)) { e.preventDefault(); send(); return; }
        if (e.key === 'Escape') { e.preventDefault(); finish(); return; }
        if (sent.length) return;
        const inField = document.activeElement === field.current;
        const onLastLine = inField && !text.slice(field.current?.selectionStart ?? 0).includes('\n');
        if (e.key === 'ArrowDown' && (idea >= 0 || onLastLine)) { e.preventDefault(); setIdea((i) => Math.min(ideas.length - 1, i + 1)); field.current?.blur(); }
        else if (e.key === 'ArrowUp' && idea >= 0) {
          e.preventDefault();
          if (idea === 0) { setIdea(-1); field.current?.focus(); } else setIdea((i) => i - 1);
        } else if (e.key === 'Enter' && idea >= 0) {
          e.preventDefault();
          setText(ideas[idea]);
          setIdea(-1);
          setTimeout(() => { const f = field.current; if (f) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); } }, 0);
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [screen, leaving, ready, renaming, choices, cursor, chats, chatTicks, idea, ideas, text, sent.length, go, startSetup, chooseAnother, takeFolders, bringIn, send, finish]);

  useEffect(() => { if (renaming) renameField.current?.select(); }, [renaming]);
  useEffect(() => { if (screen === 'task' && !leaving) field.current?.focus(); }, [screen, leaving]);

  // The field grows with what is typed in it.
  useEffect(() => {
    const f = field.current;
    if (!f) return;
    f.style.height = 'auto';
    f.style.height = `${f.scrollHeight}px`;
  }, [text, screen]);

  const running = (id: string) => snap?.supervisor.running.find((r) => r.itemId === id) ?? null;
  const cls = `ob-screen${leaving ? ' ob-leaving' : ''}`;

  return (
    <div className="first-run" role="dialog" aria-label="Set up">
      {screen === 'welcome' && (
        <div className={cls} key="welcome">
          <div className="ob-col ob-mid ob-center">
            <Mark />
            {ready === null ? (
              <>
                <h1 className="ob-big ob-in" style={{ animationDelay: '1.3s' }}>Install Claude Code or Codex to start</h1>
                <div className="ob-actions ob-in" style={{ animationDelay: '1.6s', marginTop: 40 }}>
                  <button type="button" className="ob-btn" onClick={() => startSetup('claude')}>Install Claude Code <Key k="1" /></button>
                  <button type="button" className="ob-btn" onClick={() => startSetup('codex')}>Install Codex <Key k="2" /></button>
                </div>
              </>
            ) : (
              <>
                <h1 className="ob-big ob-in" style={{ animationDelay: '1.3s' }}>Give your agents an inbox</h1>
                <div className="ob-actions ob-in" style={{ animationDelay: '1.6s', marginTop: 40 }}>
                  <button type="button" className="ob-btn" disabled={!ready} onClick={() => go('folders')}>Get started <Key k="↵" /></button>
                </div>
              </>
            )}
          </div>
          <div className="ob-check ob-foot ob-in" style={{ animationDelay: '2.1s' }}>
            {setup && setup.phase !== 'ready' ? (
              <>
                <span className="ob-sq ob-live" />{ENGINE_NAME[setup.engine]}
                <b>{setup.phase === 'failed' ? (setup.error ?? 'did not finish') : setup.phase === 'signing-in' ? 'finish in your browser' : 'installing'}</b>
              </>
            ) : ready ? (
              <><span className="ob-sq" />{ENGINE_NAME[ready]} <b>ready</b></>
            ) : ready === null ? (
              <><span className="ob-sq ob-off" />No coding agent <b>found</b></>
            ) : (
              <><span className="ob-sq ob-off" />Checking this computer</>
            )}
          </div>
        </div>
      )}

      {screen === 'folders' && (
        <div className={cls} key="folders">
          <Steps steps={steps} now="folders" />
          <div className="ob-col">
            <h1 className="ob-in">Where should your agents work?</h1>
            <div className="ob-list" style={{ marginTop: 28 }}>
              {choices.map((c, i) => (
                <div key={c.folder} className={`ob-item ob-in${cursor === i ? ' ob-on' : ''}`} style={{ animationDelay: `${0.12 + 0.05 * i}s` }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setCursor(i); setTicked((had) => { const n = new Set(had); if (n.has(c.folder)) n.delete(c.folder); else n.add(c.folder); return n; }); }}
                  onDoubleClick={() => setRenaming(c.folder)}>
                  <div className="ob-slot"><span className={`ob-tick${ticked.has(c.folder) ? ' ob-on' : ''}`} /></div>
                  <div className="ob-name">
                    {renaming === c.folder ? (
                      <input ref={renameField} className="ob-rename" value={names[c.folder] ?? c.name}
                        style={{ width: `${Math.max(4, (names[c.folder] ?? c.name).length + 1)}ch` }}
                        onChange={(e) => setNames((n) => ({ ...n, [c.folder]: e.target.value }))}
                        onBlur={() => setRenaming(null)} onClick={(e) => e.stopPropagation()} />
                    ) : <span>{names[c.folder] ?? c.name}</span>}
                    <small>{c.short}</small>
                  </div>
                  <div className="ob-meta">{c.chats ? `${c.chats} ${c.chats === 1 ? 'chat' : 'chats'}` : ''}</div>
                </div>
              ))}
              <div className={`ob-item ob-in${cursor === choices.length ? ' ob-on' : ''}`} style={{ animationDelay: `${0.12 + 0.05 * choices.length}s` }}
                onClick={() => { setCursor(choices.length); chooseAnother(); }}>
                <div className="ob-slot ob-plus">+</div>
                <div className="ob-name ob-faint"><span>Choose another folder</span></div>
                <div />
              </div>
            </div>
            {refused && <p className="ob-refused">{refused}</p>}
            <div className="ob-actions ob-in" style={{ marginTop: 28, animationDelay: '0.4s' }}>
              <button type="button" className="ob-btn" disabled={!ticked.size || busy} onClick={takeFolders}>{foldersLabel(ticked.size)} <Keys ks={SEND} /></button>
            </div>
          </div>
          <Legend pairs={[[['↑', '↓'], 'Move'], [['↵'], 'Tick a folder'], [['⇥'], 'Rename']]} />
        </div>
      )}

      {screen === 'chats' && (
        <div className={cls} key="chats">
          <Steps steps={steps} now="chats" />
          <div className="ob-col">
            <h1 className="ob-in">Bring in your latest Claude Code chats</h1>
            <div className="ob-list" style={{ marginTop: 28 }}>
              {chats.map((t, i) => (
                <div key={t.id} className={`ob-item ob-in${cursor === i ? ' ob-on' : ''}`} style={{ animationDelay: `${0.12 + 0.05 * i}s` }}
                  onClick={() => { setCursor(i); setChatTicks((had) => { const n = new Set(had); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; }); }}>
                  <div className="ob-slot"><span className={`ob-tick${chatTicks.has(t.id) ? ' ob-on' : ''}`} /></div>
                  <div className="ob-name"><span>{t.title}</span></div>
                  <div className="ob-meta">{made.find((m) => m.folder === t.folder.replace(/\/+$/, ''))?.name ?? t.folderName} · {said(t.when)}</div>
                </div>
              ))}
            </div>
            <div className="ob-actions ob-in" style={{ marginTop: 28, animationDelay: '0.4s' }}>
              <button type="button" className="ob-btn" disabled={busy} onClick={bringIn}>
                {chatTicks.size === 1 ? 'Bring in 1 chat' : `Bring in ${chatTicks.size} chats`} <Keys ks={SEND} />
              </button>
              <button type="button" className="ob-btn ob-quiet" onClick={() => go('task')}>Not now <Key k="esc" /></button>
            </div>
          </div>
          <Legend pairs={[[['↑', '↓'], 'Move'], [['↵'], 'Tick a chat']]} />
        </div>
      )}

      {screen === 'task' && (
        <div className={cls} key="task">
          <Steps steps={steps} now="task" />
          <div className="ob-col">
            <h1 className="ob-in">{sent.length ? 'Add another while it works' : 'Give an agent its first task'}</h1>
            {sent.length > 0 && (
              <div className="ob-list" style={{ marginTop: 28 }}>
                {sent.map((s) => {
                  const r = running(s.id);
                  return (
                    <div key={s.id} className="ob-item ob-arrive">
                      <div className="ob-slot"><span className="ob-sq ob-live ob-pulse" /></div>
                      <div className="ob-name"><span>{s.title}</span></div>
                      <div className="ob-meta"><span className="ob-path">{r?.activity?.[0]?.label ?? 'Starting'}</span><span className="ob-clock">{clock(r?.startedAt ?? s.at, now)}</span></div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="ob-in" style={{ marginTop: 36, animationDelay: '0.1s' }}>
              <textarea ref={field} className="ob-write" rows={1} value={text} placeholder="What do you need done?"
                onChange={(e) => { setText(e.target.value); setIdea(-1); }} onFocus={() => setIdea(-1)} />
              <div className="ob-bar">
                <div className="ob-chips">
                  {made.length > 0 && (
                    <button type="button" className="ob-chip" title={made.length > 1 ? 'Another project' : undefined}
                      onClick={() => setProject((p) => (p + 1) % made.length)}>
                      <span className="ob-sw" style={{ background: projectSwatch(made[project]?.slug ?? '') }} />{made[project]?.name}
                    </button>
                  )}
                </div>
                <div className="ob-actions">
                  {sent.length > 0 && <button type="button" className="ob-btn ob-quiet" onClick={finish}>Open my inbox <Key k="esc" /></button>}
                  <button type="button" className="ob-btn" disabled={!text.trim() || busy} onClick={send}>Send <Keys ks={SEND} /></button>
                </div>
              </div>
            </div>
            {!sent.length && (
              <div className="ob-ideas ob-in" style={{ animationDelay: '0.2s' }}>
                {ideas.map((t, i) => (
                  <div key={t} className={`ob-item ob-noslot${idea === i ? ' ob-on' : ''}`}
                    onClick={() => { setText(t); setIdea(-1); field.current?.focus(); }}>
                    <div className={`ob-name${idea === i ? '' : ' ob-dim'}`}><span>{t}</span></div><div />
                  </div>
                ))}
              </div>
            )}
          </div>
          {!sent.length && <Legend pairs={[[['↓'], 'Pick an idea']]} />}
        </div>
      )}
    </div>
  );
}
