// The team's day beside a group's chat (w-dcaa2c122e, round 5): a quiet
// sidebar on the page's own ground, one person at a time or the day as it
// happened, with cheers as a small count rather than a box. Every class here
// is g5-prefixed: the app has global rules for plain names like `.body`.
import { useState } from 'react';
import type { Room, RoomCard } from '../../types';
import { LiveMark } from '../../components/LiveMark';
import { RoomFace } from './RoomFace';
import { drawnCheers, inGroupOrder, type GroupEvent } from './GroupPage';
import { cardName, clockOf } from './room-rules';

type Who = (id: string | null) => { name: string; avatarUrl: string | null; me: boolean } | undefined;
const firstOf = (who: Who, id: string) => { const p = who(id); return p ? cardName(p).split(' ')[0] : 'Someone'; };
const Check = () => <svg className="g5-ck" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;

function Cheer({ n }: { n: number }) {
  return n ? <span className="g5-cheer" title={`${n} cheered`}>🎉 {n}</span> : null;
}

/** "Today in Northwind · 6 finished, 3 working": the day's count, said quietly. */
export function DayLine({ room, past, now }: { room: Room; past: GroupEvent[]; now: GroupEvent[] }) {
  const done = past.filter((e) => e.kind === 'finished').length;
  return <div className="g5-dayline"><span className="g5-dt">Today in {room.name}</span>
    <span className="g5-dn">{done} finished, {now.length} working</span></div>;
}

/** One person's day: what they are on now, then what they finished. */
export function PersonDay({ card, past, ids, big = false, limit = 4 }: { card: RoomCard; past: GroupEvent[]; ids: string[]; big?: boolean; limit?: number }) {
  const done = past.filter((e) => e.by === card.id && e.kind === 'finished').reverse();
  const shown = done.slice(0, limit);
  const now = card.agents ? card.workingOn ?? 'Private thread' : null;
  return <section className={`g5-person${big ? ' big' : ''}`}>
    <div className="g5-phd"><RoomFace name={card.name} url={card.avatarUrl} size={big ? 36 : 24} />
      {big
        ? <span className="g5-who"><span className="g5-nm">{cardName(card)}</span><span className="g5-ag">{card.agents ? `${card.agents} ${card.agents === 1 ? 'agent' : 'agents'} working` : 'No agents running'}</span></span>
        : <span className="g5-nm">{cardName(card)}</span>}
      {done.length > 0 && <span className="g5-c">{done.length} finished</span>}</div>
    <div className="g5-pbody">
      {now
        ? <div className="g5-line g5-now"><LiveMark /><span className="g5-t">{now}</span></div>
        : <div className="g5-line g5-idle"><span className="g5-t">{card.status ?? 'Not running'}</span></div>}
      {shown.map((e) => <div key={e.id} className="g5-line g5-done"><Check /><span className="g5-t">{e.title}</span><Cheer n={drawnCheers(e, ids).length} /></div>)}
      {done.length > shown.length && <div className="g5-more">and {done.length - shown.length} more</div>}
    </div>
  </section>;
}

/** The day as it happened: finished work newest first, a burst in one hour folded together. */
export function DayFeed({ past, who, ids, only = null }: { past: GroupEvent[]; who: Who; ids: string[]; only?: string | null }) {
  const hours = new Map<number, GroupEvent[]>();
  for (const e of past.filter((x) => x.kind === 'finished' && (!only || x.by === only))) {
    const h = new Date(e.at).getHours();
    hours.set(h, [...(hours.get(h) ?? []), e]);
  }
  const groups = [...hours.values()].reverse();
  if (!groups.length) return <div className="g5-empty">Nothing finished yet today.</div>;
  return <div className="g5-feed">{groups.map((evs) => {
    if (evs.length < 3) return [...evs].reverse().map((e) => { const p = who(e.by); return <div key={e.id} className="g5-item">
      <div className="g5-ihd"><RoomFace name={p?.name ?? '?'} url={p?.avatarUrl} size={20} /><span className="g5-iw"><b>{firstOf(who, e.by)}</b> finished</span><em>{clockOf(e.at)}</em></div>
      <div className="g5-line g5-done"><span className="g5-t">{e.title}</span><Cheer n={drawnCheers(e, ids).length} /></div>
    </div>; });
    const people = [...new Set(evs.map((e) => e.by))];
    const names = people.map((id, i) => (i > 0 && who(id)?.me ? 'you' : firstOf(who, id)));
    const said = names.length > 2 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(' and ');
    return <div key={evs[0].id} className="g5-item">
      <div className="g5-ihd"><span className="g5-fs">{people.slice(0, 3).map((id) => { const p = who(id); return <RoomFace key={id} name={p?.name ?? '?'} url={p?.avatarUrl} size={20} />; })}</span>
        <span className="g5-iw"><b>{said}</b> finished {evs.length}</span><em>{clockOf(evs.at(-1)!.at)}</em></div>
      {[...evs].reverse().map((e) => <div key={e.id} className="g5-line g5-done"><span className="g5-t">{e.title}</span><Cheer n={drawnCheers(e, ids).length} /></div>)}
    </div>;
  })}</div>;
}

/** Faces to pick whose day the sidebar shows, on one line; `all` adds a choice for everyone. */
export function FacePicker({ cards, picked, onPick, all = false, max = 7 }: { cards: RoomCard[]; picked: string | null; onPick: (id: string | null) => void; all?: boolean; max?: number }) {
  const fit = all ? max - 1 : max;
  const shown = cards.slice(0, fit);
  return <div className="g5-faces">
    {all && <button type="button" className={`g5-all${picked === null ? ' on' : ''}`} onClick={() => onPick(null)}>All</button>}
    {shown.map((c) => <button type="button" key={c.id} className={`g5-f${picked === c.id ? ' on' : ''}`} title={cardName(c)} onClick={() => onPick(c.id)}>
      <RoomFace name={c.name} url={c.avatarUrl} size={28} /></button>)}
    {cards.length > shown.length && <span className="g5-over">+{cards.length - shown.length}</span>}
  </div>;
}

/** Everyone in one column, one person open at a time. */
export function PeopleStack({ room, past, ids }: { room: Room; past: GroupEvent[]; ids: string[] }) {
  const cards = inGroupOrder(room.wall);
  const latest = [...past].reverse().find((e) => e.kind === 'finished' && !cards.find((c) => c.id === e.by)?.me)?.by ?? cards[0]?.id ?? null;
  const [open, setOpen] = useState<string | null>(latest);
  return <div className="g5-stack">{cards.map((c) => {
    const done = past.filter((e) => e.by === c.id && e.kind === 'finished').length;
    if (open === c.id) return <div key={c.id} className="g5-srow open" onClick={() => setOpen(null)}><PersonDay card={c} past={past} ids={ids} /></div>;
    return <button type="button" key={c.id} className="g5-srow" onClick={() => setOpen(c.id)}>
      <RoomFace name={c.name} url={c.avatarUrl} size={24} />
      <span className="g5-sw"><span className="g5-nm">{cardName(c)}</span>
        <span className={`g5-on rm-one${c.agents ? ' live' : ''}`}>{c.agents ? c.workingOn ?? 'Private thread' : c.status ?? 'Not running'}</span></span>
      {done > 0 && <span className="g5-c">{done} finished</span>}
    </button>;
  })}</div>;
}
