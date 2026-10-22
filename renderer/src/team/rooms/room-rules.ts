// The rules the room screens draw by (w-3d0fa23ffb), kept apart from the
// drawing so they can be tested. tests/a-room-reads-the-way-it-was-approved.
import type { Room, RoomCard } from '../../types';

/** Pinned rooms in the sidebar's order, then the room open now if it is not pinned. */
export function roomTabs(rooms: readonly Room[], openId: string | null): { room: Room; visiting: boolean }[] {
  const out = rooms.filter((r) => r.pinned).map((room) => ({ room, visiting: false }));
  const open = openId ? rooms.find((r) => r.id === openId) : null;
  if (open && !open.pinned) out.push({ room: open, visiting: true });
  return out;
}

/** What Tab walks: the state tabs, then the room tabs. */
export function tabWalk(stateTabs: readonly string[], tabs: readonly { room: Room }[], at: string, back = false): string {
  const order = [...stateTabs, ...tabs.map((t) => `room:${t.room.id}`)];
  const i = order.indexOf(at);
  if (i < 0) return order[0];
  return order[(i + (back ? order.length - 1 : 1)) % order.length];
}

/** Their page's Activity tab: my own, or a teammate's who shares it. */
export const activityShown = (c: { me: boolean; teammate: boolean; showActivity: boolean }) => c.me || (c.teammate && c.showActivity);

/** A room drawn as its grid of people, or as a board of their threads. */
export type RoomView = 'grid' | 'board';
const VIEW_KEY = 'rooms.view';
const PICK_KEY = 'rooms.board.people';
const LATER_KEY = 'rooms.board.later';
type Store = Pick<Storage, 'getItem' | 'setItem'> | null;
const local = (): Store => (typeof localStorage === 'undefined' ? null : localStorage);

export function readRoomView(store: Store = local()): RoomView {
  try { return store?.getItem(VIEW_KEY) === 'board' ? 'board' : 'grid'; } catch { return 'grid'; }
}
export function writeRoomView(view: RoomView, store: Store = local()) {
  try { store?.setItem(VIEW_KEY, view); } catch { /* not kept */ }
}

/** Who can be on a room's board: whoever's Activity tab I may open. */
export const boardPeople = <T extends { me: boolean; teammate: boolean; showActivity: boolean }>(wall: readonly T[]) => wall.filter(activityShown);

/** The people picked for a room's board, kept to those still on it. Nobody left means everyone. */
export function boardPicked(saved: readonly string[] | null | undefined, people: readonly { id: string }[]): string[] {
  const ids = people.map((p) => p.id);
  const kept = (saved ?? []).filter((id) => ids.includes(id));
  return kept.length ? kept : ids;
}

/** A face over the board picked: just them from everyone, back to everyone from them alone. */
export function facePick(picked: readonly string[], all: readonly string[], id: string): string[] {
  if (picked.length >= all.length) return [id];
  if (picked.length === 1 && picked[0] === id) return [...all];
  return picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id];
}

/** Tiles to a row over the board: eight at most, and even rows past that. */
export function tilesPerRow(n: number, most = 8): number {
  return Math.ceil(n / Math.ceil(n / most));
}

/** Each room's pick, by room id. */
export function readBoardPicks(store: Store = local()): Record<string, string[]> {
  try {
    const all = JSON.parse(store?.getItem(PICK_KEY) ?? 'null');
    return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
  } catch { return {}; }
}
export function writeBoardPicks(picks: Record<string, string[]>, store: Store = local()) {
  try { store?.setItem(PICK_KEY, JSON.stringify(picks)); } catch { /* not kept */ }
}

/** Whether a room's board shows its Later column, which it does not until asked. */
export function readBoardLater(store: Store = local()): boolean {
  try { return store?.getItem(LATER_KEY) === '1'; } catch { return false; }
}
export function writeBoardLater(shown: boolean, store: Store = local()) {
  try { store?.setItem(LATER_KEY, shown ? '1' : '0'); } catch { /* not kept */ }
}

/** Their place in the room by agent hours this week; ties share a place. */
export function weekRank(wall: readonly RoomCard[], id: string): number {
  const mine = wall.find((c) => c.id === id)?.hoursWeek ?? 0;
  return 1 + wall.filter((c) => c.hoursWeek > mine).length;
}

export function agentsWords(n: number | null): string {
  if (n == null || n <= 0) return 'Not running';
  return `${n} ${n === 1 ? 'agent' : 'agents'} working`;
}

export function initialsOf(name: string): string {
  const s = String(name ?? '').replace(/[^\p{L}\p{N} ]/gu, '').trim();
  return (s.slice(0, 2) || '?').toUpperCase();
}

/** The name drawn on a card: "You" on my own. */
export const cardName = (c: Pick<RoomCard, 'me' | 'name'>) => (c.me ? 'You' : c.name || 'Someone');

export function clockOf(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

type Named = { id: string; name: string };

// "@Maya C." or "@Maya" names Maya. A first name two people share names
// neither, so a mention never lands on the wrong person.
export function mentionsIn(body: string, people: readonly Named[]): string[] {
  const text = ` ${String(body ?? '')} `;
  const lower = text.toLowerCase();
  const out = new Set<string>();
  const firsts = new Map<string, string[]>();
  for (const p of people) {
    const first = p.name.split(/\s+/)[0]?.toLowerCase();
    if (first) firsts.set(first, [...(firsts.get(first) ?? []), p.id]);
  }
  for (const p of people) {
    if (!p.name) continue;
    const full = `@${p.name.toLowerCase()}`;
    const first = `@${p.name.split(/\s+/)[0].toLowerCase()}`;
    if (hasWord(lower, full)) out.add(p.id);
    else if (hasWord(lower, first) && (firsts.get(first.slice(1))?.length ?? 0) === 1) out.add(p.id);
  }
  return [...out];
}

function hasWord(text: string, word: string): boolean {
  let at = text.indexOf(word);
  while (at >= 0) {
    const before = text[at - 1];
    const after = text[at + word.length];
    if (!/[\p{L}\p{N}]/u.test(before ?? ' ') && !/[\p{L}\p{N}]/u.test(after ?? ' ')) return true;
    at = text.indexOf(word, at + 1);
  }
  return false;
}

/** A message cut into plain text and the @names in it, for drawing. */
export function markMentions(body: string, names: readonly string[]): { text: string; mention: boolean }[] {
  const words = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length).map((n) => `@${n}`);
  if (!words.length) return [{ text: body, mention: false }];
  const out: { text: string; mention: boolean }[] = [];
  let rest = body;
  while (rest) {
    let best = -1;
    let hit = '';
    for (const w of words) {
      const i = rest.toLowerCase().indexOf(w.toLowerCase());
      if (i >= 0 && (best < 0 || i < best)) { best = i; hit = rest.slice(i, i + w.length); }
    }
    if (best < 0) { out.push({ text: rest, mention: false }); break; }
    if (best > 0) out.push({ text: rest.slice(0, best), mention: false });
    out.push({ text: hit, mention: true });
    rest = rest.slice(best + hit.length);
  }
  return out;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
// Invisible "until I turn it off" is held as a date far ahead.
export const UNTIL_TURNED_OFF_MS = 3650 * 24 * HOUR;

export function invisibleNotice(untilIso: string | null | undefined, now: number): string | null {
  const until = Date.parse(untilIso ?? '');
  if (!(until > now)) return null;
  const left = until - now;
  const minutes = Math.max(1, Math.round(left / MIN));
  const hours = Math.ceil(minutes / 60);
  const how = left > 365 * 24 * HOUR ? 'until you turn it off'
    : minutes < 60 ? `for ${minutes} more ${minutes === 1 ? 'minute' : 'minutes'}`
      : `for ${hours} more ${hours === 1 ? 'hour' : 'hours'}`;
  return `You are invisible ${how}. Nobody in your rooms can see you.`;
}

/** A sentence with one full stop, even when it ends on an initial like "Sam R.". */
export const sentence = (s: string) => { const t = s.trimEnd(); return t.endsWith('.') ? t : `${t}.`; };

/** Agent hours as a card or a chart says them. */
export function hoursWords(h: number): string {
  if (!(h > 0)) return '0';
  if (h >= 10) return Math.round(h).toLocaleString('en-US');
  if (h >= 0.05) return (Math.round(h * 10) / 10).toString();
  return 'under 0.1';
}

/** Minutes until local midnight, for "Until tomorrow". */
export function minutesToMidnight(now: number): number {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return Math.max(1, Math.round((d.getTime() - now) / MIN));
}

export function sentWords(invite: { at: number; joined: boolean }, now: number): string {
  if (invite.joined) return 'Joined';
  const day = new Date(now); day.setHours(0, 0, 0, 0);
  if (invite.at >= day.getTime()) return 'Sent today';
  if (invite.at >= day.getTime() - 86_400_000) return 'Sent yesterday';
  return `Sent ${new Date(invite.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

export function findOrder<T extends { members: number; createdAt: number }>(rooms: readonly T[], order: 'popular' | 'new'): T[] {
  return [...rooms].sort(order === 'new'
    ? (a, b) => b.createdAt - a.createdAt
    : (a, b) => b.members - a.members || a.createdAt - b.createdAt);
}

/** My card leaves the wall while I am invisible, so I leave the tab's count too. */
export const tabCount = (room: { members: number }, invisible: boolean) => Math.max(0, room.members - (invisible ? 1 : 0));

/** My card leaves the wall while I am invisible; the chat still needs my name and face. */
export function withMe<T extends { me: boolean }>(people: readonly T[], me: T | null): T[] {
  return !me || people.some((p) => p.me) ? [...people] : [...people, me];
}
