// One room in the Threads tab bar, after Done, and the picker on its arrow
// that chooses which room it is, or none.
import type { Room } from '../../types';
import { I } from './icons';
import { useOutside } from './RoomsPage';
import { peopleCount } from './room-rules';

export function RoomTab({ room, count, on = false, open, onOpen, onMenu, label }: {
  room: Room; count: number;
  /** Its room is open under the Threads tabs. */
  on?: boolean;
  open: boolean; onOpen: () => void; onMenu: (at: DOMRect) => void;
  /** Said instead of the room's name: "Groups" when the tab holds whichever group was last open. */
  label?: string;
}) {
  return <>
    <span className="rm-sep" aria-hidden="true" />
    <span className={`tm-tab rm-tab${on ? ' on' : ''}`}>
      <button type="button" className="rm-tabname" data-hint="state-tab" onClick={onOpen}>{label ?? <>{I.hash()}{room.name}</>}{count > 0 && <b>{count}</b>}</button>
      <button type="button" className={`rm-tabpick${open ? ' open' : ''}`} aria-label="Pick the room in this tab" title="Pick the room in this tab"
        onClick={(e) => onMenu((e.currentTarget.parentElement ?? e.currentTarget).getBoundingClientRect())}>{I.down()}</button>
    </span>
  </>;
}

export function RoomTabMenu({ rooms, current, invisible, at, onPick, onClose, groups }: {
  rooms: Room[]; current: string | null; invisible: boolean; at: Pick<DOMRect, 'left' | 'right' | 'bottom'>;
  onPick: (choice: string) => void; onClose: () => void;
  /** Every group by the name it is called, newest first, for the Groups tab. */
  groups?: { id: string; name: string; unread: boolean }[];
}) {
  const ref = useOutside(onClose);
  // Hangs from the start of the tab, as long as it stays inside the window.
  const left = Math.max(8, Math.min(at.left, (typeof window === 'undefined' ? Infinity : window.innerWidth) - 228));
  if (groups) return <div ref={ref} className="rm-menu rm-pop rm-tabmenu" role="menu" style={{ left, top: at.bottom + 6 }}>
    <div className="head rm-label">Your groups</div>
    {groups.map((g) => <button type="button" key={g.id} className={`row${g.id === current ? ' on' : ''}`} onClick={() => onPick(g.id)}>
      <span>{g.name}</span>{g.unread && g.id !== current && <span className="rm-unread" />}{g.id === current && <span className="k">{I.check()}</span>}
    </button>)}
  </div>;
  return <div ref={ref} className="rm-menu rm-pop rm-tabmenu" role="menu" style={{ left, top: at.bottom + 6 }}>
    <div className="head rm-label">Room in this tab</div>
    {rooms.filter((r) => r.kind !== 'group').map((r) => <button type="button" key={r.id} className={`row${r.id === current ? ' on' : ''}`} onClick={() => onPick(r.id)}>
      {I.hash()}<span>{r.name}</span><span className="n">{peopleCount(r, invisible)}</span>{r.id === current && <span className="k">{I.check()}</span>}
    </button>)}
    <div className="rule" />
    <button type="button" className="row" onClick={() => onPick('none')}><span>No room tab</span></button>
  </div>;
}
