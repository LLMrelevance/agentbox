// The teammates' pages: the one team chat, each teammate's view of it with what
// it is on beside it, its About, the roster with who else could help, and the
// six to start from when there is nobody yet.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Product, Teammate, TeammatesView, TeamChatLine, TeamRunLine } from '../types';
import { api } from '../api';
import { MAX_HOPS, STARTERS, type Starter } from '../../../shared/teammates.mjs';
import { rememberedProject } from '../compose-project';
import { answerTo, chatEntries, clockOf, dayOf, heldFor, heldTitle, nameOf, type ChatEntry } from './chat-lines';
import { TeammateMark } from './TeammatesRail';
import './teammates.css';

const MD = [remarkGfm];
const ICON = {
  dots: <i className="tq-dots" aria-hidden="true" />,
  check: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>,
  inbox: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4.5 13.2 6.7 6.4A2 2 0 0 1 8.6 5h6.8a2 2 0 0 1 1.9 1.4l2.2 6.8V17a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z" /><path d="M4.5 13.2h4.1l1.1 2.1h4.6l1.1-2.1h4.1" /></svg>,
  arrow: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
  plus: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>,
  keep: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true"><path d="M7 4.5h10v15l-5-3.8-5 3.8z" /></svg>,
  reply: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 7 4 12l5 5" /><path d="M4 12h10a6 6 0 0 1 6 6" /></svg>,
  pause: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M9 6v12M15 6v12" /></svg>,
};

const YOU_GLYPH = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.5" /><path d="M5 19.5c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></svg>;

/** What the store handed back, or false when it refused (the reason is shown). */
type Call = (op: string, args: Record<string, unknown>) => Promise<unknown>;

export function TeammatesTitle({ view, open }: { view: TeammatesView | null; open: string }) {
  const t = view?.list.find((x) => x.id === open) ?? null;
  if (!t) return <h1 className="workspace-title">Teammates</h1>;
  return <h1 className="workspace-title tq-title"><TeammateMark t={t} size="hd" /><span>{t.name}</span>{t.role && <span className="tq-role">{t.role}</span>}</h1>;
}

export function TeammatesPage({ view, open, products, engines, onTab, onOpenTeammate, onOpenThread, onChanged, me }: {
  view: TeammatesView | null;
  /** 'team' for the chat, 'roster' for the Teammates tab, or a teammate's id. */
  open: string;
  products: Product[];
  engines: { id: string; label: string }[];
  onTab: (tab: 'team' | 'roster') => void;
  onOpenTeammate: (id: string) => void;
  onOpenThread: (product: string, id: string) => void;
  onChanged: () => void;
  me: string;
}) {
  const team = view?.list ?? [];
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setError(null); }, [open]);
  const call: Call = async (op, args) => {
    setError(null);
    const r = await api.teammates(op, args);
    if (!r.ok) { setError(r.error); return false; }
    onChanged();
    return r.value ?? true;
  };
  const t = team.find((x) => x.id === open) ?? null;

  if (!t && !team.length) return <div className="tq-page"><Starters products={products} engines={engines} call={call} error={error} onOpen={onOpenTeammate} /></div>;
  if (!t) {
    return <div className="tq-page tq-team">
      <div className="th-bar"><div className="tm-tabs">
        <button type="button" className={`tm-tab${open === 'team' ? ' on' : ''}`} onClick={() => onTab('team')}>Chat</button>
        <button type="button" className={`tm-tab${open === 'roster' ? ' on' : ''}`} onClick={() => onTab('roster')}>Teammates<b>{team.length}</b></button>
      </div></div>
      {open === 'roster'
        ? <Roster team={team} products={products} engines={engines} call={call} error={error} onOpen={onOpenTeammate} />
        : <ChatColumn view={view} team={team} only={null} me={me} call={call} onOpenThread={onOpenThread} placeholder="Message the team. @Name wakes that teammate." error={error} />}
    </div>;
  }
  return <div className="tq-page tq-one">
    <ChatColumn view={view} team={team} only={t} me={me} call={call} onOpenThread={onOpenThread} placeholder={t.status === 'draft' ? `Answer ${t.name === 'New teammate' ? 'your new teammate' : t.name}` : `Message ${t.name}`} error={error} />
    <SidePanel t={t} products={products} engines={engines} call={call} onOpenThread={onOpenThread} />
  </div>;
}

/* ------------------------------------------------------------------ chat */
function ChatColumn({ view, team, only, me, call, onOpenThread, placeholder, error }: {
  view: TeammatesView | null; team: Teammate[]; only: Teammate | null; me: string; call: Call;
  onOpenThread: (product: string, id: string) => void; placeholder: string; error: string | null;
}) {
  const entries = useMemo(() => chatEntries(view, only?.id ?? null), [view, only?.id]);
  const scroller = useRef<HTMLDivElement>(null);
  const last = entries.at(-1)?.id;
  useEffect(() => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight; }, [last, only?.id]);
  let day = '';
  let prevFrom = '';
  const rows: ReactNode[] = [];
  for (const e of entries) {
    const d = dayOf(e.ts);
    if (d !== day) { rows.push(<div key={`day-${e.id}`} className="rm-day"><span className="rm-label">{d}</span></div>); day = d; prevFrom = ''; }
    if (e.kind === 'msg') {
      const lead = e.from !== prevFrom;
      rows.push(<Message key={e.id} m={e} team={team} me={me} lead={lead} only={only} call={call} onOpenThread={onOpenThread} answered={answerTo(view, e)} />);
      prevFrom = e.from;
    } else {
      rows.push(<Activity key={e.id} e={e} view={view} team={team} only={only} call={call} onOpenThread={onOpenThread} />);
      // A message after an activity line says who it is from again.
      prevFrom = '';
    }
  }
  return <div className="tq-chat">
    <div className="tq-lines" ref={scroller}>
      {rows.length ? rows : <p className="tq-empty">{only ? `Nothing yet. Say hello to ${only.name}.` : 'Nothing yet. Write to a teammate with @Name, or open one on the left.'}</p>}
    </div>
    {error && <p className="tq-error" role="alert">{error}</p>}
    {!error && (view?.trouble || view?.error) && <p className="tq-error" role="status">{view?.trouble ?? `Teammates could not be read: ${view?.error}`}</p>}
    <Composer placeholder={placeholder} onSend={async (text) => (await call('post', { text, to: only ? [only.id] : [] })) !== false} />
  </div>;
}

function Message({ m, team, me, lead, only, call, onOpenThread, answered }: { m: TeamChatLine; team: Teammate[]; me: string; lead: boolean; only: Teammate | null; call: Call; onOpenThread: (product: string, id: string) => void; answered: string | null }) {
  const t = team.find((x) => x.id === m.from) ?? null;
  const mine = m.from === 'you';
  const to = (Array.isArray(m.to) ? m.to : []).map((x) => nameOf(x, team));
  return <div className={`rm-cm tq-m${lead ? '' : ' tq-cont'}`}>
    {lead && <div className="h">
      {mine ? <span className="rm-pic rm-ini tq-you" aria-hidden="true">{me.trim() ? initials(me) : YOU_GLYPH}</span> : <TeammateMark t={t} size="pic" />}
      <span>{mine ? 'You' : t?.name ?? 'A teammate'}</span>
      {mine && to.length > 0 && <span className="tq-to">to {to.join(', ')}</span>}
      {mine && m.via && m.viaProduct && <button type="button" className="tq-to tq-link" onClick={() => onOpenThread(m.viaProduct!, m.via!)}>from a thread</button>}
      <em>{clockOf(m.ts)}</em>
    </div>}
    <div className="tx"><ReactMarkdown remarkPlugins={MD}>{m.text ?? ''}</ReactMarkdown>
      {!mine && t && m.options?.length ? <div className="tq-chips">{m.options.map((o) => (
        <button key={o} type="button" className={`tq-chip${answered === null ? '' : answered.trim() === o ? ' on' : ' dim'}`} disabled={answered !== null}
          onClick={() => { void call('post', { text: o, to: [t.id] }); }}>{o}</button>
      ))}</div> : null}
    </div>
  </div>;
}

function Activity({ e, view, team, only, call, onOpenThread }: { e: ChatEntry; view: TeammatesView | null; team: Teammate[]; only: Teammate | null; call: Call; onOpenThread: (product: string, id: string) => void }) {
  const who = only ? '' : `${nameOf(e.kind === 'run' ? e.teammate : e.from, team)} `;
  const time = <em>{clockOf(e.ts)}</em>;
  if (e.kind === 'run') {
    const r = e as TeamRunLine;
    const open = () => onOpenThread(r.product, r.item);
    if (r.verb === 'sent') {
      return <div className="tq-act">{ICON.inbox}<span><span className="v">{who}{only ? 'Sent you' : 'sent you'}</span> <button type="button" className="tq-link" onClick={open}>{r.title}</button></span>{time}
        {r.waiting ? <span className="tq-st need">Waiting on you</span> : r.answered ? <span className="tq-st">Answered</span> : null}</div>;
    }
    if (r.verb === 'answered') {
      return <div className="tq-act">{ICON.reply}<span><span className="v">{only ? 'You answered' : `You answered ${nameOf(r.teammate, team)}`}</span> <button type="button" className="tq-link" onClick={open}>“{r.text ?? r.title}”</button></span>{time}</div>;
    }
    if (r.verb === 'queued') return <div className="tq-act tq-next">{ICON.dots}<span><span className="v">{only ? 'Next' : `Next for ${nameOf(r.teammate, team)}`}</span> <button type="button" className="tq-link" onClick={open}>{r.title}</button></span>{time}</div>;
    if (r.verb === 'finished') return <div className="tq-act">{ICON.check}<span><span className="v">{who}{only ? 'Finished' : 'finished'}</span> <button type="button" className="tq-link" onClick={open}>{r.title}</button></span>{time}</div>;
    return <div className="tq-act">{ICON.dots}<span><span className="v">{who}{only ? 'Picked up' : 'picked up'}</span> <button type="button" className="tq-link" onClick={open}>{r.title}</button></span>{time}</div>;
  }
  const c = e as TeamChatLine;
  if (c.kind === 'pass') {
    return <div className="tq-act">{ICON.arrow}<span><span className="v">{only?.id === c.from ? 'Passed' : `${nameOf(c.from, team)} passed`}</span> {c.title} <span className="v">to {nameOf(typeof c.to === 'string' ? c.to : c.to?.[0], team)}</span></span>{time}</div>;
  }
  if (c.verb === 'learned') {
    const owner = c.from;
    const stillKept = team.find((t) => t.id === owner)?.memory.some((m) => m.id === c.ref);
    return <div className="tq-act">{ICON.keep}<span><span className="v">{who}{only ? 'Learned' : 'learned'}</span> {c.text}</span>{time}
      {stillKept ? <button type="button" className="tq-key" onClick={() => { void call('forget', { id: owner, memory: c.ref }); }}>Undo</button> : <span className="tq-st">Undone</span>}</div>;
  }
  if (c.verb === 'hops') {
    const owner = c.from;
    const what = heldTitle(view, c);
    const still = heldFor(view, owner)?.id === c.id;
    return <div className="tq-act">{ICON.pause}<span><span className="v">{only ? 'Holding' : `${nameOf(owner, team)} is holding`}</span> {what} <span className="v">until you say go, after {MAX_HOPS} hand-offs without you</span></span>{time}
      {still ? <button type="button" className="tq-key" onClick={() => { void call('goAhead', { id: owner, ref: c.ref }); }}>Go ahead</button> : <span className="tq-st">Going ahead</span>}</div>;
  }
  if (c.verb === 'started') return <div className="tq-act">{ICON.plus}<span><span className="v">Started</span> {nameOf(c.from, team)}</span>{time}</div>;
  if (c.verb === 'paused' || c.verb === 'resumed') return <div className="tq-act">{ICON.pause}<span><span className="v">{c.verb === 'paused' ? 'Paused' : 'Resumed'}</span> {nameOf(c.from, team)}</span>{time}</div>;
  return <div className="tq-act tq-note"><span>{c.text}</span>{time}</div>;
}

function Composer({ placeholder, onSend }: { placeholder: string; onSend: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const words = text.trim();
    if (!words || busy) return;
    setBusy(true);
    const ok = await onSend(words);
    setBusy(false);
    if (ok) setText('');
  };
  return <div className="rm-compose tq-compose">
    <textarea className="tq-input" value={text} placeholder={placeholder} rows={1} aria-label={placeholder}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} />
    <div className="rm-compose-bar"><span />
      <button type="button" className="dock-send" disabled={!text.trim() || busy} onClick={() => void send()} title="Send · ↵">Send <kbd>↵</kbd></button>
    </div>
  </div>;
}

/* ----------------------------------------------------------------- panel */
function SidePanel({ t, products, engines, call, onOpenThread }: { t: Teammate; products: Product[]; engines: { id: string; label: string }[]; call: Call; onOpenThread: (product: string, id: string) => void }) {
  const [editing, setEditing] = useState(false);
  useEffect(() => { setEditing(false); }, [t.id]);
  if (editing) return <aside className="gr-side tq-side"><About t={t} products={products} engines={engines} call={call} onDone={() => setEditing(false)} /></aside>;
  return <aside className="gr-side tq-side">
    {t.status === 'draft' && <div className="tq-sec"><div className="tq-sh">Setting up</div><div className="tq-sv dim">It sets itself up from what you wrote, and asks you in the chat if anything is unclear.</div></div>}
    <div className="tq-sec"><div className="tq-sh">Goal<button type="button" className="tq-edit" onClick={() => setEditing(true)}>Edit</button></div><div className="tq-sv">{t.goal ?? <span className="dim">No goal yet</span>}</div>
      <div className="tq-sv dim tq-works">{t.worksLabel ? `Works ${t.worksLabel}` : 'Works when someone writes to it'}{t.engine && engines.length > 1 ? `, on ${engines.find((e) => e.id === t.engine)?.label ?? t.engine}` : ''}</div></div>
    {(t.waiting.length > 0 || t.asking || t.question || t.held) && <div className="tq-sec"><div className="tq-sh">Waiting on you</div>
      {t.question && <div className="tq-li need">Its question in the chat</div>}
      {t.held && <div className="tq-li need">Work it is holding for your go-ahead</div>}
      {t.asking && t.running && <button type="button" className="tq-li need" onClick={() => onOpenThread(t.running!.product, t.running!.id)}>Allow or deny a command</button>}
      {t.waiting.map((w) => <button key={w.id} type="button" className="tq-li need" onClick={() => onOpenThread(w.product, w.id)}>{w.title}</button>)}</div>}
    <div className="tq-sec"><div className="tq-sh">Now{t.paused && <button type="button" className="tq-edit" onClick={() => { void call('update', { id: t.id, patch: { paused: false } }); }}>Resume</button>}</div>
      <div className={`tq-li${t.running ? ' now' : ''}`}>{t.running && ICON.dots}{t.now && t.now !== 'Waiting on you' && t.now !== 'Paused' ? t.now : t.paused ? 'Paused. It works only when you write to it.' : t.worksLabel ? `Free until its next round, ${t.worksLabel}` : 'Free until someone writes to it'}</div>
      {t.queued > 0 && <div className="tq-li dim">{t.queued} more queued</div>}</div>
    {t.done.length > 0 && <div className="tq-sec"><div className="tq-sh">Done today<b>{t.done.length}</b></div>
      {t.done.map((d) => <button key={d.id} type="button" className="tq-li" onClick={() => onOpenThread(d.product, d.id)}>{ICON.check}{d.title}</button>)}</div>}
  </aside>;
}

const EVERY = [
  { id: 'never', label: 'Only when someone writes to it' },
  { id: 'weekday', label: 'Weekdays' },
  { id: 'day', label: 'Every day' },
  { id: 'week', label: 'Once a week' },
];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Every field is kept the moment it changes, so leaving the panel any way at
// all loses nothing. A power tester's change of project was lost to a Done
// that had scrolled out of sight.
function About({ t, products, engines, call, onDone }: { t: Teammate; products: Product[]; engines: { id: string; label: string }[]; call: Call; onDone: () => void }) {
  const [f, setF] = useState(() => ({
    name: t.name, role: t.role ?? '', job: t.job ?? '', goal: t.goal ?? '', counted: t.counted ?? '', asksFirst: t.asksFirst ?? '',
    every: t.works?.every ?? 'never', at: t.works?.at ?? '09:00', on: t.works?.on ?? 1, limit: String(t.limit), product: t.product, engine: t.engine ?? '',
  }));
  type F = typeof f;
  const keep = (patch: Record<string, unknown>) => { void call('update', { id: t.id, patch }); };
  const worksOf = (x: F) => (x.every === 'never' ? null : { every: x.every, at: x.at || '09:00', ...(x.every === 'week' ? { on: Number(x.on) } : {}) });
  // A choice is kept at once; typing is kept when the box is left.
  const choose = (k: keyof F, v: string | number) => {
    const next = { ...f, [k]: v };
    setF(next);
    if (k === 'every' || k === 'on' || k === 'at') keep({ works: worksOf(next) });
    else if (k === 'product') keep({ product: v });
    else if (k === 'engine') keep({ engine: v || null });
  };
  const typed = (k: keyof F, v: string) => setF((x) => ({ ...x, [k]: v }));
  const was: Record<string, string> = { name: t.name, role: t.role ?? '', job: t.job ?? '', goal: t.goal ?? '', counted: t.counted ?? '', asksFirst: t.asksFirst ?? '', limit: String(t.limit) };
  const left = (k: keyof F) => {
    const v = String(f[k]).trim();
    if (v === (was[k] ?? '').trim()) return;
    if (k === 'name' && !v) { typed('name', t.name); return; }
    if (k === 'limit') { const n = Number(v); if (n > 0) keep({ limit: n }); else typed('limit', String(t.limit)); return; }
    keep({ [k]: v });
  };
  const field = (label: string, k: keyof F, long = false) => <label className="tq-f"><span className="l">{label}</span>
    {long
      ? <textarea className="tq-in" rows={3} value={String(f[k])} onChange={(e) => typed(k, e.target.value)} onBlur={() => left(k)} />
      : <input className="tq-in" value={String(f[k])} onChange={(e) => typed(k, e.target.value)} onBlur={() => left(k)} />}</label>;
  return <div className="tq-about">
    <div className="tq-cardhead"><span className="n">About {t.name}</span>
      <span className="tq-heads">
        <button type="button" className="tq-edit" onClick={() => keep({ paused: !t.paused })}>{t.paused ? 'Resume' : 'Pause'}</button>
        <button type="button" className="tq-edit" onClick={onDone}>Done</button>
      </span></div>
    {field('Name', 'name')}
    {field('Role', 'role')}
    {field('Job', 'job', true)}
    {field('Goal', 'goal')}
    {field('How it counts', 'counted')}
    {field('Asks you first', 'asksFirst')}
    <label className="tq-f"><span className="l">Works on its own</span>
      <span className="tq-row2"><select className="tq-in" value={f.every} onChange={(e) => choose('every', e.target.value)}>{EVERY.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
        {f.every === 'week' && <select className="tq-in" value={f.on} onChange={(e) => choose('on', Number(e.target.value))}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>}
        {f.every !== 'never' && <input className="tq-in tq-time" type="time" value={f.at} onChange={(e) => typed('at', e.target.value)} onBlur={() => { if (f.at !== (t.works?.at ?? '')) keep({ works: worksOf(f) }); }} />}</span></label>
    <label className="tq-f"><span className="l">Project</span><select className="tq-in" value={f.product} onChange={(e) => choose('product', e.target.value)}>{products.filter((p) => !p.practice).map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</select></label>
    {engines.length > 1 && <label className="tq-f"><span className="l">Runs on</span><select className="tq-in" value={f.engine} onChange={(e) => choose('engine', e.target.value)}><option value="">Your default</option>{engines.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</select></label>}
    <label className="tq-f"><span className="l">Runs a week</span><input className="tq-in tq-num" type="number" min={1} max={500} value={f.limit} onChange={(e) => typed('limit', e.target.value)} onBlur={() => left('limit')} /><span className="s">{t.runsThisWeek} used this week</span></label>
    <div className="tq-f"><span className="l">Knows about you</span>
      {t.memory.length ? <ul>{t.memory.map((m) => <li key={m.id}>{m.text}<button type="button" className="tq-x" aria-label={`Forget ${m.text}`} title="Forget" onClick={() => { void call('forget', { id: t.id, memory: m.id }); }}>×</button></li>)}</ul> : <span className="s">Nothing yet. It keeps what you tell it from now on.</span>}
    </div>
  </div>;
}

/* ---------------------------------------------------------- roster, starters */
// Where new teammates work: the project you last sent a thread to, else one
// with code in it, since most starters work on code.
function useWorkIn(products: Product[], engines: { id: string; label: string }[] = []) {
  const [engine, setEngine] = useState('');
  const real = products.filter((p) => !p.practice);
  const [slug, setSlug] = useState<string | null>(() => {
    const last = rememberedProject();
    return real.find((p) => p.slug === last)?.slug ?? real.find((p) => p.repoPath)?.slug ?? real[0]?.slug ?? null;
  });
  const shown = real.some((p) => p.slug === slug) ? slug : real.find((p) => p.repoPath)?.slug ?? real[0]?.slug ?? null;
  const where = real.length > 1 && shown
    ? <label className="tq-workin"><span>Work in</span><select className="tq-in" value={shown} onChange={(e) => setSlug(e.target.value)}>
        {real.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}</select></label>
    : null;
  const on = engines.length > 1
    ? <label className="tq-workin"><span>Runs on</span><select className="tq-in" value={engine} onChange={(e) => setEngine(e.target.value)}>
        <option value="">Your default</option>{engines.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</select></label>
    : null;
  const picker = where || on ? <span className="tq-pickers">{where}{on}</span> : null;
  // What a new teammate is made with, from these two choices.
  const fields = { ...(shown ? { product: shown } : {}), ...(engine ? { engine } : {}) };
  return { product: shown, fields, picker };
}

function StarterCard({ s, on, onPick, button }: { s: Starter; on?: boolean; onPick: () => void; button?: string }) {
  return <button type="button" className={`ob-card${on ? ' on' : ''}`} onClick={onPick} aria-pressed={button ? undefined : !!on}>
    <span className="ob-out">{s.outcome}</span>
    <span className="ob-line">{ICON.inbox}<span><span className="v">Sent you</span> {s.sends}</span></span>
    <span className="ob-who"><TeammateMark t={{ letter: s.name[0], name: s.name }} size="hd" /><span>{s.name}</span><span className="r">{s.role}</span>
      {button ? <span className="ob-add">{button}</span> : <i className={`ob-pick${on ? ' on' : ''}`}>{on ? ICON.check : null}</i>}</span>
  </button>;
}

function Describe({ call, onOpen, fields, label = 'Make a teammate' }: { call: Call; onOpen: (id: string) => void; fields: Record<string, string>; label?: string }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const made = await call('describe', { text: text.trim(), ...fields });
    setBusy(false);
    if (made === false) return;
    setText('');
    // Its questions come in its own chat, so that is where you go.
    const id = (made as { teammate?: { id?: unknown } })?.teammate?.id;
    if (typeof id === 'string') onOpen(id);
  };
  return <div className="ob-foot">
    <input className="ob-say" value={text} placeholder="Or describe who you need" aria-label="Describe who you need" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void go(); } }} />
    <button type="button" className="ob-btn" disabled={!text.trim() || busy} onClick={() => void go()}>{label}</button>
  </div>;
}

function Starters({ products, engines, call, error, onOpen }: { products: Product[]; engines: { id: string; label: string }[]; call: Call; error: string | null; onOpen: (id: string) => void }) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(['quality', 'maintainer', 'video']));
  const [busy, setBusy] = useState(false);
  const hasProject = products.some((p) => !p.practice);
  const where = useWorkIn(products, engines);
  const start = async () => {
    setBusy(true);
    for (const s of STARTERS) if (picked.has(s.starter)) await call('create', { starter: s.starter, ...where.fields });
    setBusy(false);
  };
  const flip = (k: string) => setPicked((x) => { const n = new Set(x); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return <div className="ob-wrap">
    <h2 className="tq-h2">Pick your first teammates</h2>
    <p className="tq-lede">They work on your project while you're away and only reach you when they need you.</p>
    {where.picker && <div className="tq-where">{where.picker}</div>}
    {!hasProject && <p className="tq-error">Make a project first. A teammate works in one of your projects.</p>}
    <div className="ob-grid">{STARTERS.map((s) => <StarterCard key={s.starter} s={s} on={picked.has(s.starter)} onPick={() => flip(s.starter)} />)}</div>
    {error && <p className="tq-error" role="alert">{error}</p>}
    <div className="ob-foot ob-foot-start">
      <Describe call={call} onOpen={onOpen} fields={where.fields} />
      <button type="button" className="ob-btn tq-go" disabled={!picked.size || busy || !hasProject} onClick={() => void start()}>{picked.size ? `Start ${picked.size} teammate${picked.size === 1 ? '' : 's'}` : 'Pick one or more'}</button>
    </div>
  </div>;
}

function Roster({ team, products, engines, call, error, onOpen }: { team: Teammate[]; products: Product[]; engines: { id: string; label: string }[]; call: Call; error: string | null; onOpen: (id: string) => void }) {
  const where = useWorkIn(products, engines);
  const started = new Set(team.map((t) => t.starter).filter(Boolean));
  const others = STARTERS.filter((s) => !started.has(s.starter) && !team.some((t) => t.name === s.name));
  return <div className="tp-body">
    <div className="tp-head"><span>Teammate</span><span>Now</span><span>Goal</span><span className="num">Runs this week</span></div>
    {team.map((t) => <button key={t.id} type="button" className="tp-row" onClick={() => onOpen(t.id)}>
      <span className="who"><TeammateMark t={t} size="hd" waiting={t.waiting.length > 0 || !!t.asking || !!t.question || !!t.held} /><span>{t.name}</span><i className="r">{t.role}</i></span>
      <span className="now">{t.waiting.length || t.asking || t.question || t.held ? <span className="need">Waiting on you</span> : <>{t.running && ICON.dots}{t.status === 'draft' ? 'Setting up' : t.now ?? (t.paused ? 'Paused' : 'Free')}</>}</span>
      <span className="goal">{t.goal ?? ''}</span>
      <span className="num">{t.runsThisWeek} of {t.limit}</span>
    </button>)}
    {others.length > 0 && <><div className="tq-sec-row"><div className="tp-sec">Start another</div>{where.picker}</div>
      <div className="ob-grid">{others.slice(0, 3).map((s) => <StarterCard key={s.starter} s={s} button="Start" onPick={() => { void call('create', { starter: s.starter, ...where.fields }); }} />)}</div></>}
    {error && <p className="tq-error" role="alert">{error}</p>}
    <div className="tq-roster-foot">{others.length ? null : where.picker}<Describe call={call} onOpen={onOpen} fields={where.fields} /></div>
  </div>;
}

function initials(name: string): string {
  const parts = String(name || 'You').trim().split(/\s+/);
  return (parts[0]?.[0] ?? 'Y').toUpperCase() + (parts[1]?.[0] ?? parts[0]?.[1] ?? '').toUpperCase();
}
