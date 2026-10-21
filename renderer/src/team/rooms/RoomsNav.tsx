// The sidebar's Rooms section (round 23): a fold arrow, one row per room with
// its unread count, and pointing at a row shows a pin where the count was and
// dots for the room menu. "New room" ends the list.
import { useEffect, useRef, useState } from 'react';
import type { Room } from '../../types';
import { I } from './icons';
import './rooms.css';

export type RoomMenuAction = 'read' | 'unread' | 'invite' | 'members' | 'ranks' | 'pin' | 'unpin' | 'mute' | 'unmute' | 'leave';

export function RoomsNav({ rooms, openId, folded, onFold, onOpen, onPin, onMenu, onNewRoom }: {
  rooms: Room[]; openId: string | null; folded: boolean;
  onFold: () => void; onOpen: (id: string) => void; onPin: (id: string, on: boolean) => void;
  onMenu: (id: string, action: RoomMenuAction, anchor: DOMRect) => void; onNewRoom: () => void;
}) {
  const [menu, setMenu] = useState<{ id: string; at: DOMRect } | null>(null);
  const [tip, setTip] = useState<{ text: string; at: DOMRect } | null>(null);
  return <>
    <button type="button" className="workspace-section rm-sec" aria-expanded={!folded} onClick={onFold}>
      <span>Rooms</span>{folded ? I.chev() : I.down()}
    </button>
    {!folded && <nav className="workspace-tabs rm-nav" aria-label="Rooms">
      {rooms.map((r) => <button type="button" key={r.id}
        className={`workspace-tab${openId === r.id ? ' active' : ''}${menu?.id === r.id ? ' menu-open' : ''}`}
        aria-current={openId === r.id ? 'page' : undefined}
        onClick={() => onOpen(r.id)}>
        {I.room()}<span className={r.muted ? 'rm-muted' : undefined}>{r.name}</span>
        <span className="rm-c">
          {r.unread > 0 && !r.muted && <span className="rm-count">{r.unread > 99 ? '99+' : r.unread}</span>}
          <span className="rm-icons">
            <span className={r.pinned ? 'pinned' : undefined} aria-label={r.pinned ? 'Unpin from tabs' : 'Pin as a tab'} role="button"
              onMouseEnter={(e) => setTip({ text: r.pinned ? 'Unpin from tabs' : 'Pin as a tab', at: e.currentTarget.getBoundingClientRect() })}
              onMouseLeave={() => setTip(null)}
              onClick={(e) => { e.stopPropagation(); setTip(null); onPin(r.id, !r.pinned); }}>{r.pinned ? I.pinFill() : I.pin()}</span>
            <span className={menu?.id === r.id ? 'on' : undefined} aria-label="Room menu" role="button"
              onClick={(e) => { e.stopPropagation(); setTip(null); setMenu(menu?.id === r.id ? null : { id: r.id, at: e.currentTarget.getBoundingClientRect() }); }}>{I.dots()}</span>
          </span>
        </span>
      </button>)}
      <button type="button" className="workspace-tab rm-add" onClick={onNewRoom}>{I.plusRow()}<span>New room</span></button>
    </nav>}
    {tip && <span className="rm-tip rm-pop" style={{ left: tip.at.right + 10, top: tip.at.top + tip.at.height / 2 - 13 }}>{tip.text}</span>}
    {menu && (() => {
      const r = rooms.find((x) => x.id === menu.id);
      if (!r) return null;
      return <RoomMenu room={r} at={menu.at} onClose={() => setMenu(null)} onPick={(a) => { setMenu(null); onMenu(r.id, a, menu.at); }} />;
    })()}
  </>;
}

export function RoomMenu({ room, at, onPick, onClose }: { room: Room; at: DOMRect; onPick: (a: RoomMenuAction) => void; onClose: () => void }) {
  const ref = useOutside(onClose);
  const row = (a: RoomMenuAction, icon: JSX.Element, label: string, k?: string | number) =>
    <button type="button" className="row" onClick={() => onPick(a)}>{icon}<span>{label}</span>{k != null && <span className="k">{k}</span>}</button>;
  const unread = (room.unread > 0 && !room.muted) || !!room.markedUnread;
  return <div ref={ref} className="rm-menu rm-pop" role="menu" style={{ left: Math.max(8, at.left - 8), top: at.bottom + 6 }}>
    {unread ? row('read', I.check(), 'Mark as read') : row('unread', I.chat(), 'Mark as unread')}
    {room.kind !== 'group' && row('invite', I.invite(), 'Invite people')}
    {row('members', I.people(), 'Members', room.members)}
    {row('ranks', I.trophy(), 'Ranks this week')}
    {room.pinned ? row('unpin', I.pinFill(), 'Unpin from tabs') : row('pin', I.pin(), 'Pin as a tab')}
    <div className="rule" />
    {room.muted ? row('unmute', I.bell(), 'Unmute room') : row('mute', I.bell(), 'Mute room')}
    {!room.teamId && row('leave', I.out(), 'Leave room')}
  </div>;
}

/** Closes on a click outside the element or on Escape. */
export function useOutside<T extends HTMLElement = HTMLDivElement>(onClose: () => void) {
  const ref = useRef<T | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close.current(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close.current(); } };
    const t = setTimeout(() => document.addEventListener('mousedown', down), 0);
    window.addEventListener('keydown', key, true);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', down); window.removeEventListener('keydown', key, true); };
  }, []);
  return ref;
}
