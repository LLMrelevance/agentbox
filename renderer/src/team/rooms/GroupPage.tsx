// A group: its chat and what everyone in it is doing, on one page. Five ways
// to lay it out while one is picked (w-dcaa2c122e); `groups.look` chooses.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Room, RoomCard, RoomMessage, ThreadCard } from '../../types';
import { LiveMark } from '../../components/LiveMark';
import { RoomFace } from './RoomFace';
import { agentsWords, cardName, clockOf } from './room-rules';

export type GroupLook = 'beside' | 'above' | 'woven' | 'wall' | 'title';
export const GROUP_LOOKS: GroupLook[] = ['beside', 'above', 'woven', 'wall', 'title'];

/** Unset, a group is the room page as shipped: the wall or board, and the chat beside it. */
export function readGroupLook(): GroupLook | null {
  try {
    const got = localStorage.getItem('groups.look');
    return (GROUP_LOOKS as string[]).includes(got ?? '') ? got as GroupLook : null;
  } catch { return null; }
}

/** You first; then working, most agents first; then the rest; people not on yet last. */
export function inGroupOrder(cards: readonly RoomCard[]): RoomCard[] {
  const rank = (c: RoomCard) => (c.me ? -1 : c.away ? 2 : (c.agents ?? 0) > 0 ? 0 : 1);
  return [...cards].sort((a, b) => rank(a) - rank(b) || (b.agents ?? 0) - (a.agents ?? 0));
}

const onWords = (c: RoomCard) => c.away ? 'Not on Groups yet'
  : c.workingOn ?? (c.workingPrivate ? 'Private thread' : c.status ?? '');

function Agents({ n, small = false }: { n: number | null; small?: boolean }) {
  return <span className={`rm-ag${small ? ' gp-ag-s' : ''}`}><LiveMark still={!n} />
    {n ? <><b>{n}</b>{agentsWords(n).replace(/^\d+ /, ' ')}</> : 'Not running'}</span>;
}

/** One person down the side: face, name, what they are on, their agents. */
function PersonRow({ card, onOpen }: { card: RoomCard; onOpen?: () => void }) {
  return <button type="button" className={`gp-person${card.agents ? '' : ' idle'}`} onClick={onOpen}>
    <RoomFace name={card.name} url={card.avatarUrl} size={32} />
    <span className="txt">
      <span className="rm-nm"><span className="n">{cardName(card)}</span>{card.level != null && <span className="rm-quiet">{card.level}</span>}</span>
      {onWords(card) && <span className={`on rm-one${card.workingOn ? '' : ' faint'}`}>{onWords(card)}</span>}
      <Agents n={card.away ? null : card.agents} small />
    </span>
  </button>;
}

function PeopleColumn({ room, onPerson }: { room: Room; onPerson: (id: string) => void }) {
  const shown = inGroupOrder(room.wall);
  const more = Math.max(0, room.members - shown.length);
  return <aside className="gp-side">
    <div className="gp-side-h"><span className="rm-label">People<b>{room.members}</b></span>
      <span className="rm-label">Agents<b>{room.agents}</b></span></div>
    <div className="gp-side-list">
      {shown.map((c) => <PersonRow key={c.id} card={c} onOpen={() => onPerson(c.id)} />)}
      {more > 0 && <div className="gp-more">{more} more</div>}
    </div>
  </aside>;
}

/** The people as one row of tiles over the chat. */
function PeopleStrip({ room, onPerson }: { room: Room; onPerson: (id: string) => void }) {
  const all = inGroupOrder(room.wall);
  const fit = 6;
  const shown = all.length > fit ? all.slice(0, fit - 1) : all;
  const more = room.members - shown.length;
  return <div className="gp-strip" style={{ ['--per-row' as string]: shown.length + (more > 0 ? 1 : 0) }}>
    {shown.map((c) => <button type="button" key={c.id} className={`gp-tile${c.agents ? '' : ' idle'}`} onClick={() => onPerson(c.id)}>
      <RoomFace name={c.name} url={c.avatarUrl} size={40} />
      <span className="rm-nm"><span className="n">{cardName(c)}</span></span>
      <span className={`on rm-one${c.workingOn ? '' : ' faint'}`}>{onWords(c) || ' '}</span>
      <Agents n={c.away ? null : c.agents} small />
    </button>)}
    {more > 0 && <div className="gp-tile more"><span className="n">{more} more</span></div>}
  </div>;
}

/** Faces in the top bar; pressed, everyone and what they are on drops down. */
export function TitleFaces({ room, onPerson, startOpen = false }: { room: Room; onPerson: (id: string) => void; startOpen?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const shown = inGroupOrder(room.wall);
  const working = room.wall.filter((c) => (c.agents ?? 0) > 0).length;
  return <div className="gp-tfaces">
    <button type="button" className={`gp-tbtn${open ? ' on' : ''}`} onClick={() => setOpen(!open)}>
      <span className="fs">{shown.slice(0, 6).map((c) => <RoomFace key={c.id} name={c.name} url={c.avatarUrl} size={24} />)}</span>
      <span className="rm-ag"><LiveMark still={!room.agents} /><b>{working}</b>&nbsp;of {room.members} working</span>
    </button>
    {open && <div className="gp-tpop rm-pop">
      {shown.map((c) => <PersonRow key={c.id} card={c} onOpen={() => { setOpen(false); onPerson(c.id); }} />)}
    </div>}
  </div>;
}

/** The latest thing each person said, on their card. */
export function LastWordWall({ room, messages, onPerson }: { room: Room; messages: readonly RoomMessage[]; onPerson: (id: string) => void }) {
  const last = new Map<string, RoomMessage>();
  for (const m of messages) if (m.by && !m.deleted && !m.inReplyTo) last.set(m.by, m);
  return <div className="rm-grid gp-lw">
    {inGroupOrder(room.wall).map((c) => {
      const said = last.get(c.id);
      return <button type="button" key={c.id} className="rm-card gp-lwc" onClick={() => onPerson(c.id)}>
        <RoomFace name={c.name} url={c.avatarUrl} size={48} />
        <span className="rm-nm"><span className="n">{cardName(c)}</span>{c.level != null && <span className="rm-quiet">{c.level}</span>}</span>
        <span className={`rm-on rm-one${c.workingOn ? '' : ' faint'}`}>{onWords(c) || ' '}</span>
        <Agents n={c.away ? null : c.agents} small />
        <span className="said">{said ? <><span className="tx">{said.body}</span><em>{clockOf(said.at)}</em></> : <span className="none">Nothing said today</span>}</span>
      </button>;
    })}
  </div>;
}

/** What happened in the group today besides talk, for the woven chat. */
export type GroupEvent = { id: string; at: number; by: string; kind: 'started' | 'finished' | 'now'; title: string; project?: string | null; text: string; live?: boolean };

/** How the work is woven into a group's chat, while one is picked (`groups.woven`). */
export type WovenLook = 'quiet' | 'twitch' | 'cheer' | 'bursts' | 'lane' | 'ticker' | 'finishes' | 'digest' | 'riders' | 'tally' | 'peek';
export const WOVEN_LOOKS: WovenLook[] = ['quiet', 'twitch', 'cheer', 'bursts', 'lane', 'ticker', 'finishes', 'digest', 'riders', 'tally', 'peek'];
/** Looks whose conversation holds only talk; the work is somewhere beside it. */
export const TALK_ONLY: WovenLook[] = ['lane', 'ticker', 'riders', 'tally', 'peek'];
/** Looks that keep the one-line ticker over the box. */
export const WITH_TICKER: WovenLook[] = ['ticker', 'finishes', 'digest', 'riders', 'tally', 'peek'];
/** More finishes than this between two messages fold into one card. */
export const BUSY = 2;
export function readWovenLook(): WovenLook | null {
  try {
    const got = localStorage.getItem('groups.woven');
    return (WOVEN_LOOKS as string[]).includes(got ?? '') ? got as WovenLook : null;
  } catch { return null; }
}

type Started = ThreadCard & { startedAt?: number };
const DAY = 12 * 3_600_000;

export function groupEvents(room: Room, cards: readonly ThreadCard[], now: number): { past: GroupEvent[]; now: GroupEvent[] } {
  const ids = new Set(room.wall.map((c) => c.id));
  const past: GroupEvent[] = [];
  const add = (id: string, by: string, kind: 'started' | 'finished', title: string, project: string | null, at: number) => {
    if (now - at <= DAY) past.push({ id, at, by, kind, title, project, text: `${kind} ${title}` });
  };
  for (const t of cards as readonly Started[]) {
    if (!ids.has(t.personId) || !t.title) continue;
    if (t.state === 'done') add(`ev:${t.threadId}`, t.personId, 'finished', t.title, t.project, t.updatedAt);
    if (t.state === 'running' || t.state === 'done') add(`st:${t.threadId}`, t.personId, 'started', t.title, t.project, t.startedAt ?? t.updatedAt);
  }
  // Someone outside my team shows their work on their presence line instead.
  for (const c of room.wall) {
    if (c.teammate || c.me || !c.activity) continue;
    c.activity.forEach((a, i) => {
      if (a.state === 'done') add(`pa:${c.id}:${i}`, c.id, 'finished', a.title, a.project, a.at);
      if (a.state === 'running') add(`pa:${c.id}:${i}`, c.id, 'started', a.title, a.project, a.at);
    });
  }
  past.sort((a, b) => a.at - b.at);
  const live = inGroupOrder(room.wall).filter((c) => (c.agents ?? 0) > 0)
    .map((c) => ({ id: `now:${c.id}`, at: now, by: c.id, kind: 'now' as const, title: c.workingOn ?? 'Private thread', text: c.workingOn ?? 'Private thread', live: true }));
  return { past, now: live };
}

type Who = (id: string | null) => { name: string; avatarUrl: string | null; me: boolean } | undefined;
const nameIn = (who: Who, id: string) => { const p = who(id); return p ? cardName(p) : 'Someone'; };

/** Work that happened back to back, folded into one line. */
export type Burst = { burst: GroupEvent[]; id: string; at: number };

export function foldBursts<M extends { id: string; at: number }>(stream: (M | GroupEvent)[], min = 2): (M | GroupEvent | Burst)[] {
  const out: (M | GroupEvent | Burst)[] = [];
  let run: GroupEvent[] = [];
  const flush = () => {
    if (run.length >= min) out.push({ burst: run, id: `burst:${run[0].id}`, at: run[0].at });
    else out.push(...run);
    run = [];
  };
  for (const x of stream) {
    if ('kind' in x && 'title' in x) run.push(x as GroupEvent);
    else { flush(); out.push(x); }
  }
  flush();
  return out;
}

export function WorkMark({ kind }: { kind: GroupEvent['kind'] }) {
  return kind === 'finished'
    ? <span className="gp-mk done" aria-label="Finished"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>
    : <span className="gp-mk" aria-label="Started"><LiveMark still={kind !== 'now'} /></span>;
}

/** One piece of work as a quiet line between the messages. */
export function WorkLine({ ev, who, wrap = false }: { ev: GroupEvent; who: Who; wrap?: boolean }) {
  const p = who(ev.by);
  return <div className={`gp-ev${wrap ? ' wrap' : ''}`}><RoomFace name={p?.name ?? '?'} url={p?.avatarUrl} size={16} />
    <span className={wrap ? 'w' : 'rm-one'}><b>{nameIn(who, ev.by)}</b> {ev.kind} <span className="t">{ev.title}</span></span><em>{clockOf(ev.at)}</em></div>;
}

/** The dense look: time, mark, name and the work, on one line like a busy chat. */
export function WorkTick({ ev, who }: { ev: GroupEvent; who: Who }) {
  const verb = ev.kind === 'now' ? (who(ev.by)?.me ? 'are on' : 'is on') : ev.kind;
  return <div className="gp-tick"><em>{ev.kind === 'now' ? 'now' : clockOf(ev.at)}</em><WorkMark kind={ev.kind} />
    <span><b>{nameIn(who, ev.by)}</b> {verb} <span className="t">{ev.title}</span></span></div>;
}

/** Finished work as a card the group can cheer. */
export function CheerCard({ ev, who, cheers, children, project = true }: { ev: GroupEvent; who: Who; cheers?: ReactNode; children?: ReactNode; project?: boolean }) {
  const p = who(ev.by);
  return <div className="gp-cheer">
    <div className="top"><RoomFace name={p?.name ?? '?'} url={p?.avatarUrl} size={16} /><span><b>{nameIn(who, ev.by)}</b> finished</span><em>{clockOf(ev.at)}</em></div>
    <div className="t"><WorkMark kind="finished" /><span>{ev.title}</span></div>
    {project && ev.project && <div className="p">{ev.project}</div>}
    {cheers}{children}
  </div>;
}

export function BurstRow({ burst, who, open, onToggle }: { burst: Burst; who: Who; open: boolean; onToggle: () => void }) {
  const ids = [...new Set(burst.burst.map((e) => e.by))];
  const names = ids.map((id, i) => { const n = nameIn(who, id).split(' ')[0]; return i > 0 && who(id)?.me ? 'you' : n; });
  const said = names.length > 2 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(' and ');
  const done = burst.burst.filter((e) => e.kind === 'finished').length;
  const started = burst.burst.length - done;
  const counts = [done && `finished ${done}`, started && `started ${started}`].filter(Boolean).join(', ');
  return <div className={`gp-burst${open ? ' open' : ''}`}>
    <button type="button" className="hd" onClick={onToggle}>
      <span className="fs">{ids.slice(0, 3).map((id) => { const p = who(id); return <RoomFace key={id} name={p?.name ?? '?'} url={p?.avatarUrl} size={16} />; })}</span>
      <span className="w"><b>{said}</b> {counts}</span>
      <em>{clockOf(burst.burst.at(-1)!.at)}</em>
      <svg className="ch" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={open ? 'm7 14 5-5 5 5' : 'm7 10 5 5 5-5'} /></svg>
    </button>
    {open && <div className="ls">{burst.burst.map((e) => <WorkTick key={e.id} ev={e} who={who} />)}</div>}
  </div>;
}

/** The live lane over the conversation: only work, newest at the bottom. */
export function LiveLane({ past, now, who, agents }: { past: GroupEvent[]; now: GroupEvent[]; who: Who; agents: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; });
  return <div className="gp-lane">
    <div className="gp-lane-h"><span className="rm-label">Live</span><span className="rm-ag"><LiveMark still={!agents} /><b>{agents}</b>&nbsp;agents working</span></div>
    <div className="gp-lane-ls" ref={ref}>
      {past.map((e) => <WorkTick key={e.id} ev={e} who={who} />)}
      {now.map((e) => <WorkTick key={e.id} ev={e} who={who} />)}
    </div>
  </div>;
}

/** One line over the box: the newest piece of work, and who is working. */
export function WorkTicker({ past, now, who, at, open, onOpen, children }: {
  past: GroupEvent[]; now: GroupEvent[]; who: Who; at: number;
  /** Pressed, the ticker opens what it has been showing. */
  open?: boolean; onOpen?: () => void; children?: ReactNode;
}) {
  const last = past.at(-1);
  if (!last) return null;
  const mins = Math.max(1, Math.round((at - last.at) / 60_000));
  const line = <>
    <WorkMark kind={last.kind} />
    <span className="rm-one"><b>{nameIn(who, last.by).split(' ')[0]}</b> {last.kind} <span className="t">{last.title}</span></span>
    <em>{mins < 60 ? `${mins} min ago` : clockOf(last.at)}</em>
  </>;
  if (!onOpen) return <div className="gp-ticker" title={`${now.length} working now`}>{line}</div>;
  return <div className="gp-tickwrap">
    {open && <div className="gp-peek rm-pop">{children}</div>}
    <button type="button" className={`gp-ticker btn${open ? ' on' : ''}`} onClick={onOpen}>{line}
      <svg className="ch" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={open ? 'm7 10 5 5 5-5' : 'm7 14 5-5 5 5'} /></svg>
    </button>
  </div>;
}

const firstNames = (who: Who, ids: string[]) => {
  const names = ids.map((id, i) => { const n = nameIn(who, id).split(' ')[0]; return i > 0 && who(id)?.me ? 'you' : n; });
  return names.length > 2 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(' and ');
};

/** Finishes that came back to back, as one card the group can cheer at once. */
export function CheerBurst({ burst, who, cheers }: { burst: Burst; who: Who; cheers?: ReactNode }) {
  const ids = [...new Set(burst.burst.map((e) => e.by))];
  const shown = burst.burst.slice(-3).reverse();
  const more = burst.burst.length - shown.length;
  return <div className="gp-cheer gp-cburst">
    <div className="top">
      <span className="fs">{ids.slice(0, 3).map((id) => { const p = who(id); return <RoomFace key={id} name={p?.name ?? '?'} url={p?.avatarUrl} size={16} />; })}</span>
      <span className="rm-one"><b>{firstNames(who, ids)}</b> finished {burst.burst.length}</span>
      <em>{clockOf(burst.burst.at(-1)!.at)}</em>
    </div>
    {shown.map((e) => <div key={e.id} className="t"><WorkMark kind="finished" /><span className="rm-one">{e.title}</span></div>)}
    {more > 0 && <div className="more">and {more} more</div>}
    {cheers}
  </div>;
}

/** All the work between two messages, as one sentence that opens. */
export function DigestRow({ burst, who, open, onToggle }: { burst: Burst; who: Who; open: boolean; onToggle: () => void }) {
  const done = burst.burst.filter((e) => e.kind === 'finished');
  const lead = done.at(-1) ?? burst.burst.at(-1)!;
  const ids = [...new Set([lead.by, ...burst.burst.map((e) => e.by)])];
  const rest = burst.burst.length - 1;
  return <div className={`gp-burst gp-digest${open ? ' open' : ''}`}>
    <button type="button" className="hd" onClick={onToggle}>
      <span className="fs">{ids.slice(0, 3).map((id) => { const p = who(id); return <RoomFace key={id} name={p?.name ?? '?'} url={p?.avatarUrl} size={16} />; })}</span>
      <span className="w"><b>{nameIn(who, lead.by).split(' ')[0]}</b> {lead.kind} <span className="t">{lead.title}</span>{rest > 0 && <>, and {rest} more</>}</span>
      <svg className="ch" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={open ? 'm7 14 5-5 5 5' : 'm7 10 5 5 5-5'} /></svg>
    </button>
    {open && <div className="ls">{burst.burst.map((e) => <WorkTick key={e.id} ev={e} who={who} />)}</div>}
  </div>;
}

/** What someone did since they said this, under their message. */
export function RiderLine({ evs }: { evs: GroupEvent[] }) {
  const lead = evs.filter((e) => e.kind === 'finished').at(-1) ?? evs.at(-1)!;
  const more = evs.length - 1;
  return <div className="gp-ride">
    <WorkMark kind={lead.kind} />
    <span className="rm-one">{lead.kind === 'finished' ? 'Since then finished' : 'Since then started'} <span className="t">{lead.title}</span></span>
    {more > 0 && <span className="more">and {more} more</span>}
  </div>;
}

/** Today's count for the group, pinned over the conversation. */
export function TallyStrip({ past, now, who }: { past: GroupEvent[]; now: GroupEvent[]; who: Who }) {
  const done = past.filter((e) => e.kind === 'finished');
  const by = new Map<string, number>();
  for (const e of done) by.set(e.by, (by.get(e.by) ?? 0) + 1);
  const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  return <div className="gp-tally" title={`${now.length} working now`}>
    <span className="n"><WorkMark kind="finished" /><b>{done.length}</b> finished today</span>
    <div className="who">{top.slice(0, 4).map(([id, n]) => { const p = who(id); return <span key={id} className="p" title={nameIn(who, id)}><RoomFace name={p?.name ?? '?'} url={p?.avatarUrl} size={16} /><b>{n}</b></span>; })}</div>
  </div>;
}

/** The Now block at the foot of the woven stream: who is working, on what. */
export function NowLines({ room, lines }: { room: Room; lines: GroupEvent[] }) {
  const byId = new Map(room.wall.map((c) => [c.id, c]));
  if (!lines.length) return null;
  return <div className="gp-now">
    <span className="rm-label">Working now</span>
    {lines.map((l) => {
      const c = byId.get(l.by)!;
      return <div key={l.id} className="gp-now-row">
        <RoomFace name={c.name} url={c.avatarUrl} size={16} />
        <span className="rm-one"><b>{cardName(c)}</b> <span className="t">{l.text}</span></span>
        <span className="rm-ag gp-ag-s"><LiveMark /><b>{c.agents}</b></span>
      </div>;
    })}
  </div>;
}

export function GroupPage({ room, look, chat, messages, onPerson }: {
  room: Room; look: GroupLook;
  /** The group's chat, drawn full page with no header of its own. */
  chat: ReactNode;
  messages: readonly RoomMessage[];
  onPerson: (id: string) => void;
}) {
  const [whole, setWhole] = useState(false);
  if (look === 'beside') return <div className="gp gp-beside"><div className="gp-chat">{chat}</div><PeopleColumn room={room} onPerson={onPerson} /></div>;
  if (look === 'above') return <div className="gp gp-above"><PeopleStrip room={room} onPerson={onPerson} /><div className="gp-chat">{chat}</div></div>;
  if (look === 'wall') return <div className={`gp gp-wall${whole ? ' whole' : ''}`}>
    <div className="gp-wall-top"><LastWordWall room={room} messages={messages} onPerson={onPerson} />
      <button type="button" className="gp-whole" onClick={() => setWhole(!whole)}>{whole ? 'Hide the conversation' : 'Show the whole conversation'}</button></div>
    <div className="gp-chat gp-dock">{chat}</div>
  </div>;
  return <div className="gp gp-solo"><div className="gp-chat">{chat}</div></div>;
}
