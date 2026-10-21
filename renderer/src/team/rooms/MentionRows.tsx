// A message in a room that names me is a row at the top of Needs you, until I
// read the room past it (docs/team/ROOMS-PLAN.md, Chat, mentions, unread).
// Drawn from room state, never written into my store.
import type { RoomMention } from '../../types';
import { RowCells } from '../../threads/Pages';
import { I } from './icons';
import { RoomFace } from './RoomFace';

export function MentionRows({ mentions, faces, now, onOpen }: {
  mentions: RoomMention[]; faces: Map<string, string | null>; now: number; onOpen: (m: RoomMention) => void;
}) {
  return <>{mentions.map((m) => <div key={m.id} className="row rm-mention" role="button" tabIndex={0}
    onClick={() => onOpen(m)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(m); }}>
    <span className="mark" aria-hidden="true" />
    <RowCells
      title={<span className="th-msg"><RoomFace name={m.byName || '?'} url={m.by ? faces.get(m.by) ?? null : null} size={18} /><b className="th-msg-who">{m.byName || 'Someone'}</b><span className="th-msg-text">{m.body}</span></span>}
      where={<span className="rm-where">{I.hash()}{m.roomName}</span>}
      priority={null} updatedAt={m.at} now={now} />
  </div>)}</>;
}
