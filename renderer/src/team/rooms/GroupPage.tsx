// A group: its chat and what everyone in it is doing, on one page. Five ways
// to lay it out while one is picked (w-dcaa2c122e); `groups.look` chooses.
import { useState, type ReactNode } from 'react';
import type { Room, RoomCard, RoomMessage, ThreadCard } from '../../types';
import { LiveMark } from '../../components/LiveMark';
import { RoomFace } from './RoomFace';
import { agentsWords, cardName, clockOf } from './room-rules';

export type GroupLook = 'beside' | 'above' | 'woven' | 'wall' | 'title';
export const GROUP_LOOKS: GroupLook[] = ['beside', 'above', 'woven', 'wall', 'title'];

export function readGroupLook(): GroupLook {
  try {
    const got = localStorage.getItem('groups.look');
    return (GROUP_LOOKS as string[]).includes(got ?? '') ? got as GroupLook : 'beside';
  } catch { return 'beside'; }
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

/** What happened in the group today besides talk, for the woven look. */
export type GroupEvent = { id: string; at: number; by: string; text: string; live?: boolean };

export function groupEvents(room: Room, cards: readonly ThreadCard[], now: number): { past: GroupEvent[]; now: GroupEvent[] } {
  const ids = new Set(room.wall.map((c) => c.id));
  const past: GroupEvent[] = [];
  for (const t of cards) {
    if (!ids.has(t.personId) || !t.title || now - t.updatedAt > 12 * 3_600_000) continue;
    if (t.state === 'done') past.push({ id: `ev:${t.threadId}`, at: t.updatedAt, by: t.personId, text: `finished ${t.title}` });
    if (t.state === 'running') past.push({ id: `ev:${t.threadId}`, at: t.updatedAt - 40 * 60_000, by: t.personId, text: `started ${t.title}` });
  }
  const live = inGroupOrder(room.wall).filter((c) => (c.agents ?? 0) > 0)
    .map((c) => ({ id: `now:${c.id}`, at: now, by: c.id, text: c.workingOn ?? 'Private thread', live: true }));
  return { past, now: live };
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
        <span className="who">{cardName(c)}</span>
        <span className="what rm-one">{l.text}</span>
        <Agents n={c.agents} small />
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
