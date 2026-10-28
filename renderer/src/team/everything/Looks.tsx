// EXPLORATION (w-2b3e1a85e5), not for shipping: five ways Everything else
// could be laid out, drawn inside the real app for one design round. On only
// when localStorage `agentbox.everything.look` names one; nothing in the app
// sets it.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Product, Teammate, ThreadCard, ThreadStateWord, WorkItem } from '../../types';
import { LiveMark } from '../../components/LiveMark';
import { RunningMark, StateGlyph, ThreadCells } from '../../threads/Pages';
import { backWords, finishedAt, updatedWords } from '../../threads/page-rules';
import { hiddenUntil } from '../../list-rules';
import { rowTitle } from '../../list-rules';
import { stamp } from '../../format';
import { CardsArea } from './CardsArea';
import { MemberFace, TeamStrip } from './TeamStrip';
import { mateRunsOf, personCardsOf, type Member } from './members';
import './looks.css';

export type Look = 'board' | 'column' | 'panels' | 'table' | 'calm';
const LOOKS: Look[] = ['board', 'column', 'panels', 'table', 'calm'];

export function readLook(): Look | null {
  try {
    const v = localStorage.getItem('agentbox.everything.look');
    return LOOKS.includes(v as Look) ? (v as Look) : null;
  } catch { return null; }
}

export interface LookProps {
  look: Look;
  members: Member[];
  hidden: Member[];
  progress: WorkItem[]; later: WorkItem[]; done: WorkItem[];
  products: Product[]; now: number; dayStart: number;
  cards: ThreadCard[]; items: WorkItem[]; mates: Teammate[]; live: ReadonlySet<string>;
  onPick: (key: string) => void;
  onOpen: (item: WorkItem) => void;
  board: (order: ThreadStateWord[]) => ReactNode;
}

const THREE: ThreadStateWord[] = ['running', 'scheduled', 'done'];
const noop = () => {};

const backAt = (i: WorkItem) => Math.max(hiddenUntil(i), i.runAt ?? 0);

export function EverythingLook(props: LookProps) {
  const p = { ...props, later: [...props.later].sort((a, b) => backAt(a) - backAt(b)) };
  if (p.look === 'board') return <BoardLook {...props} />;
  if (p.look === 'column') return <ColumnLook {...props} />;
  if (p.look === 'panels') return <PanelsLook {...p} />;
  if (p.look === 'table') return <TableLook {...p} />;
  return <CalmLook {...p} />;
}

function Head({ label, count, children }: { label: string; count?: number; children?: ReactNode }) {
  return <div className="lk-h">{label}{count != null && <b>{count}</b>}{children}</div>;
}

const agentsWords = (n: number) => `${n} ${n === 1 ? 'agent' : 'agents'} working`;

/* ------------------------------------------------ 1. the board, team over it */
function BoardLook(p: LookProps) {
  return <div className="lk-page lk-scroll">
    <Head label="Team" count={p.members.length} />
    <CardsArea rows={1} onRows={noop} picked={null} hidden={p.hidden} onShow={noop}>
      <TeamStrip members={p.members} picked={null} onPick={p.onPick} onMove={noop} />
    </CardsArea>
    <div className="lk-board3">{p.board(THREE)}</div>
  </div>;
}

/* ---------------------------------------- 2. the board, the team its first column */
function MemberCard({ m, onPick }: { m: Member; onPick: () => void }) {
  const line = m.kind === 'chat' ? m.last : m.now;
  return <button type="button" className={`th-card lk-mcard ${m.kind}`} onClick={onPick}>
    <div className="lk-mcard-n"><MemberFace m={m} size={28} /><span className="rm-one">{m.name}</span></div>
    {line && <div className="lk-mcard-on rm-one">{line}</div>}
    {(m.kind === 'chat' || m.agents != null) && <div className="m">{m.kind === 'chat'
      ? (m.unread ? <><i className="lk-dot" />New messages</> : 'Chat')
      : <><LiveMark still={!m.agents && !m.starting} />{m.agents ? agentsWords(m.agents) : m.starting ? 'Starting' : 'Not running'}</>}</div>}
  </button>;
}

function ColumnLook(p: LookProps) {
  return <div className="lk-page lk-scroll">
    <div className="lk-cols">
      <div className="lk-teamcol">
        <div className="th-col-h">Team<b>{p.members.length}</b></div>
        {p.members.map((m) => <MemberCard key={m.key} m={m} onPick={() => p.onPick(m.key)} />)}
      </div>
      <div className="lk-board3">{p.board(THREE)}</div>
    </div>
  </div>;
}

/* ------------------------------------------------------- 3. a dashboard of panels */
/** As many whole rows as the box has room for. */
function useFit(rowH: number): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const look = () => setN(Math.max(1, Math.floor(el.clientHeight / rowH)));
    look();
    const ro = new ResizeObserver(look);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rowH]);
  return [ref, n];
}

type Tab = 'progress' | 'snoozed' | 'done';

function ThreadLine({ item, tab, now, live, onOpen }: { item: WorkItem; tab: Tab; now: number; live: ReadonlySet<string>; onOpen: (i: WorkItem) => void }) {
  const mark = tab === 'progress' ? (live.has(item.id) ? <RunningMark /> : <StateGlyph state="running" />)
    : tab === 'done' ? <StateGlyph state="done" /> : <StateGlyph state="scheduled" />;
  const when = tab === 'snoozed' ? backWords(item, now) : tab === 'done' ? stamp(finishedAt(item), now) : updatedWords(item.updatedAt, now);
  return <button type="button" className="lk-line" onClick={() => onOpen(item)}>
    {mark}<span className="lk-t rm-one">{rowTitle(item)}</span><span className="lk-w">{when}</span>
  </button>;
}

function ThreadPanel({ label, rows, tab, p, className }: { label: string; rows: WorkItem[]; tab: Tab; p: LookProps; className: string }) {
  const [ref, fit] = useFit(34);
  const shown = rows.slice(0, fit);
  return <section className={`lk-panel ${className}`}>
    <Head label={label} count={rows.length} />
    <div className="lk-body" ref={ref}>{shown.map((i) => <ThreadLine key={i.id} item={i} tab={tab} now={p.now} live={p.live} onOpen={p.onOpen} />)}</div>
    <div className="lk-foot">{rows.length > shown.length && <button type="button" className="lk-all">All {rows.length}</button>}</div>
  </section>;
}

interface Said { key: string; m: Member; who: string; text: string; at: number; unread: boolean }

function messagesOf(p: LookProps): Said[] {
  const out: Said[] = [];
  for (const m of p.members) {
    if (m.kind === 'chat' && m.last) out.push({ key: m.key, m, who: m.name, text: m.last, at: m.at ?? 0, unread: !!m.unread });
    if (m.kind === 'mate') {
      const t = p.mates.find((x) => `mate:${x.id}` === m.key);
      if (t?.question && t.waiting[0]) out.push({ key: m.key, m, who: m.name, text: t.waiting[0].title, at: p.now - 25 * 60_000, unread: true });
    }
  }
  return out.sort((a, b) => Number(b.unread) - Number(a.unread) || b.at - a.at);
}

function PanelsLook(p: LookProps) {
  const said = messagesOf(p);
  const who = p.members.filter((m) => m.kind !== 'chat');
  return <div className="lk-page lk-panels">
    <section className="lk-panel lk-p-team">
      <Head label="Team" count={who.length} />
      <div className="lk-body">{who.map((m) => <button type="button" key={m.key} className="lk-mem" onClick={() => p.onPick(m.key)}>
        <MemberFace m={m} size={30} />
        <span className="lk-mem-t"><span className="lk-mem-n rm-one">{m.name}{m.role && <em>{m.role}</em>}</span>
          <span className={`lk-mem-on rm-one${m.agents ? '' : ' idle'}`}>{m.kind === 'chat' ? m.last || 'No messages yet' : m.now ?? ' '}</span></span>
        <span className="lk-mem-ag">{m.kind === 'chat' ? (m.unread ? <i className="lk-dot" /> : null)
          : m.agents ? <><LiveMark />{m.agents}</> : null}</span>
      </button>)}</div>
    </section>
    <ThreadPanel label="In progress" rows={p.progress} tab="progress" p={p} className="lk-p-prog" />
    <section className="lk-panel lk-p-msg">
      <Head label="Messages" count={said.filter((s) => s.unread).length || undefined} />
      <div className="lk-body">{said.map((s) => <button type="button" key={s.key} className="lk-said" onClick={() => p.onPick(s.key)}>
        <MemberFace m={s.m} size={22} />
        <span className="lk-said-t"><span className="lk-said-n">{s.who}{s.unread && <i className="lk-dot" />}</span><span className="lk-said-x rm-one">{s.text}</span></span>
        <span className="lk-w">{stamp(s.at, p.now)}</span>
      </button>)}</div>
    </section>
    <ThreadPanel label="Done today" rows={p.done} tab="done" p={p} className="lk-p-done" />
    <ThreadPanel label="Later" rows={p.later} tab="snoozed" p={p} className="lk-p-later" />
  </div>;
}

/* -------------------------------------------------- 4. the team as a table */
function countsOf(m: Member, p: LookProps): { prog: number; later: number; done: number } | null {
  if (m.kind === 'me') return { prog: p.progress.length, later: p.later.length, done: p.done.length };
  if (m.kind === 'person') {
    const cs = personCardsOf(p.cards, m.key.slice('person:'.length), p.dayStart);
    return { prog: cs.filter((c) => c.state === 'running').length, later: cs.filter((c) => c.state === 'scheduled').length, done: cs.filter((c) => c.state === 'done').length };
  }
  if (m.kind === 'mate') {
    const rs = mateRunsOf(p.items, m.key.slice('mate:'.length), p.dayStart);
    return { prog: rs.filter((r) => r.status === 'claimed').length, later: rs.filter((r) => r.status === 'open' && (r.runAt ?? 0) > p.now).length, done: rs.filter((r) => r.status === 'done').length };
  }
  return null;
}

const Num = ({ n, live }: { n: number | undefined; live?: boolean }) => <div className={`num${n ? '' : ' none'}`}>{live && n ? <LiveMark /> : null}{n ? n : n === 0 ? '–' : ''}</div>;

function TableLook(p: LookProps) {
  return <div className="lk-page lk-scroll">
    <div className="lk-table">
      <div className="lk-tr lk-th"><div>Team</div><div>Now</div><div className="num">In progress</div><div className="num">Later</div><div className="num">Done today</div></div>
      {p.members.map((m) => {
        const c = countsOf(m, p);
        const now = m.kind === 'chat' ? m.last : m.now;
        return <button type="button" key={m.key} className={`lk-tr ${m.kind}`} onClick={() => p.onPick(m.key)}>
          <div className="lk-who"><MemberFace m={m} size={26} /><span className="rm-one">{m.name}</span>{m.role && <em className="rm-one">{m.role}</em>}{m.unread && <i className="lk-dot" />}</div>
          <div className={`lk-now rm-one${m.agents || m.kind === 'chat' ? '' : ' idle'}`}>{now ?? ''}</div>
          <Num n={c?.prog} live={!!m.agents} /><Num n={c?.later} /><Num n={c?.done} />
        </button>;
      })}
    </div>
  </div>;
}

/* -------------------------------- 5. closed by default, and nothing past the edge */
function CalmLook(p: LookProps) {
  const [open, setOpen] = useState<string | null>(() => { try { return localStorage.getItem('agentbox.everything.calmOpen'); } catch { return null; } });
  const agents = p.members.find((m) => m.kind === 'me')?.agents ?? 0;
  const soft = (w: string) => w.replace(/^(Today|Tomorrow)/, (x) => x.toLowerCase());
  const t = (i: WorkItem) => <span className="lk-say-t">{rowTitle(i)}</span>;
  const parts: { key: string; label: string; rows: WorkItem[]; tab: Tab; say: ReactNode }[] = [
    { key: 'progress', label: 'In progress', rows: p.progress, tab: 'progress', say: p.progress[0] && <>{agentsWords(agents)}. Newest is {t(p.progress[0])}</> },
    { key: 'later', label: 'Later', rows: p.later, tab: 'snoozed', say: p.later[0] && <>Next back is {t(p.later[0])}, {soft(backWords(p.later[0], p.now))}</> },
    { key: 'done', label: 'Done today', rows: p.done, tab: 'done', say: p.done[0] && <>Last finished was {t(p.done[0])}, at {stamp(finishedAt(p.done[0]), p.now)}</> },
  ];
  return <div className="lk-page lk-calm">
    <div className="lk-calm-team">
      <Head label="Team" />
      <div className="lk-chips">{p.members.map((m) => <button type="button" key={m.key} className="lk-chip" title={m.name} onClick={() => p.onPick(m.key)}>
        <MemberFace m={m} size={24} /><span>{m.kind === 'person' ? m.name.split(' ')[0] : m.name}</span>
        {m.agents ? <span className="lk-chip-n"><LiveMark />{m.agents}</span> : m.unread ? <i className="lk-dot" /> : null}
      </button>)}</div>
    </div>
    {parts.map((s) => <div key={s.key} className={`lk-sec${open === s.key ? ' open' : ''}`}>
      <button type="button" className="lk-sec-h" onClick={() => setOpen((was) => (was === s.key ? null : s.key))}>
        <svg className="lk-fold" width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><path d="M2 1l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
        <span className="lk-sec-l">{s.label}<b>{s.rows.length}</b></span>
        {open !== s.key && <span className="lk-sec-say rm-one">{s.say}</span>}
      </button>
      {open === s.key && <div className="lk-sec-rows"><div className="list th-table ev-rows">{s.rows.map((item) => <div key={item.id} className="row" role="button" tabIndex={0} onClick={() => p.onOpen(item)}>
        <span className="mark" aria-hidden="true" /><ThreadCells item={item} product={p.products.find((x) => x.slug === item.product)} now={p.now} tab={s.tab} />
      </div>)}</div></div>}
    </div>)}
  </div>;
}
