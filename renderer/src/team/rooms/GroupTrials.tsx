// Round 11 of Groups (w-dcaa2c122e), NOT FOR SHIPPING: a bigger chat, the
// team's day beside or inside a group, and where the Inbox's tabs go. Each is
// a localStorage switch while one is picked: `groups.big`, `groups.feed`,
// `groups.top`.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Person, Room, RoomCard, ThreadCard } from '../../types';
import { LiveMark } from '../../components/LiveMark';
import { RoomFace } from './RoomFace';
import { cardName, clockOf } from './room-rules';
import { GroupMark, type GroupChoice } from './GroupList';
import { I } from './icons';

export type FeedLook = 'below' | 'tabs' | 'person' | 'digest' | 'ticker';
export type NsLook = 'ns-toggle' | 'ns-menu' | 'ns-filter' | 'ns-quiet' | 'ns-rows';
export type TopLook = 'doors-chips' | 'doors-title' | 'sidebar' | 'switch' | 'titles' | 'stacked' | 'nosidebar-below' | 'nosidebar-inline' | NsLook;
const TOPS: string[] = ['doors-chips', 'doors-title', 'sidebar', 'switch', 'titles', 'stacked', 'nosidebar-below', 'nosidebar-inline', 'ns-toggle', 'ns-menu', 'ns-filter', 'ns-quiet', 'ns-rows'];
const ns = (t: TopLook | null) => !!t && t.startsWith('ns-');
/** The top bar's Inbox and Groups stand in for the sidebar's rows. */
export const switchTop = (t: TopLook | null) => t === 'switch' || t === 'nosidebar-below' || t === 'nosidebar-inline' || ns(t);
export const noSidebar = (t: TopLook | null) => t === 'nosidebar-below' || t === 'nosidebar-inline' || ns(t);
/** Everything on the top bar's one line: the switch, then the tabs or the groups. */
export const oneLine = (t: TopLook | null) => t === 'nosidebar-inline' || ns(t);
/** How the four tabs are drawn beside the switch. */
export const statesClass = (t: TopLook | null) => (t === 'ns-filter' ? ' gt-states-menu' : t === 'ns-quiet' ? ' gt-states-quiet' : '');
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
export const trial = () => ({
  big: read('groups.big') === '1',
  feed: (['below', 'tabs', 'person', 'digest', 'ticker'] as string[]).includes(read('groups.feed') ?? '') ? read('groups.feed') as FeedLook : null,
  top: TOPS.includes(read('groups.top') ?? '') ? read('groups.top') as TopLook : null,
  inset: read('groups.inset') === '1',
});

export type Done = { id: string; by: string; title: string; at: number };
type Started = ThreadCard & { startedAt?: number };
const DAY = 12 * 3_600_000;

/** What the people in a group finished today, newest first. */
export function finishedToday(room: Room, cards: readonly ThreadCard[], now: number): Done[] {
  const ids = new Set(room.wall.map((c) => c.id));
  const out: Done[] = [];
  for (const t of cards as readonly Started[]) {
    if (ids.has(t.personId) && t.title && t.state === 'done' && now - t.updatedAt <= DAY) out.push({ id: t.threadId, by: t.personId, title: t.title, at: t.updatedAt });
  }
  for (const c of room.wall) {
    if (c.teammate || c.me || !c.activity) continue;
    c.activity.forEach((a, i) => { if (a.state === 'done' && now - a.at <= DAY) out.push({ id: `${c.id}:${i}`, by: c.id, title: a.title, at: a.at }); });
  }
  return out.sort((a, b) => b.at - a.at);
}

const first = (c: RoomCard | undefined) => (c ? cardName(c).split(' ')[0] : 'Someone');
const Check = () => <svg className="gt-ck" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
const ago = (at: number, now: number) => { const m = Math.max(1, Math.round((now - at) / 60_000)); return m < 60 ? `${m}m` : `${Math.round(m / 60)}h`; };

/** Finished work, newest first: face, who and when, then what. */
export function FeedList({ room, done, now, limit = 8 }: { room: Room; done: Done[]; now: number; limit?: number }) {
  const by = new Map(room.wall.map((c) => [c.id, c]));
  if (!done.length) return <div className="gt-none">Nothing finished yet today.</div>;
  return <div className="gt-feed">{done.slice(0, limit).map((d) => { const c = by.get(d.by); return <div key={d.id} className="gt-item">
    <RoomFace name={c?.name ?? '?'} url={c?.avatarUrl} size={20} />
    <span className="gt-iw"><span className="gt-who"><b>{c?.me ? 'You' : first(c)}</b> finished<em>{ago(d.at, now)}</em></span><span className="gt-t">{d.title}</span></span>
  </div>; })}</div>;
}

/** F1: the People list, then Today under it. */
export function TodayBelow({ room, done, now }: { room: Room; done: Done[]; now: number }) {
  return <div className="gt-today"><div className="gr-ph"><span className="gr-pt">Today</span><span className="gr-pn">{done.length} finished</span></div>
    <FeedList room={room} done={done} now={now} /></div>;
}

/** F2: People and Today as two tabs at the top of the sidebar. */
export function SideTabs({ people, today, count }: { people: (head: ReactNode) => ReactNode; today: ReactNode; count: number }) {
  const [tab, setTab] = useState<'people' | 'today'>('today');
  const head = <div className="gt-tabs tm-tabs">
    <button type="button" className={`tm-tab${tab === 'people' ? ' on' : ''}`} onClick={() => setTab('people')}>People</button>
    <button type="button" className={`tm-tab${tab === 'today' ? ' on' : ''}`} onClick={() => setTab('today')}>Today{count > 0 && <b>{count}</b>}</button>
  </div>;
  return tab === 'people' ? <>{people(head)}</> : <aside className="gr-side">{head}{today}</aside>;
}

/** F3: under what someone is on, what they finished today. */
export function finishedLine(c: RoomCard, done: Done[]): ReactNode {
  const mine = done.filter((d) => d.by === c.id);
  if (!mine.length) return null;
  return <span className="gt-l3"><span className="rm-one">Finished {mine[0].title}</span>{mine.length > 1 && <em>and {mine.length - 1} more</em>}</span>;
}

/** F4: a few hours of finished work as one quiet card in the chat. */
export function DigestCard({ room, done, now, since }: { room: Room; done: Done[]; now: number; since: number }) {
  const [open, setOpen] = useState(false);
  const by = new Map(room.wall.map((c) => [c.id, c]));
  const who = [...new Set(done.map((d) => d.by))];
  const names = who.map((id) => (by.get(id)?.me ? 'you' : first(by.get(id))));
  const said = names.length > 2 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names.join(' and ');
  const shown = open ? done : done.slice(0, 3);
  return <div className="gt-digest">
    <div className="gt-dh"><span className="gt-fs">{who.slice(0, 4).map((id) => <RoomFace key={id} name={by.get(id)?.name ?? '?'} url={by.get(id)?.avatarUrl} size={20} />)}</span>
      <span className="gt-dw">{said[0].toUpperCase() + said.slice(1)} finished {done.length} since {clockOf(since)}</span></div>
    <div className="gt-dl">{shown.map((d) => <div key={d.id} className="gt-dr"><Check /><span className="rm-one">{d.title}</span><em>{first(by.get(d.by))}</em></div>)}</div>
    {done.length > 3 && <button type="button" className="gt-more" onClick={() => setOpen(!open)}>{open ? 'Show less' : `Show all ${done.length}`}</button>}
  </div>;
}

/** F5: the newest finish, one line over the box, and today's count. */
export function Ticker({ room, done, now }: { room: Room; done: Done[]; now: number }) {
  const d = done[0];
  if (!d) return null;
  const c = room.wall.find((x) => x.id === d.by);
  const working = room.wall.filter((x) => x.agents).length;
  return <div className="gt-ticker"><Check /><RoomFace name={c?.name ?? '?'} url={c?.avatarUrl} size={16} />
    <span className="rm-one"><b>{c?.me ? 'You' : first(c)}</b> finished {d.title}</span><em>{ago(d.at, now)}</em>
    <span className="gt-tk-r"><LiveMark /><span>{working} working</span><span className="gt-dot" /><span>{done.length} finished today</span></span></div>;
}

/** Sidebar rows: one Groups door, or every group listed under Inbox. */
export function GroupsDoor({ lit, count, onOpen }: { lit: boolean; count: number; onOpen: () => void }) {
  return <nav className="workspace-tabs gt-door" aria-label="Groups">
    <button type="button" className={`workspace-tab${lit ? ' active' : ''}${count ? ' has-count' : ''}`} aria-label="Groups" onClick={onOpen}>
      {I.groupNav()}<span>Groups</span>{count > 0 && <small className="workspace-running">{count}</small>}</button>
  </nav>;
}

export function GroupsInSidebar({ groups, current, onPick }: { groups: GroupChoice[]; current: string | null; onPick: (key: string) => void }) {
  const named = groups.filter((g) => !g.faces.length).sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name));
  const chats = groups.filter((g) => g.faces.length).slice(0, 6);
  const row = (g: GroupChoice) => <button type="button" key={g.key} className={`workspace-tab gt-srow${g.key === current ? ' active' : ''}${g.unread && g.key !== current ? ' unread' : ''}`} onClick={() => onPick(g.key)}>
    {g.faces.length ? <span className="gt-sic"><GroupMark g={g} size={18} /></span> : <span className="gt-sic gt-sh">{I.hash(14)}</span>}<span className="rm-one">{g.name}</span>
    {g.unread && g.key !== current && <span className="gt-sdot" />}</button>;
  return <nav className="workspace-tabs gt-side-groups" aria-label="Groups">
    <div className="gt-slabel">Groups</div>{named.map(row)}
    <div className="gt-slabel">Direct messages</div>{chats.map(row)}
  </nav>;
}

/** The top bar's two places, Inbox and Groups, in place of a title. */
export function TopSwitch({ on, inboxCount, groupsCount, onInbox, onGroups }: { on: 'inbox' | 'groups'; inboxCount: number; groupsCount: number; onInbox: () => void; onGroups: () => void }) {
  return <div className="gt-switch">
    <button type="button" className={on === 'inbox' ? 'on' : ''} onClick={onInbox}>Inbox{inboxCount > 0 && <b>{inboxCount}</b>}</button>
    <button type="button" className={on === 'groups' ? 'on' : ''} onClick={onGroups}>Groups{groupsCount > 0 && <b>{groupsCount}</b>}</button>
  </div>;
}

/** A group's name in the top bar, for the sidebar list. */
export function GroupTitle({ g }: { g: GroupChoice | undefined }) {
  if (!g) return null;
  return <h1 className="workspace-title gt-title">{g.faces.length ? <GroupMark g={g} size={22} row /> : <span className="gt-sh">{I.hash(16)}</span>}<span>{g.name}</span></h1>;
}

/** With no sidebar: your face at the right end of the top bar, holding what the sidebar's foot held. */
export function TopMe({ me, onSettings, onFeedback }: { me: Person; onSettings: () => void; onFeedback: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [open]);
  return <span ref={ref} className="gt-acct">
    <button type="button" className={`gt-me${open ? ' open' : ''}`} aria-label="Your account" onClick={() => setOpen(!open)}><RoomFace name={me.name || me.email} url={me.avatarUrl} size={28} /></button>
    {open && <div className="rm-pop gr-optmenu" role="menu">
      <button type="button" className="row" onClick={() => { setOpen(false); onSettings(); }}><span>Settings</span></button>
      <button type="button" className="row" onClick={() => { setOpen(false); onFeedback(); }}><span>Feedback</span></button>
    </div>}
  </span>;
}

const Chevron = () => <svg className="gt-chev" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>;

/** Inbox and Groups, drawn by each one-line experiment in its own way. */
export function TopNav({ top, on, inboxCount, groupsCount, onInbox, onGroups }: {
  top: TopLook | null; on: 'inbox' | 'groups'; inboxCount: number; groupsCount: number; onInbox: () => void; onGroups: () => void;
}) {
  const n = (k: number) => (k > 0 ? <b>{k}</b> : null);
  if (top === 'ns-toggle') return <div className="gt-seg" role="tablist">
    <button type="button" className={on === 'inbox' ? 'on' : ''} onClick={onInbox}>Inbox{n(inboxCount)}</button>
    <button type="button" className={on === 'groups' ? 'on' : ''} onClick={onGroups}>Groups{n(groupsCount)}</button>
  </div>;
  if (top === 'ns-menu') return <button type="button" className="gt-titlemenu" onClick={on === 'inbox' ? onGroups : onInbox}>
    <span>{on === 'inbox' ? 'Inbox' : 'Groups'}</span><Chevron />
  </button>;
  if (top === 'ns-rows') return <nav className="gt-navrow">
    <button type="button" className={on === 'inbox' ? 'on' : ''} onClick={onInbox}>{I.inboxNav()}<span>Inbox</span>{n(inboxCount)}</button>
    <button type="button" className={on === 'groups' ? 'on' : ''} onClick={onGroups}>{I.groupNav()}<span>Groups</span>{n(groupsCount)}</button>
  </nav>;
  return <TopSwitch on={on} inboxCount={inboxCount} groupsCount={groupsCount} onInbox={onInbox} onGroups={onGroups} />;
}
