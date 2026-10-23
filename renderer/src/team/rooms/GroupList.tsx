// Every group you are in, each chat its own (w-dcaa2c122e): a named group, a
// chat with one person, and a chat with that person and someone else are
// three entries. Drawn as the full list and as the row of chips over a group.
import type { ReactNode } from 'react';
import type { Conversation } from './MessagesPage';
import { RoomFace } from './RoomFace';
import { clockOf } from './room-rules';

export type GroupChoice = {
  id: string;
  /** A named group's name, or the people in a chat by first name: "Maya, Priya". */
  name: string;
  /** Everyone but you, for a chat with people; empty for a named group. */
  faces: { name: string; url: string | null }[];
  last: string; at: number; unread: boolean;
  /** Your team's group, which leads the row. */
  pinned: boolean;
};

const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** "Maya Chen: Yes" says "Maya: Yes", and in a chat with only Maya just "Yes". "You:" stays. */
export function lastWords(last: string, onlyOne: boolean): string {
  const at = last.indexOf(': ');
  if (at < 0) return last;
  const who = last.slice(0, at);
  const said = last.slice(at + 2);
  if (who === 'You') return last;
  return onlyOne ? said : `${first(who)}: ${said}`;
}

export function groupChoices(list: readonly Conversation[], pinned: ReadonlySet<string> = new Set()): GroupChoice[] {
  return [...list].sort((a, b) => b.at - a.at).map((c) => ({
    id: c.id, faces: c.faces, at: c.at, unread: c.unread, pinned: pinned.has(c.id),
    last: lastWords(c.last, c.faces.length === 1),
    name: c.faces.length ? c.faces.map((f) => first(f.name)).join(', ') : c.name,
  }));
}

/** "Today in Northwind", or "Today with Maya and Priya" in a chat with people. */
export function todayWords(g: Pick<GroupChoice, 'name' | 'faces'> | undefined, fallback: string): string {
  if (!g || !g.faces.length) return `Today in ${g?.name ?? fallback}`;
  const names = g.faces.map((f) => first(f.name));
  return `Today with ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]}`;
}

/**
 * Which chips fit over the chat: named groups in a steady order, then the
 * newest chats with people, the open one always among them. The rest wait
 * behind More, so a new message never shuffles the row under your pointer.
 */
export function chipsShown(all: readonly GroupChoice[], current: string, max = 6): { shown: GroupChoice[]; hidden: number } {
  const named = all.filter((g) => !g.faces.length).sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name));
  const people = all.filter((g) => g.faces.length);
  const shown = [...named, ...people].slice(0, max);
  if (!shown.some((g) => g.id === current)) {
    const here = all.find((g) => g.id === current);
    if (here) shown.splice(shown.length - 1, 1, here);
  }
  return { shown, hidden: all.length - shown.length };
}

/** A named group wears its initial; a chat wears the faces in it, side by side when small. */
export function GroupMark({ g, size = 20, row = false }: { g: GroupChoice; size?: number; row?: boolean }) {
  if (!g.faces.length) return <span className="g7-ini" style={{ width: size, height: size, lineHeight: `${size}px` }} aria-hidden="true">{g.name.slice(0, 1).toUpperCase()}</span>;
  if (g.faces.length === 1) return <RoomFace name={g.faces[0].name} url={g.faces[0].url} size={size} />;
  if (row) return <span className="g7-row-faces">{g.faces.slice(0, 3).map((f, i) => <RoomFace key={i} name={f.name} url={f.url} size={size} />)}</span>;
  const small = Math.round(size * 0.72);
  return <span className="g7-two" style={{ width: size, height: size }}>
    {g.faces.slice(0, 2).map((f, i) => <RoomFace key={i} name={f.name} url={f.url} size={small} />)}
  </span>;
}

/** Every group and chat, newest first, with the last thing said in each. */
export function GroupMenuList({ groups, current, onPick, head }: { groups: GroupChoice[]; current: string | null; onPick: (id: string) => void; head?: ReactNode }) {
  return <div className="g7-list">
    {head}
    {groups.map((g) => <button type="button" key={g.id} className={`g7-row${g.id === current ? ' on' : ''}`} onClick={() => onPick(g.id)}>
      <GroupMark g={g} size={32} />
      <span className="g7-w"><span className="g7-nm rm-one">{g.name}</span><span className="g7-last rm-one">{g.last}</span></span>
      <span className="g7-m"><em>{g.at ? clockOf(g.at) : ''}</em>{g.unread && g.id !== current && <span className="rm-unread" />}</span>
    </button>)}
  </div>;
}
