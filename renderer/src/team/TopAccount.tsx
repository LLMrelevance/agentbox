// Your face at the right end of the top bar, for a window with no sidebar
// (w-dcaa2c122e): who you are, Settings, Feedback and Sign out.
import { useEffect, useRef, useState } from 'react';
import type { Person } from '../types';
import { RoomFace } from './rooms/RoomFace';

export function TopAccount({ me, onAccount, onSettings, onFeedback, onSignOut }: {
  me: Person; onAccount: () => void; onSettings: () => void; onFeedback: () => void; onSignOut: () => void;
}) {
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
  const go = (fn: () => void) => () => { setOpen(false); fn(); };
  return <span ref={ref} className="g9-acct">
    <button type="button" className={`g9-me${open ? ' open' : ''}`} aria-label="Your account" title="Your account" onClick={() => setOpen((o) => !o)}>
      <RoomFace name={me.name || me.email} url={me.avatarUrl} size={28} />
    </button>
    {open && <div className="rm-pop g9-menu" role="menu">
      <button type="button" className="row g9-who" onClick={go(onAccount)}>
        <RoomFace name={me.name || me.email} url={me.avatarUrl} size={32} />
        <span><b>{me.name || me.email}</b><small>{me.email}</small></span>
      </button>
      <div className="rule" />
      <button type="button" className="row" onClick={go(onSettings)}><span>Settings</span></button>
      <button type="button" className="row" onClick={go(onFeedback)}><span>Feedback</span></button>
      <div className="rule" />
      <button type="button" className="row" onClick={go(onSignOut)}><span>Sign out</span></button>
    </div>}
  </span>;
}
