// One room in the Threads tab bar, after Done, and the picker on its arrow
// that chooses which room it is, or none.
import type { Room } from '../../types';
import { I } from './icons';
import { useOutside } from './RoomsPage';
import { peopleCount } from './room-rules';

export function RoomTab({ room, count, open, onOpen, onMenu }: {
  room: Room; count: number; open: boolean; onOpen: () => void; onMenu: (at: DOMRect) => void;
}) {
  return <>
    <span className="rm-sep" aria-hidden="true" />
    <span className="tm-tab rm-tab">
      <button type="button" className="rm-tabname" data-hint="state-tab" onClick={onOpen}>{I.hash()}{room.name}<b>{count}</b></button>
      <button type="button" className={`rm-tabpick${open ? ' open' : ''}`} aria-label="Pick the room in this tab" title="Pick the room in this tab"
        onClick={(e) => onMenu((e.currentTarget.parentElement ?? e.currentTarget).getBoundingClientRect())}>{I.down()}</button>
    </span>
  </>;
}

export function RoomTabMenu({ rooms, current, invisible, at, onPick, onClose }: {
  rooms: Room[]; current: string | null; invisible: boolean; at: Pick<DOMRect, 'left' | 'right' | 'bottom'>;
  onPick: (choice: string) => void; onClose: () => void;
}) {
  const ref = useOutside(onClose);
  // Hangs from the start of the tab, as long as it stays inside the window.
  const left = Math.max(8, Math.min(at.left, (typeof window === 'undefined' ? Infinity : window.innerWidth) - 228));
  return <div ref={ref} className="rm-menu rm-pop rm-tabmenu" role="menu" style={{ left, top: at.bottom + 6 }}>
    <div className="head rm-label">Room in this tab</div>
    {rooms.filter((r) => r.kind !== 'group').map((r) => <button type="button" key={r.id} className={`row${r.id === current ? ' on' : ''}`} onClick={() => onPick(r.id)}>
      {I.hash()}<span>{r.name}</span><span className="n">{peopleCount(r, invisible)}</span>{r.id === current && <span className="k">{I.check()}</span>}
    </button>)}
    <div className="rule" />
    <button type="button" className="row" onClick={() => onPick('none')}><span>No room tab</span></button>
  </div>;
}
