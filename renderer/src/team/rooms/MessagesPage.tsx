// Every chat, full page (round 23): your conversations down the left, newest
// first with an unread dot, and the open one beside them. A direct record
// keeps its own view on the right; a room or a group is the room chat at full
// width.
import { useState, type ReactNode } from 'react';
import { I } from './icons';
import { RoomFace } from './RoomFace';
import { clockOf } from './room-rules';

export type Conversation = {
  key: string;
  kind: 'room' | 'group' | 'direct';
  /** A room's id, or a direct record's thread id. */
  id: string;
  name: string;
  faces: { name: string; url: string | null }[];
  last: string;
  at: number;
  unread: boolean;
};

export function sortConversations(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => b.at - a.at || a.name.localeCompare(b.name));
}

function when(ms: number, now: number) {
  if (!ms) return '';
  const d = new Date(ms);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  if (ms >= today.getTime()) return clockOf(ms);
  if (ms >= today.getTime() - 6 * 86_400_000) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function MessagesPage({ list, onKey, now, onPick, children }: {
  list: Conversation[]; onKey: string | null; now: number; onPick: (c: Conversation) => void; children: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = sortConversations(list).filter((c) => !q || c.name.toLowerCase().includes(q) || c.last.toLowerCase().includes(q));
  return <div className="rm-msgs">
    <div className="rm-list">
      <div className="hd"><label className="rm-search">{I.search()}<input value={query} placeholder="Search messages" aria-label="Search messages"
        onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') { setQuery(''); (e.target as HTMLInputElement).blur(); } }} /></label></div>
      <div className="rm-convs">
        {shown.map((c) => <button type="button" key={c.key} className={`rm-conv${c.key === onKey ? ' on' : ''}`} onClick={() => onPick(c)}>
          {c.kind === 'room'
            ? <span className="fc room">{I.hash()}</span>
            : c.faces.length > 1
              ? <span className="fc two">{c.faces.slice(0, 2).map((f, i) => <RoomFace key={i} name={f.name} url={f.url} size={18} />)}</span>
              : <span className="fc"><RoomFace name={c.faces[0]?.name ?? c.name} url={c.faces[0]?.url} size={28} /></span>}
          <span className="t"><b>{c.name}</b><span>{c.last}</span></span>
          <span className="m">{when(c.at, now)}{c.unread && c.key !== onKey ? <span className="rm-unread" /> : <span style={{ height: 6 }} />}</span>
        </button>)}
        {!shown.length && <div className="rm-convs-empty">{q ? `Nothing matches “${query.trim()}”.` : 'No conversations yet.'}</div>}
      </div>
    </div>
    <div className="rm-open">{children}</div>
  </div>;
}

/** The head of a room or group chat on the messages page. */
export function FullChatHead({ title, faces, actions, onBack }: { title: string; faces?: { name: string; url: string | null }[]; actions?: ReactNode; onBack?: () => void }) {
  return <div className="hd">
    {onBack && <button type="button" className="rm-back" aria-label="Back to the room" title="Back to the room (esc)" onClick={onBack}>{I.back()}</button>}
    {faces?.length ? <span style={{ display: 'flex' }}>{faces.slice(0, 3).map((f, i) => <RoomFace key={i} name={f.name} url={f.url} size={22} />)}</span>
      : <span style={{ color: 'var(--text-faint)', display: 'flex' }}>{I.hash(15)}</span>}
    <span>{title}</span>
    {actions && <span className="ic">{actions}</span>}
  </div>;
}
