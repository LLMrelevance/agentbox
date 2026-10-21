// PURE. The rules a room's chat draws by (./RoomChat.tsx): where the New line
// goes, which messages are drawn, how an @name is marked, and the name a file
// is stored under.
import type { RoomMessage } from '../../types';
import { markMentions } from './room-rules';

/**
 * The first message to sit under the New line: the oldest one in the chat
 * (not in a thread) written by someone else after where you had read to.
 * Null when there is nothing new.
 */
export function newLineAt(messages: readonly RoomMessage[], readAt: number | null | undefined, me: string | null): string | null {
  if (readAt == null) return null;
  const first = messages.find((m) => !m.inReplyTo && !m.deleted && m.at > readAt && m.by !== me);
  return first?.id ?? null;
}

/** A deleted message is drawn only while replies hang off it, as a line saying so. */
export function drawnRoots(messages: readonly RoomMessage[]): RoomMessage[] {
  const answered = new Set(messages.map((m) => m.inReplyTo).filter(Boolean));
  return messages.filter((m) => !m.inReplyTo && (!m.deleted || answered.has(m.id)));
}

/** The message as markdown, each @name made a mention link so it can be drawn as one. */
export function mentionMarkdown(body: string, names: readonly string[]): string {
  return markMentions(body, names).map((part) => (part.mention ? `[${part.text}](#mention)` : part.text)).join('');
}

/** The name a file sent in a room is stored under: unique, and still ending in its own name. */
export function storedName(name: string, now = Date.now(), rand = Math.random().toString(36).slice(2, 8)): string {
  const safe = String(name || 'file').replace(/[^\w.-]+/g, '-').replace(/^[^A-Za-z0-9]+/, '').slice(0, 80) || 'file';
  return `${now.toString(36)}-${rand}-${safe}`;
}

/**
 * Whether the open room holds off reading itself. Marking it unread, from a
 * message or from the list, holds it until you leave; marking it read again
 * lets go. Opening a room already marked unread does not hold: opening it is
 * reading it.
 */
export function holdsRead(held: boolean, wasMarked: boolean, isMarked: boolean): boolean {
  if (isMarked && !wasMarked) return true;
  if (!isMarked && wasMarked) return false;
  return held;
}

/** The newest message of mine in the chat itself, for ↑ in an empty box. */
export function myNewest(messages: readonly RoomMessage[], me: string | null, inReplyTo: string | null = null): RoomMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m.by === me && !m.deleted && (m.inReplyTo ?? null) === inReplyTo) return m;
  }
  return null;
}
