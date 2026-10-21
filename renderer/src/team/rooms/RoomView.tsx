// A room's View button, in the place the Inbox has its View and filters
// button: the room as a grid of people or a board of their threads, and whose
// threads the board shows. B flips the view, as it does on the Inbox.
import { useEffect, useRef, useState } from 'react';
import type { RoomCard } from '../../types';
import { BoardIcon, SlidersIcon, StateGlyph } from '../../threads/Pages';
import { togglePicked } from '../../threads/people-rules';
import { RoomFace } from './RoomFace';
import { cardName, type RoomView } from './room-rules';

const GridIcon = () => <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="4" y="4" width="7" height="7" /><rect x="13" y="4" width="7" height="7" /><rect x="4" y="13" width="7" height="7" /><rect x="13" y="13" width="7" height="7" /></svg>;

type Props = {
  view: RoomView; onView: (view: RoomView) => void;
  /** Who can be on the board (`boardPeople`), and who is. */
  people: RoomCard[]; picked: string[]; onPick: (ids: string[]) => void;
  /** How many people here have no threads that reach me. */
  unseen: number;
  /** Whether the board shows its Later column. */
  later: boolean; onLater: (shown: boolean) => void;
};

export function RoomViewButton(props: Props) {
  const { view, people, picked } = props;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', down);
    window.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('mousedown', down); window.removeEventListener('keydown', key, true); };
  }, [open]);
  // Later off is how the board starts, so only leaving someone out lights it.
  const narrowed = view === 'board' && picked.length < people.length;
  return <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
    <button type="button" className={`th-disp${open ? ' open' : ''}`} aria-label="View" title="View (B)" onClick={() => setOpen((o) => !o)}>
      <SlidersIcon />{narrowed && <i />}
    </button>
    {open && <RoomViewMenu {...props} />}
  </span>;
}

export function RoomViewMenu({ view, onView, people, picked, onPick, unseen, later, onLater }: Props) {
  const board = view === 'board';
  const everyone = picked.length >= people.length;
  const ordered = [...people.filter((p) => p.me), ...people.filter((p) => !p.me)];
  return <div className="th-pop rm-viewpop" role="dialog" aria-label="Room view">
    <div className="line"><span className="lab">View</span><span className="opts">
      <button type="button" className={board ? '' : 'on'} title="Grid (B)" onClick={() => onView('grid')}><GridIcon />Grid</button>
      <button type="button" className={board ? 'on' : ''} title="Board (B)" onClick={() => onView('board')}><BoardIcon />Board</button>
    </span></div>
    {board && <div className="line"><span className="lab">Show</span><span className="opts">
      <button type="button" className={later ? 'on' : ''} aria-pressed={later} onClick={() => onLater(!later)}><StateGlyph state="scheduled" />Later</button>
    </span></div>}
    {board && people.length > 1 && <>
      <div className="rule" />
      <div className="line"><span className="lab">People</span><span className="opts">
        <button type="button" className={everyone ? 'on' : ''} onClick={() => onPick(people.map((p) => p.id))}>Everyone</button>
        {ordered.map((p) => <button type="button" key={p.id} aria-pressed={picked.includes(p.id)} className={picked.includes(p.id) && !everyone ? 'on' : ''}
          onClick={() => onPick(everyone ? [p.id] : togglePicked(picked, p.id, null))}>
          <RoomFace name={p.name} url={p.avatarUrl} size={16} />{cardName(p)}
        </button>)}
      </span></div>
    </>}
    {board && unseen > 0 && <div className="line"><span className="lab" /><span className="rm-viewnote">Only teammates who share their threads are on the board.</span></div>}
  </div>;
}
