// Find rooms (round 23): rooms open to everyone, most people first, with who
// is here now; a pasted invite link joins the room it is for.
import { useEffect, useState } from 'react';
import { I } from './icons';
import { RoomFace } from './RoomFace';
import { tokenFromLink } from '../../../../shared/room-links.mjs';

export type ListedRoom = { id: string; name: string; members: number; hereNow: number; joined: boolean; faces: { name: string; avatar: string | null }[] };

export function FindRooms({ load, onJoin, onOpen, onLink, onStart }: {
  load: () => Promise<ListedRoom[] | null>; onJoin: (id: string) => Promise<string | null>; onOpen: (id: string) => void;
  onLink: (token: string) => void; onStart: () => void;
}) {
  const [rooms, setRooms] = useState<ListedRoom[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { let on = true; void load().then((r) => { if (on) setRooms(r ?? []); }); return () => { on = false; }; }, [load]);
  const q = query.trim().toLowerCase();
  const shown = (rooms ?? []).filter((r) => !q || r.name.toLowerCase().includes(q));
  const typed = (text: string) => {
    const token = tokenFromLink(text);
    if (token && /\/join\/|:\/\//.test(text)) { setQuery(''); onLink(token); return; }
    setQuery(text);
  };
  return <div className="rm-find">
    <div className="bar">
      <span className="rm-label">Rooms open to everyone</span>
      <label className="rm-search">{I.search()}<input value={query} placeholder="Search rooms, or paste an invite link" aria-label="Search rooms"
        onChange={(e) => typed(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') (e.target as HTMLInputElement).blur(); }} /></label>
      <button type="button" className="rm-btn" onClick={onStart}>{I.hash(14)}Start a room</button>
    </div>
    {error && <div className="rm-err" role="alert">{error}</div>}
    <div className="rm-froom head"><span className="rm-label">Room</span><span className="rm-label">Here now</span><span className="rm-label" style={{ textAlign: 'right' }}>Members</span><span /></div>
    {rooms === null && <div className="rm-froom"><span className="rm-priv">Finding rooms…</span></div>}
    {rooms !== null && !shown.length && <div className="rm-froom"><span className="rm-priv">{q ? `No room called “${query.trim()}”.` : 'No rooms are open to everyone yet.'}</span></div>}
    {shown.map((r) => <div key={r.id} className="rm-froom">
      <div><span className="rm-nm">{I.hash()}{r.name}</span></div>
      <div className="here">{r.faces.slice(0, 4).map((f, i) => <RoomFace key={i} name={f.name} url={f.avatar} size={22} />)}<em>{r.hereNow} here now</em></div>
      <div className="v">{r.members.toLocaleString('en-US')}</div>
      <div className="j">{r.joined
        ? <button type="button" className="rm-btn" onClick={() => onOpen(r.id)}>Open</button>
        : <button type="button" className="rm-btn" disabled={busy === r.id} onClick={async () => {
          setBusy(r.id);
          const err = await onJoin(r.id);
          setBusy(null);
          if (err) setError(err); else onOpen(r.id);
        }}>Join</button>}</div>
    </div>)}
  </div>;
}
