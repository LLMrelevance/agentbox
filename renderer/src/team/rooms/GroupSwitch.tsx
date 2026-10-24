// Five ways to move between groups, drawn for a pick (w-dcaa2c122e, round 21;
// a trial, not for shipping): a list page up the trail, a lobby up the trail,
// the list beside the chat, a menu on the group's name, and a finder. Groups
// in the sidebar opens the group you were in last in all five.
import { useEffect, useRef, useState } from 'react';
import type { GroupChoice } from './GroupList';
import { GroupMark } from './GroupList';
import { I } from './icons';
import { useOutside } from './RoomsPage';
import { updatedWords } from '../../threads/page-rules';
import { LiveMark } from '../../components/LiveMark';

export type SwitchLook = 'table' | 'lobby' | 'beside' | 'menu' | 'finder';
const LOOKS: readonly SwitchLook[] = ['table', 'lobby', 'beside', 'menu', 'finder'];
export const SWITCH_KEY = 'groups.switch';

export function readSwitchLook(): SwitchLook {
  try { const v = localStorage.getItem(SWITCH_KEY) as SwitchLook | null; return v && LOOKS.includes(v) ? v : 'table'; } catch { return 'table'; }
}

/** A group as the switchers draw it: who is in it, and who of them is working on what. */
export type GroupRow = GroupChoice & { members: number; working: number; othersWorking: number; busy: { name: string; on: string }[] };

/** A named group counts everyone, as its People list does; a chat counts the others in it. */
export function workingWords(g: GroupRow): string {
  if (!g.faces.length) return g.members > 1 ? `${g.working} of ${g.members}` : '';
  if (g.faces.length === 1) return g.othersWorking ? 'Working' : '';
  return g.othersWorking ? `${g.othersWorking} of ${g.faces.length}` : '';
}
const searchable = (g: GroupRow) => `${g.name} ${g.last}`.toLowerCase();

/** Up the trail: every group as the Inbox's rows are drawn. */
export function GroupsTable({ rows, now, onOpen, onFind }: { rows: GroupRow[]; now: number; onOpen: (key: string) => void; onFind: () => void }) {
  return <div className="list th-table gs-table">
    <div className="row th-head"><span className="mark" aria-hidden="true" /><div className="row-main th-grid gs-grid">
      <div>Group</div><div>Last message</div><div>Working</div><div className="num">Sent</div>
    </div></div>
    {rows.map((g) => <div role="button" tabIndex={0} key={g.key} className={`row${g.unread ? ' unread' : ''}`}
      onClick={() => onOpen(g.key)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(g.key); }}>
      <span className="mark" aria-hidden="true" /><div className="row-main th-grid gs-grid">
        <div className="th-cell-title gs-nm"><GroupMark g={g} size={18} /><span className="subject">{g.name}</span></div>
        <div className="gs-last">{g.last}</div>
        <div className="th-cell-state">{workingWords(g)}</div>
        <div className="th-cell-when num">{g.at ? updatedWords(g.at, now) : ''}</div>
      </div>
    </div>)}
    <div role="button" tabIndex={0} className="row gs-find" onClick={onFind} onKeyDown={(e) => { if (e.key === 'Enter') onFind(); }}>
      <span className="mark" aria-hidden="true" /><div className="row-main gs-nm">{I.search()}<span>Find groups to join</span></div>
    </div>
  </div>;
}

/** Up the trail: every group as a card saying who in it is working on what. */
export function GroupsLobby({ rows, now, onOpen }: { rows: GroupRow[]; now: number; onOpen: (key: string) => void }) {
  return <div className="gs-lobby">
    {rows.map((g) => <button type="button" key={g.key} className={`gs-card${g.unread ? ' unread' : ''}`} onClick={() => onOpen(g.key)}>
      <span className="gs-card-hd"><GroupMark g={g} size={20} /><span className="gs-card-nm">{g.name}</span>
        <span className="gs-card-when">{g.at ? updatedWords(g.at, now) : ''}</span></span>
      <span className="gs-card-busy">{g.busy.slice(0, 3).map((b, i) => <span key={i} className="gs-busy"><LiveMark /><b>{b.name}</b><span>{b.on}</span></span>)}
        {!g.busy.length && <span className="gs-busy idle">Nobody is working</span>}</span>
      <span className="gs-card-last">{g.last || 'Nothing said yet'}</span>
    </button>)}
  </div>;
}

/** Beside the chat: the groups down the left of the page, the open one lit. */
export function GroupsBeside({ rows, current, now, onOpen }: { rows: GroupRow[]; current: string | null; now: number; onOpen: (key: string) => void }) {
  const [q, setQ] = useState('');
  const shown = rows.filter((g) => !q.trim() || searchable(g).includes(q.trim().toLowerCase()));
  return <aside className="gs-beside">
    <label className="gs-search">{I.search()}<input value={q} placeholder="Find a group" aria-label="Find a group"
      onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') { setQ(''); (e.target as HTMLInputElement).blur(); } }} /></label>
    <div className="gs-beside-list">{shown.map((g) => <button type="button" key={g.key} className={`gs-brow${g.key === current ? ' on' : ''}${g.unread && g.key !== current ? ' unread' : ''}`} onClick={() => onOpen(g.key)}>
      <GroupMark g={g} size={20} />
      <span className="gs-bw"><span className="gs-b1"><span className="rm-one">{g.name}</span><span className="gs-bt">{g.at ? updatedWords(g.at, now) : ''}</span></span>
        <span className="gs-b2 rm-one">{g.last}</span></span>
    </button>)}</div>
  </aside>;
}

/** On the group's name: a menu of every group, under the name. */
export function GroupNameMenu({ rows, current, onOpen }: { rows: GroupRow[]; current: GroupRow | undefined; onOpen: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  return <div className="gs-namewrap">
    <h1 className="workspace-title"><button type="button" className={`gs-name${open ? ' open' : ''}`} aria-haspopup="menu" aria-expanded={open}
      onMouseDown={(e) => { if (open) e.stopPropagation(); }} onClick={() => setOpen(!open)}>
      {current && (current.faces.length ? <GroupMark g={current} size={20} /> : <span className="gt-hh">{I.hash(15)}</span>)}
      <span>{current?.name ?? 'Groups'}</span><span className="gs-chev">{I.down()}</span>
    </button></h1>
    {open && <NameMenu rows={rows} current={current?.key ?? null} onClose={() => setOpen(false)} onOpen={(k) => { setOpen(false); onOpen(k); }} />}
  </div>;
}

function NameMenu({ rows, current, onOpen, onClose }: { rows: GroupRow[]; current: string | null; onOpen: (key: string) => void; onClose: () => void }) {
  const ref = useOutside(onClose);
  return <div ref={ref} className="rm-pop gs-namemenu" role="menu">
    {rows.map((g) => <button type="button" key={g.key} role="menuitem" className={`row${g.key === current ? ' on' : ''}`} onClick={() => onOpen(g.key)}>
      <span className="gs-ic">{g.faces.length ? <GroupMark g={g} size={18} /> : I.hash(14)}</span><span className="rm-one">{g.name}</span>
      {g.unread && g.key !== current && <i className="gs-dot" aria-label="Unread" />}
    </button>)}
  </div>;
}

/** A finder over the page, by name or by what was said, opened with G or the button beside the name. */
export function GroupFinder({ rows, now, onOpen, onClose }: { rows: GroupRow[]; now: number; onOpen: (key: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => { box.current?.focus(); }, []);
  const shown = rows.filter((g) => !q.trim() || searchable(g).includes(q.trim().toLowerCase()));
  const pick = shown[Math.min(at, shown.length - 1)];
  return <div className="modal-backdrop palette-backdrop" onClick={onClose}>
    <div className="modal palette gs-finder" role="dialog" aria-label="Go to a group" onClick={(e) => e.stopPropagation()}>
      <input ref={box} className="palette-input" value={q} placeholder="Go to a group…" aria-label="Go to a group"
        onChange={(e) => { setQ(e.target.value); setAt(0); }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') onClose();
          if (e.key === 'ArrowDown') { e.preventDefault(); setAt((n) => Math.max(0, Math.min(n + 1, shown.length - 1))); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setAt((n) => Math.max(n - 1, 0)); }
          if (e.key === 'Enter' && pick) onOpen(pick.key);
        }} />
      <div className="palette-list gs-flist">
        {!shown.length && <div className="palette-empty">No group matches “{q.trim()}”.</div>}
        {shown.map((g) => <div key={g.key} className={`palette-item gs-frow${g === pick ? ' selected' : ''}`} onMouseEnter={() => setAt(shown.indexOf(g))} onClick={() => onOpen(g.key)}>
          <GroupMark g={g} size={20} />
          <span className="gs-fw"><span className="gs-f1"><span className="rm-one">{g.name}</span>{g.unread && <i className="gs-dot" aria-label="Unread" />}</span>
            <span className="gs-f2 rm-one">{g.last}</span></span>
          <span className="gs-fm">{g.at ? updatedWords(g.at, now) : ''}</span>
        </div>)}
      </div>
    </div>
  </div>;
}

/** The group's name with the finder's button beside it. */
export function FinderTitle({ current, onFind }: { current: GroupRow | undefined; onFind: () => void }) {
  return <h1 className="workspace-title gt-gtitle">
    {current && (current.faces.length ? <GroupMark g={current} size={20} /> : <span className="gt-hh">{I.hash(15)}</span>)}
    <span>{current?.name ?? 'Groups'}</span>
    <button type="button" className="gs-findbtn" aria-label="Go to a group" title="Go to a group (G)" onClick={onFind}>{I.search()}<kbd>G</kbd></button>
  </h1>;
}
