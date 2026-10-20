// A room's chat panel (round 23): the room's name (which switches chats), an
// invite button and the arrows that open it full page. Messages read top
// down: a short chat starts at the top, and once it is full the newest sits by
// the box you type in. Replies open in the panel; the wall stays put.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Room, RoomCard, RoomMessage } from '../../types';
import { chatLayout } from '../chat-layout';
import { I } from './icons';
import { RoomFace } from './RoomFace';
import { cardName, clockOf, markMentions, mentionsIn } from './room-rules';

export type ChatPerson = { id: string; name: string; avatarUrl: string | null; me: boolean };

export function peopleOf(wall: readonly RoomCard[]): ChatPerson[] {
  return wall.map((c) => ({ id: c.id, name: c.name, avatarUrl: c.avatarUrl, me: c.me }));
}

export function RoomChat({ room, messages, people, meId, now, onSend, onRead, onInvite, onExpand, onSwitch, switchOpen, full = false, head }: {
  room: Room; messages: RoomMessage[]; people: ChatPerson[]; meId: string | null; now: number;
  onSend: (body: string, opts: { inReplyTo: string | null; mentions: string[] }) => Promise<string | null>;
  onRead: () => void; onInvite?: () => void; onExpand?: () => void;
  onSwitch?: (anchor: DOMRect) => void; switchOpen?: boolean;
  /** Drawn on the messages page, at full width, with its own header. */
  full?: boolean; head?: ReactNode;
}) {
  const [thread, setThread] = useState<string | null>(null);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const roots = messages.filter((m) => !m.inReplyTo);
  const replies = useMemo(() => {
    const out = new Map<string, RoomMessage[]>();
    for (const m of messages) if (m.inReplyTo) out.set(m.inReplyTo, [...(out.get(m.inReplyTo) ?? []), m]);
    return out;
  }, [messages]);
  const root = thread ? messages.find((m) => m.id === thread) ?? null : null;
  const shown = root ? [root, ...(replies.get(root.id) ?? [])] : roots;
  const names = people.map((p) => p.name);

  // Reading the room is having it open with the window in front.
  useEffect(() => {
    const read = () => { if (document.visibilityState === 'visible' && document.hasFocus()) onRead(); };
    read();
    window.addEventListener('focus', read);
    return () => window.removeEventListener('focus', read);
  }, [room.id, messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const who = (id: string | null) => (id ? byId.get(id) : undefined);
  const nameOf = (id: string | null) => { const p = who(id); return p ? cardName(p) : 'Someone'; };
  const listRef = useStick([room.id, thread, shown.length]);
  const slots = chatLayout(shown.map((m) => ({ at: m.at, by: m.by ?? '' })), now);

  return <div className={full ? 'rm-full' : 'rm-chat'}>
    {head ?? <div className="rm-chat-head">
      {root
        ? <><button type="button" className="rm-switch" onClick={() => setThread(null)}>{I.back()}<span>Thread</span></button>
          <span className="rm-label" style={{ marginLeft: 'auto', marginRight: 4 }}>{(replies.get(root.id)?.length ?? 0)} {(replies.get(root.id)?.length ?? 0) === 1 ? 'reply' : 'replies'}</span></>
        : <button type="button" className={`rm-switch${switchOpen ? ' open' : ''}`} onClick={(e) => onSwitch?.(e.currentTarget.getBoundingClientRect())}>
          {I.hash(15)}<span>{room.name}</span>{onSwitch && I.down()}
        </button>}
      {!root && onInvite && room.kind !== 'group' && <button type="button" className="ic" title={`Invite people to ${room.name}`} aria-label={`Invite people to ${room.name}`} onClick={onInvite}>{I.invite(14)}</button>}
      {onExpand && <button type="button" className="ic" style={root ? { marginLeft: 0 } : undefined} title="Open full page" aria-label="Open full page" onClick={onExpand}>{I.expand()}</button>}
    </div>}
    <div className="rm-chat-list" ref={listRef}>
      {shown.map((m, i) => {
        const slot = slots[i];
        const mine = m.by === meId;
        const mentioned = !!meId && m.mentions.includes(meId) && !mine;
        const reps = !root ? replies.get(m.id) ?? [] : [];
        const p = who(m.by);
        return <div key={m.id}>
          {slot.day && <div className="rm-day"><span className="rm-label">{slot.day}</span></div>}
          <div className={`rm-cm${slot.head || (root && i === 0) ? '' : ' cont'}${mentioned ? ' mine' : ''}${root && i === 0 ? ' root' : ''}`}>
            {(slot.head || (root && i === 0)) && <div className="h">
              <RoomFace name={p?.name ?? '?'} url={p?.avatarUrl} size={16} />
              <span>{nameOf(m.by)}</span><em>{clockOf(m.at)}</em>
              {!root && <button type="button" className="act" onClick={() => setThread(m.id)}>Reply</button>}
            </div>}
            <div className="tx">{markMentions(m.body, names).map((part, k) => part.mention ? <b key={k}>{part.text}</b> : <span key={k}>{part.text}</span>)}</div>
            {reps.length > 0 && <button type="button" className="rep" onClick={() => setThread(m.id)}>
              {[...new Set(reps.map((r) => r.by))].slice(0, 3).map((id) => <RoomFace key={id ?? 'x'} name={who(id)?.name ?? '?'} url={who(id)?.avatarUrl} size={13} />)}
              <span style={{ marginLeft: 5 }}>{reps.length} {reps.length === 1 ? 'reply' : 'replies'}</span>
            </button>}
          </div>
        </div>;
      })}
    </div>
    <Composer key={`${room.id}:${thread ?? ''}`} people={people.filter((p) => !p.me)}
      placeholder={root ? `Reply to ${nameOf(root.by)}` : `Message ${room.name}`}
      onSend={(body) => onSend(body, { inReplyTo: root?.id ?? null, mentions: mentionsIn(body, people.filter((p) => !p.me)) })} />
  </div>;
}

// Keeps the newest message in view while you are at the bottom, and leaves
// you where you are when you have scrolled up to read.
function useStick(deps: unknown[]) {
  const ref = useRef<HTMLDivElement | null>(null);
  const atBottom = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = () => {
      atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      el.classList.toggle('more-above', el.scrollTop > 4);
    };
    el.addEventListener('scroll', on);
    return () => el.removeEventListener('scroll', on);
  }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
    el?.classList.toggle('more-above', (el?.scrollTop ?? 0) > 4);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

function Composer({ placeholder, people, onSend }: { placeholder: string; people: ChatPerson[]; onSend: (body: string) => Promise<string | null> }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(0);
  const ref = useRef<HTMLTextAreaElement | null>(null);
  // "@" then letters at the cursor opens the people in the room.
  const at = /(^|\s)@([\p{L}.]*)$/u.exec(text.slice(0, ref.current?.selectionStart ?? text.length));
  const matches = at ? people.filter((p) => p.name.toLowerCase().startsWith(at[2].toLowerCase())).slice(0, 6) : [];
  const choose = (p: ChatPerson) => {
    const cut = ref.current?.selectionStart ?? text.length;
    const before = text.slice(0, cut).replace(/@([\p{L}.]*)$/u, `@${p.name} `);
    setText(before + text.slice(cut));
    setPick(0);
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(before.length, before.length); });
  };
  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    const err = await onSend(body);
    setBusy(false);
    if (err) { setError(err); return; }
    setError(null);
    setText('');
  };
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(160, el.scrollHeight)}px`;
  }, [text]);
  return <>
    {matches.length > 0 && <div className="rm-picker rm-pop rm-menu" style={{ position: 'absolute' }}>
      {matches.map((p, i) => <button type="button" key={p.id} className={`row${i === pick ? ' on' : ''}`} onMouseDown={(e) => { e.preventDefault(); choose(p); }}>
        <RoomFace name={p.name} url={p.avatarUrl} size={18} /><span>{p.name}</span></button>)}
    </div>}
    {error && <div className="rm-chat-err" role="alert">{error}</div>}
    <div className="rm-compose">
      <textarea ref={ref} rows={1} value={text} placeholder={placeholder} aria-label={placeholder}
        onChange={(e) => { setText(e.target.value); setPick(0); }}
        onKeyDown={(e) => {
          if (matches.length) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setPick((n) => (n + 1) % matches.length); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setPick((n) => (n + matches.length - 1) % matches.length); return; }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(matches[pick] ?? matches[0]); return; }
          }
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
          if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur();
        }} />
    </div>
  </>;
}
