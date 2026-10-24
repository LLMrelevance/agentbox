// With Groups on there is no sidebar (w-dcaa2c122e): the top bar's first word,
// Inbox or Groups, is a menu of both and of every group, and your face at the
// right end holds your account.
import { useEffect, useRef, useState } from 'react';
import type { Person } from '../../types';
import { RoomFace } from './RoomFace';
import { GroupMark, type GroupChoice } from './GroupList';
import { I } from './icons';
import { AccountMenuList } from '../account-menu';
import { StatusComposer } from '../status';
import { GoInvisible, type Invisible } from './GoInvisible';
import { SidebarMove, SidebarUpdate } from '../../components/SidebarUpdate';
import { changeLines, closedHere, readMoveClosed, readUpdateClosed } from '../../update-row';

type Page = 'inbox' | 'groups';

/** Past this many, the menu's groups end in All groups. */
export const GROUPS_IN_MENU = 10;

/** Named groups first, your pinned one leading, then chats as they come; all of them once asked. */
export function menuGroups(groups: readonly GroupChoice[], all: boolean): { shown: GroupChoice[]; more: number } {
  const named = groups.filter((g) => !g.faces.length).sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name));
  const ordered = [...named, ...groups.filter((g) => g.faces.length)];
  const shown = all ? ordered : ordered.slice(0, GROUPS_IN_MENU);
  return { shown, more: ordered.length - shown.length };
}

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLSpanElement>(null);
  const shut = useRef(close);
  shut.current = close;
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) shut.current(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); shut.current(); } };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('keydown', key); };
  }, [open]);
  return ref;
}

const Chevron = () => <svg className="gt-chev" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>;

export function PageMenuList({ on, groups, all, onAll, onInbox, onGroups, onPick }: {
  on: Page; groups: readonly GroupChoice[]; all: boolean; onAll: () => void;
  onInbox: () => void; onGroups: () => void; onPick: (key: string) => void;
}) {
  const { shown, more } = menuGroups(groups, all);
  return <div className="gt2-menu gt2-nav" role="menu">
    <button type="button" role="menuitem" className={`gt2-row${on === 'inbox' ? ' on' : ''}`} onClick={onInbox}>
      <span className="gt2-ic">{I.inboxNav()}</span><span>Inbox</span></button>
    <button type="button" role="menuitem" className={`gt2-row${on === 'groups' ? ' on' : ''}`} onClick={onGroups}>
      <span className="gt2-ic">{I.groupNav()}</span><span>Groups</span></button>
    {shown.length > 0 && <div className="gt2-sub">
      {shown.map((g) => <button type="button" role="menuitem" key={g.key} className={`gt2-row gt2-subrow${g.unread ? ' unread' : ''}`} onClick={() => onPick(g.key)}>
        {g.faces.length ? <span className="gt2-ic"><GroupMark g={g} size={16} /></span> : <span className="gt2-ic gt2-hash">{I.hash(13)}</span>}
        <span className="rm-one">{g.name}</span>{g.unread && <span className="gt2-dot" aria-label="Unread" />}</button>)}
      {more > 0 && <button type="button" role="menuitem" className="gt2-row gt2-subrow gt2-all" onClick={onAll}><span className="gt2-ic" /><span>All groups</span></button>}
    </div>}
  </div>;
}

/** The page's name, Inbox or Groups, opening the menu. */
export function PageMenu({ on, groups, onInbox, onGroups, onPick }: {
  on: Page; groups: readonly GroupChoice[]; onInbox: () => void; onGroups: () => void; onPick: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const close = () => { setOpen(false); setAll(false); };
  const ref = useOutside(open, close);
  const go = (fn: () => void) => () => { close(); fn(); };
  return <span ref={ref} className="gt-tmwrap">
    <button type="button" className={`gt-titlemenu${open ? ' open' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
      <span>{on === 'inbox' ? 'Inbox' : 'Groups'}</span><Chevron />
    </button>
    {open && <PageMenuList on={on} groups={groups} all={all} onAll={() => setAll(true)}
      onInbox={go(onInbox)} onGroups={go(onGroups)} onPick={(key) => { close(); onPick(key); }} />}
  </span>;
}

/** Your face at the right end of the top bar, opening the account menu the sidebar's foot held, with Feedback in it. */
export function AccountFace({ me, now, invisible = null, onAccount, onInvite, onSettings, onFeedback, onSignOut }: {
  me: Person; now: number; invisible?: Invisible | null;
  onAccount?: () => void; onInvite?: () => void; onSettings?: () => void; onFeedback?: () => void; onSignOut?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'menu' | 'status' | 'invisible'>('menu');
  const close = () => { setOpen(false); setMode('menu'); };
  const ref = useOutside(open, close);
  const go = (fn?: () => void) => fn && (() => { close(); fn(); });
  return <span ref={ref} className="gt-acct">
    <button type="button" className={`gt-me${open ? ' open' : ''}`} aria-label="Your account" aria-haspopup="menu" aria-expanded={open}
      onClick={() => (open ? close() : setOpen(true))}><RoomFace name={me.name || me.email} url={me.avatarUrl} size={28} /></button>
    {open && mode === 'invisible' && invisible && <GoInvisible now={now} onGo={(m) => { close(); invisible.onGo(m); }} />}
    {open && mode === 'status' && <div className="th-me-pop"><StatusComposer person={me} now={now} onDone={close} /></div>}
    {open && mode === 'menu' && <AccountMenuList me={me} now={now} onStatus={() => setMode('status')}
      onInvisible={invisible ? (invisible.on ? go(invisible.onComeBack) : () => setMode('invisible')) : undefined} invisibleOn={!!invisible?.on}
      onAccount={go(onAccount)} onInvite={go(onInvite)} onSettings={go(onSettings)} onFeedback={go(onFeedback)} onSignOut={go(onSignOut)} />}
  </span>;
}

type Update = { installing: boolean; version?: string | null; changes?: string[]; behind?: number | null; error?: string | null };
type Move = { place: string | null; error: string | null };

/** A new version waiting, or a copy that has to move to update, as the sidebar's shut rail shows them; a card closed there stays closed. */
export function TopNotices({ update, onUpdate, move, onMove }: { update: Update | null; onUpdate: () => void; move: Move | null; onMove: () => void }) {
  const showUpdate = !!update && !closedHere(update, readUpdateClosed());
  const showMove = !showUpdate && !!move && readMoveClosed() !== (move.place ?? '');
  if (!showUpdate && !showMove) return null;
  return <span className="gt-notice">
    {showUpdate && update && <SidebarUpdate installing={update.installing} changes={changeLines(update)} error={update.error ?? null} collapsed onRestart={onUpdate} onClose={() => {}} />}
    {showMove && move && <SidebarMove place={move.place} error={move.error} collapsed onMove={onMove} onClose={() => {}} />}
  </span>;
}

/** Where a page under a group sits, after the page's name: back, the group, then the page. */
export function PageCrumb({ parts, onBack }: { parts: string[]; onBack: () => void }) {
  return <span className="gt-crumb">
    <button type="button" className="gt-crumb-back" aria-label="Back" title="Back (esc)" onClick={onBack}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg></button>
    {parts.map((p, i) => <span key={i} className={`gt-crumb-part${i === parts.length - 1 ? ' last' : ''}`}>{i > 0 && <span className="gt-crumb-sep">/</span>}{p}</span>)}
  </span>;
}
