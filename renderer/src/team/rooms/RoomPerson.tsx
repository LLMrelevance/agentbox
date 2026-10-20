// Pointing at someone, and their page (round 23): level, rank in the room,
// days in a row; Progress (agent hours since they started) and, for a
// teammate, Activity (waiting on them, running, done today).
import { useState } from 'react';
import type { Room, RoomCard, ThreadCard } from '../../types';
import { LiveMark } from '../../components/LiveMark';
import { I } from './icons';
import { RoomFace } from './RoomFace';
import { cardName, weekRank } from './room-rules';
import { useOutside } from './RoomsNav';
import { Name } from '../../../../shared/product-name.mjs';

export function PersonHover({ card, room, at, onMessage, onProfile, onRanks, onClose }: {
  card: RoomCard; room: Room; at: DOMRect; onMessage?: () => void; onProfile: () => void; onRanks: () => void; onClose: () => void;
}) {
  const ref = useOutside(onClose);
  const left = Math.min(window.innerWidth - 310, Math.max(10, at.left + at.width / 2 - 150));
  const top = Math.min(window.innerHeight - 280, at.top + 94);
  return <div ref={ref} className="rm-hc rm-pop" style={{ left, top }}>
    <div className="hd"><RoomFace name={card.name} url={card.avatarUrl} size={44} />
      <div className="w"><span className="rm-nm"><span className="n">{cardName(card)}</span></span>{card.headline && <span className="rl">{card.headline}</span>}</div></div>
    {card.bio && <div className="bio">{card.bio}</div>}
    <div className="nums">
      {card.level != null && <div><b>{card.level}</b><span>Level</span></div>}
      <div><button type="button" className="lnk" onClick={onRanks}>#{weekRank(room.wall, card.id)}</button><span>This week</span></div>
      <div><b>{Math.round(card.hoursTotal).toLocaleString('en-US')}</b><span>Agent hours</span></div>
    </div>
    <div className="acts">
      {onMessage && !card.me && <button type="button" className="rm-btn" onClick={onMessage}>{I.chat()}Message</button>}
      <button type="button" className="rm-btn" onClick={onProfile}>View profile</button>
    </div>
  </div>;
}

export function ProfilePage({ card, room, rooms, cards, rank, onBack, onMessage, onRanks }: {
  card: RoomCard; room: Room; rooms: Room[]; cards: ThreadCard[]; rank: number | undefined;
  onBack: () => void; onMessage?: () => void; onRanks: () => void;
}) {
  const activity = card.teammate || card.me ? groups(cards.filter((c) => c.personId === card.id)) : null;
  const [tab, setTab] = useState<'progress' | 'activity'>('progress');
  const shared = rooms.filter((r) => r.wall.some((c) => c.id === card.id));
  const firstMonth = card.byMonth.find((m) => m.hours > 0)?.month ?? null;
  return <div className="rm-prof">
    <div className="rm-rhead"><button type="button" className="bk" onClick={onBack}>{I.back()}{room.name}</button></div>
    <div className="rm-ph">
      <div className="top"><RoomFace name={card.name} url={card.avatarUrl} size={72} />
        <div className="who">
          <span className="rm-nm"><span className="n">{cardName(card)}</span></span>
          {(card.headline || card.bio) && <span className="rl">{[card.headline, card.bio].filter(Boolean).join('. ')}</span>}
          {card.status && <span className="st">{I.smile()}{card.status}</span>}
        </div>
        {onMessage && !card.me && <div className="acts"><button type="button" className="rm-btn" onClick={onMessage}>{I.chat()}Message</button></div>}
      </div>
      <div className="rm-stats">
        {card.level != null && <div><b>{card.level}</b><span className="rm-label">Level</span></div>}
        <div><button type="button" className="lnk" onClick={onRanks}>#{weekRank(room.wall, card.id)}</button><span className="rm-label">In {room.name}</span></div>
        {rank != null && <div><b>#{rank}</b><span className="rm-label">On {Name}</span></div>}
        <div><b>{I.flame()}{card.streak}</b><span className="rm-label">Days in a row</span></div>
      </div>
    </div>
    <div className="rm-ptabs"><div className="tm-tabs">
      <button type="button" className={`tm-tab${tab === 'progress' ? ' on' : ''}`} onClick={() => setTab('progress')}>Progress</button>
      {activity && <button type="button" className={`tm-tab${tab === 'activity' ? ' on' : ''}`} onClick={() => setTab('activity')}>Activity{activity.count > 0 && <b>{activity.count}</b>}</button>}
    </div></div>
    {tab === 'progress' || !activity
      ? <div className="rm-pgrid">
        <div className="rm-chart"><span className="rm-label">{firstMonth ? `Agent hours since ${monthName(firstMonth)}` : 'Agent hours'}</span><HoursChart byMonth={card.byMonth} total={card.hoursTotal} /></div>
        <div className="rm-pcol">
          {shared.length > 0 && <div className="blk"><span className="rm-label">Rooms</span>{shared.map((r) => <span key={r.id} className="line">{I.hash()}{r.name}</span>)}</div>}
          {firstMonth && <div className="blk"><span className="rm-label">Here since</span><span className="line">{monthName(firstMonth, true)}</span></div>}
        </div>
      </div>
      : <div className="rm-groups">
        {activity.waiting.length > 0 && <Group label={`Waiting on ${firstOf(card)}`} rows={activity.waiting} kind="wait" />}
        {activity.running.length > 0 && <Group label="Running" rows={activity.running} kind="run" />}
        {activity.done.length > 0 && <Group label="Done today" rows={activity.done} kind="done" />}
        {activity.count === 0 && <div className="rm-empty"><span className="s">Nothing shared with you right now.</span></div>}
      </div>}
  </div>;
}

const firstOf = (c: RoomCard) => (c.me ? 'you' : c.name.split(' ')[0]);

function groups(cards: ThreadCard[]) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const waiting = cards.filter((c) => c.state === 'waiting');
  const running = cards.filter((c) => c.state === 'running');
  const done = cards.filter((c) => c.state === 'done' && c.updatedAt >= start.getTime());
  return { waiting, running, done, count: waiting.length + running.length + done.length };
}

function Group({ label, rows, kind }: { label: string; rows: ThreadCard[]; kind: 'wait' | 'run' | 'done' }) {
  const ago = (ms: number) => { const m = Math.max(1, Math.round((Date.now() - ms) / 60_000)); return m < 60 ? `${m} min` : `${Math.round(m / 60)} ${Math.round(m / 60) === 1 ? 'hour' : 'hours'}`; };
  const clock = (ms: number) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  return <>
    <div className="rm-gh"><span className="rm-label">{label}<b>{rows.length}</b></span></div>
    {rows.map((c) => <div key={c.threadId} className={`rm-trow${kind === 'done' ? ' done' : ''}`}>
      <span className="rm-one">{c.title ?? 'A thread'}</span><span className="p">{c.project ?? ''}</span>
      <span className="w">{kind === 'run' ? <span className="rm-ag"><LiveMark />Running</span> : kind === 'wait' ? `${ago(c.updatedAt)} waiting` : clock(c.updatedAt)}</span>
    </div>)}
  </>;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function monthName(ym: string, withYear = false) {
  const [y, m] = ym.split('-').map(Number);
  return withYear ? `${LONG[m - 1]} ${y}` : LONG[m - 1];
}

// Cumulative agent hours by month, from the first month with any, the total
// pinned where the line ends.
export function HoursChart({ byMonth, total }: { byMonth: { month: string; hours: number }[]; total: number }) {
  const from = byMonth.findIndex((m) => m.hours > 0);
  const months = from < 0 ? byMonth.slice(-1) : byMonth.slice(from);
  let run = Math.max(0, total - months.reduce((n, m) => n + m.hours, 0));
  const pts = months.map((m) => (run += m.hours));
  const step = niceStep(Math.max(...pts, 1) / 3);
  const W = 900, H = 380, top = step * Math.max(1, Math.ceil(Math.max(...pts, 1) / step));
  const X = (i: number) => 52 + (months.length < 2 ? 0 : (i / (months.length - 1)) * (W - 72));
  const Y = (v: number) => 10 + (1 - v / top) * (H - 40);
  const line = pts.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const last = pts.length - 1;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  return <div className="rm-chartbox">
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label={`${Math.round(total)} agent hours`}>
      {ticks.map((v) => <g key={v}><line className="grid" x1="52" x2={W - 20} y1={Y(v)} y2={Y(v)} /><text x="42" y={Y(v) + 3.5} textAnchor="end">{v.toLocaleString('en-US')}</text></g>)}
      {months.map((m, i) => <text key={m.month} x={X(i)} y={H - 6} textAnchor="middle">{MONTHS[Number(m.month.slice(5)) - 1]}</text>)}
      {pts.length > 1 && <path className="ar" d={`${line} L${X(last)} ${Y(0)} L${X(0)} ${Y(0)} Z`} />}
      <path className="ln" d={line} fill="none" strokeWidth="1.75" strokeLinejoin="round" />
      <rect className="pt" x={X(last) - 4} y={Y(pts[last] ?? 0) - 4} width="8" height="8" strokeWidth="2" />
    </svg>
    <div className="tip rm-pop" style={{ right: 6, top: 8 }}><span>Now</span>{Math.round(total).toLocaleString('en-US')} agent hours</div>
  </div>;
}

// A round step for the hours axis: 1, 2, 2.5 or 5 times a power of ten.
function niceStep(rough: number) {
  const p = 10 ** Math.floor(Math.log10(Math.max(rough, 1e-9)));
  for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= rough) return Math.max(1, k * p);
  return 10 * p;
}
