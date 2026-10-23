// A group as a chat first (w-dcaa2c122e, round 4): the conversation takes most
// of the page and the team's day sits beside it, over it, behind a button or
// inside it as one post. Five layouts while one is picked; `groups.look` chooses.
import { useState, type ReactNode } from 'react';
import type { Room } from '../../types';
import { LiveMark } from '../../components/LiveMark';
import { Reactions } from '../ChatActions';
import { RoomFace } from './RoomFace';
import { CheerBurst, CheerCard, DayList, PersonRow, WorkMark, drawnCheers, inGroupOrder, type GroupEvent } from './GroupPage';
import { DayFeed, DayLine, FacePicker, PeoplePanel, PeopleStack, PersonDay } from './GroupDay';
import { GroupMark, GroupMenuList, chipsShown, type GroupChoice } from './GroupList';
import { cardName } from './room-rules';
import { I } from './icons';

export type PageLook = 'rail' | 'pulse' | 'drawer' | 'band' | 'digest' | 'drawer2' | 'pulse2' | 'one' | 'stack' | 'feedpick' | 'people' | 'people-open' | 'cards';
export const PAGE_LOOKS: string[] = ['rail', 'pulse', 'drawer', 'band', 'digest', 'drawer2', 'pulse2', 'one', 'stack', 'feedpick', 'people', 'people-open', 'cards'];

type Who = (id: string | null) => { name: string; avatarUrl: string | null; me: boolean } | undefined;
const first = (who: Who, id: string) => { const p = who(id); return p ? cardName(p).split(' ')[0] : 'Someone'; };

export { drawnCheers };

function Today({ done, working, compact = false }: { done: number; working: number; compact?: boolean }) {
  return <div className={`gl-big${compact ? ' compact' : ''}`}>
    <b>{done}</b><span className="l">finished today</span>
    <span className="w"><LiveMark still={!working} /><span><em>{working}</em> working now</span></span>
  </div>;
}

/** Finished work newest first; three or more in one hour fold into one card. */
function Feed({ past, who, cheers }: { past: GroupEvent[]; who: Who; cheers: (ev: GroupEvent) => ReactNode }) {
  const hours = new Map<number, GroupEvent[]>();
  for (const e of past.filter((x) => x.kind === 'finished')) {
    const h = new Date(e.at).getHours();
    hours.set(h, [...(hours.get(h) ?? []), e]);
  }
  return <div className="gl-feed">{[...hours.entries()].reverse().map(([h, evs]) => evs.length >= 3
    ? <CheerBurst key={h} burst={{ burst: evs, id: `h:${h}`, at: evs[0].at }} who={who} cheers={cheers(evs.at(-1)!)} />
    : [...evs].reverse().map((e) => <CheerCard key={e.id} ev={e} who={who} project={false} cheers={cheers(e)} />))}
  </div>;
}

/** Who is working and today's count, in the top bar; pressed, it opens the day. */
export function HeaderPill({ past, now, who, open, onToggle }: { past: GroupEvent[]; now: GroupEvent[]; who: Who; open: boolean; onToggle: () => void }) {
  const done = past.filter((e) => e.kind === 'finished').length;
  return <button type="button" className={`gl-pill${open ? ' on' : ''}`} onClick={onToggle}>
    <span className="fs">{now.slice(0, 4).map((e) => { const p = who(e.by); return <RoomFace key={e.id} name={p?.name ?? '?'} url={p?.avatarUrl} size={20} />; })}</span>
    <span><b>{done}</b> finished today</span>
  </button>;
}

/** The day as the first thing in today's conversation. */
export function DigestCard({ room, past, now, who, cheers, open, onToggle }: {
  room: Room; past: GroupEvent[]; now: GroupEvent[]; who: Who; cheers: (ev: GroupEvent) => ReactNode; open: boolean; onToggle: () => void;
}) {
  const done = past.filter((e) => e.kind === 'finished');
  const by = new Map<string, number>();
  for (const e of done) by.set(e.by, (by.get(e.by) ?? 0) + 1);
  const shown = open ? [...done].reverse() : done.slice(-3).reverse();
  return <div className="gl-digest">
    <div className="top"><span className="t">Today in {room.name}</span>
      <span className="who">{[...by.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => { const p = who(id); return <span key={id} className="p" title={p?.name}><RoomFace name={p?.name ?? '?'} url={p?.avatarUrl} size={16} /><b>{n}</b></span>; })}</span></div>
    <Today done={done.length} working={now.length} compact />
    <div className="ls">{shown.map((e) => <div key={e.id} className="r"><WorkMark kind="finished" /><b>{first(who, e.by)}</b><span className="t rm-one">{e.title}</span>{cheers(e)}</div>)}</div>
    {done.length > 3 && <button type="button" className="more" onClick={onToggle}>{open ? 'Show less' : `See all ${done.length}`}</button>}
  </div>;
}

/** Under the Groups tab: the group open now, or every group to pick from, and its buttons. */
export function GroupBar({ style, groups, current, members, onPick, children }: {
  style: 'picker' | 'chips'; groups: GroupChoice[]; current: string; members: number;
  onPick: (id: string) => void; children?: ReactNode;
}) {
  const [more, setMore] = useState(false);
  const here = groups.find((g) => g.id === current);
  const { shown, hidden } = chipsShown(groups, current);
  const unseen = groups.filter((g) => g.unread && g.id !== current && !shown.includes(g)).length;
  const lit = (g: GroupChoice) => g.unread && g.id !== current;
  const chip = (g: GroupChoice) => g.faces.length
    ? <button type="button" key={g.id} className={`c chat${g.id === current ? ' on' : ''}${lit(g) ? ' unread' : ''}`} onClick={() => onPick(g.id)}>
      <span className="g6-fw"><GroupMark g={g} size={20} row />{lit(g) && <span className="g6-dot" aria-label="Unread" />}</span><span>{g.name}</span></button>
    : <button type="button" key={g.id} className={`c named${g.id === current ? ' on' : ''}${lit(g) ? ' unread' : ''}`} onClick={() => onPick(g.id)}>
      <span className="g6-hash">{I.hash(13)}</span><span>{g.name}</span>{lit(g) && <span className="rm-unread" aria-label="Unread" />}</button>;
  const named = shown.filter((g) => !g.faces.length);
  const chats = shown.filter((g) => g.faces.length);
  return <div className={`g6-bar ${style}`}>
    {style === 'chips'
      ? <div className="g6-chips">
        {named.map(chip)}
        {named.length > 0 && chats.length > 0 && <span className="g6-sep" aria-hidden="true" />}
        <span className="g6-chats">
          {chats.map(chip)}
          {hidden > 0 && <span className="g6-morewrap">
            <button type="button" className={`c more${more ? ' on' : ''}${unseen > 0 ? ' unread' : ''}`} onClick={() => setMore(!more)}>More{I.down()}</button>
            {more && <div className="rm-pop g7-menu g7-drop"><GroupMenuList groups={groups} current={current} onPick={(id) => { setMore(false); onPick(id); }} /></div>}
          </span>}
        </span>
      </div>
      : <span className="g6-morewrap">
        <button type="button" className={`g6-name${more ? ' on' : ''}`} onClick={() => setMore(!more)}>
          {here && (here.faces.length > 0 ? <GroupMark g={here} size={24} row /> : <span className="g6-hash">{I.hash(15)}</span>)}
          <span className="nm">{here?.name}</span><span className="sub">{members} people</span>{I.down()}</button>
        {more && <div className="rm-pop g7-menu g7-drop"><GroupMenuList groups={groups} current={current} onPick={(id) => { setMore(false); onPick(id); }} /></div>}
      </span>}
    <div className="g6-acts">{children}</div>
  </div>;
}

export function GroupLayout({ room, look, chat, past, now, who, onPerson, open, onToggle, meId, top }: {
  room: Room; look: PageLook;
  /** The group's chat, full page with no header of its own. */
  chat: ReactNode;
  /** Over the chat and its sidebar, under the Groups tab. */
  top?: ReactNode;
  past: GroupEvent[]; now: GroupEvent[]; who: Who; meId: string | null;
  onPerson: (id: string) => void;
  /** The day, opened from the top bar or the band. */
  open: boolean; onToggle: () => void;
}) {
  const ids = room.wall.map((c) => c.id);
  const cheers = (e: GroupEvent) => <Reactions on={{ '🎉': drawnCheers(e, ids) }} me={meId} onReact={() => {}} />;
  const done = past.filter((e) => e.kind === 'finished').length;
  const shown = inGroupOrder(room.wall);
  // Whose day the sidebar shows: the busiest teammate first, or everyone.
  const [picked, setPicked] = useState<string | null>(() => look === 'feedpick' ? null : shown.find((c) => !c.me && c.agents)?.id ?? shown[0]?.id ?? null);
  const day = (side: ReactNode) => top
    ? <div className="gp g5 col">{top}<div className="g5-row"><div className="gp-chat">{chat}</div>{side}</div></div>
    : <div className="gp g5"><div className="gp-chat">{chat}</div>{side}</div>;
  if (look === 'people' || look === 'people-open' || look === 'cards') return day(<aside className="g5-side g8-side">
    <PeoplePanel key={room.id} room={room} past={past} form={look === 'cards' ? 'cards' : 'list'} openFirst={look === 'people-open'} onPerson={onPerson} /></aside>);
  if (look === 'drawer2') return day(open && <aside className="g5-side"><DayLine room={room} past={past} now={now} />
    {shown.map((c) => <PersonDay key={c.id} card={c} past={past} ids={ids} />)}</aside>);
  if (look === 'pulse2') return day(<aside className="g5-side"><DayLine room={room} past={past} now={now} /><DayFeed past={past} who={who} ids={ids} /></aside>);
  // People with work today, the busiest first: the faces worth picking.
  const busy = shown.filter((c) => c.agents || past.some((e) => e.by === c.id));
  if (look === 'one') {
    const card = shown.find((c) => c.id === picked) ?? shown[0];
    return day(<aside className="g5-side"><DayLine room={room} past={past} now={now} />
      <FacePicker cards={shown} picked={card?.id ?? null} onPick={(id) => setPicked(id)} />
      {card && <PersonDay card={card} past={past} ids={ids} big limit={8} />}</aside>);
  }
  if (look === 'stack') return day(<aside className="g5-side"><DayLine room={room} past={past} now={now} /><PeopleStack room={room} past={past} ids={ids} /></aside>);
  if (look === 'feedpick') return day(<aside className="g5-side"><DayLine room={room} past={past} now={now} />
    <FacePicker cards={busy} picked={picked} onPick={setPicked} all />
    <DayFeed past={past} who={who} ids={ids} only={picked} /></aside>);
  if (look === 'rail') {
    return <div className="gp gl-rail"><div className="gp-chat">{chat}</div>
      <aside className="gl-side">
        <Today done={done} working={now.length} />
        <div className="gl-people">{shown.map((c) => <PersonRow key={c.id} card={c} onOpen={() => onPerson(c.id)} />)}
          {room.members > shown.length && <div className="gp-more">{room.members - shown.length} more</div>}</div>
      </aside></div>;
  }
  if (look === 'pulse') {
    return <div className="gp gl-pulse"><div className="gp-chat">{chat}</div>
      <aside className="gl-side wide"><Today done={done} working={now.length} /><Feed past={past} who={who} cheers={cheers} /></aside></div>;
  }
  if (look === 'band') {
    const newest = [...past].reverse().slice(0, 2);
    return <div className="gp gl-bandpage">
      <div className="gl-band">
        <Today done={done} working={now.length} />
        <div className="ppl">{shown.slice(0, 8).map((c) => <button type="button" key={c.id} className={`p${c.agents ? ' on' : ''}`} onClick={() => onPerson(c.id)}>
          <RoomFace name={c.name} url={c.avatarUrl} size={28} /><span className="nm"><span>{cardName(c).split(' ')[0]}</span>
            <span className="on rm-one">{c.agents ? c.workingOn ?? 'Private thread' : c.status ?? 'Not running'}</span></span></button>)}</div>
        <div className="news">{newest.map((e) => <div key={e.id} className="gp-newest"><WorkMark kind={e.kind} /><span className="rm-one"><b>{first(who, e.by)}</b> {e.kind} <span className="t">{e.title}</span></span></div>)}
          <button type="button" className="more" onClick={onToggle}>{open ? 'Hide the day' : 'See the whole day'}</button></div>
      </div>
      {open && <div className="gl-bandday"><DayList past={past} now={now} who={who} by="person" cheers={cheers} /></div>}
      <div className="gp-chat">{chat}</div>
    </div>;
  }
  if (look === 'drawer') {
    return <div className="gp gl-drawer gl-wide"><div className="gp-chat">{chat}</div>
      {open && <aside className="gl-drawer-panel">
        <Today done={done} working={now.length} />
        <DayList past={past} now={now} who={who} by="person" cheers={cheers} />
      </aside>}
    </div>;
  }
  return <div className="gp gl-wide"><div className="gp-chat">{chat}</div></div>;
}
