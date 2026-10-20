// Room tabs after Done (round 23): pinned rooms, then the room open now if it
// is not pinned. The number on a tab is how many people are in the room.
import type { Room } from '../../types';
import { I } from './icons';
import { roomTabs } from './room-rules';

export function RoomTabs({ rooms, openId, onOpen }: { rooms: Room[]; openId: string | null; onOpen: (id: string) => void }) {
  const tabs = roomTabs(rooms, openId);
  if (!tabs.length) return null;
  return <>
    <span className="rm-sep" aria-hidden="true" />
    {tabs.map(({ room }) => <button type="button" key={room.id} data-hint="state-tab"
      className={`tm-tab rm-tab${openId === room.id ? ' on' : ''}`} onClick={() => onOpen(room.id)}>
      {I.hash()}{room.name}<b>{room.members}</b>
    </button>)}
  </>;
}
