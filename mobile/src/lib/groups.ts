// Groups on the phone (renderer/src/phone-groups.ts): where the tab sits and
// the rules the Groups place draws by, apart from the drawing.
import { TABS, type TabId } from './tabs';
import type { Room, RoomCard, RoomMessage } from '../../../renderer/src/types';

export type PlaceId = TabId | 'groups';

/** The bottom bar: the four tabs, and Groups after Done while the computer has Groups on. */
export function bottomTabs(groups: boolean): { id: PlaceId; label: string }[] {
  return groups ? [...TABS, { id: 'groups', label: 'Groups' }] : [...TABS];
}

export const LAST_GROUP_KEY = 'groups.last';

/** The group Groups opens on: the one open last while you are still in it, else your team's, else the newest. */
export function groupToOpen(rooms: readonly Room[], last: string | null): Room | null {
  return rooms.find((r) => r.id === last)
    ?? rooms.find((r) => r.teamId)
    ?? [...rooms].sort((a, b) => b.lastAt - a.lastAt)[0]
    ?? null;
}

/** A named group's name, or the people in a chat. */
export function groupName(r: Pick<Room, 'kind' | 'name' | 'wall'>): string {
  if (r.kind !== 'group') return r.name;
  return r.wall.filter((c) => !c.me).map((c) => c.name || 'Someone').join(', ') || r.name;
}

/** Named groups first, then chats, each newest first (renderer GroupList `groupChoices`). */
export function groupsInOrder(rooms: readonly Room[]): Room[] {
  const named = (r: Room) => (r.kind === 'group' ? 1 : 0);
  return [...rooms].sort((a, b) => named(a) - named(b) || b.lastAt - a.lastAt);
}

export { drawnRoots as chatRoots } from '../../../renderer/src/team/rooms/room-chat-rules';

export function repliesTo(messages: readonly RoomMessage[], id: string): RoomMessage[] {
  return messages.filter((m) => m.inReplyTo === id && !m.deleted);
}

/** A message starts a run, with its face and name, unless the one before is the same person's within five minutes. */
export function startsRun(list: readonly RoomMessage[], i: number): boolean {
  const m = list[i];
  const before = list[i - 1];
  return !before || before.by !== m.by || m.at - before.at > 5 * 60_000 || new Date(before.at).toDateString() !== new Date(m.at).toDateString();
}

/** What the People list says under a name (renderer GroupPage `onWords`). */
export function onWords(c: RoomCard): string {
  if (c.away) return 'Not on Groups yet';
  if (c.agents) return c.workingOn ?? c.bio ?? 'Private thread';
  return c.status ?? 'Not running';
}
