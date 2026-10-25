// ONE THING AT A TIME (w-65bcefb857): Needs you as a queue, one thread per page.
// The page itself is the thread page in a mode (Focus.tsx `queue`, ItemThread.tsx
// `queue`); these are the rules it and App.tsx share, kept here so a test can
// reach them.
import type { AgentEvent, AgentTurn } from './types';
import type { ItemOutcome } from './item-thread';

export interface Spot { pos: number; total: number; index: number }

type Keyed = { product: string; id: string };

const same = (a: Keyed, b: Keyed) => a.product === b.product && a.id === b.id;

/** Where a thread sits in the queue, counted from one. */
export function spotIn<T extends Keyed>(rows: T[], item: Keyed | null): Spot | null {
  if (!item) return null;
  const index = rows.findIndex((r) => same(r, item));
  return index < 0 ? null : { pos: index + 1, total: rows.length, index };
}

/** The thread above or below, stopping at either end. */
export function stepIn<T extends Keyed>(rows: T[], item: Keyed, dir: 1 | -1): T | null {
  const index = rows.findIndex((r) => same(r, item));
  if (index < 0) return null;
  return rows[index + dir] ?? null;
}

/**
 * In the queue every answer moves on, the last one included, so answering the
 * last thread lands on the empty inbox. Outside it the rule is ./advance's,
 * which keeps you on the last thread.
 */
export function queueMovesOn(p: { index: number; searching?: boolean }): boolean {
  return !p.searching && p.index >= 0;
}

/** Space and the button start it on Needs you, with something waiting. */
export function queueStartsHere(p: { view: string; searching: boolean; waiting: number }): boolean {
  return p.view === 'inbox' && !p.searching && p.waiting > 0;
}

const said = (e: AgentEvent): e is AgentTurn & { kind?: undefined } => e.kind !== 'work';

/** The newest answer: the one lifted to the foot, or else the last thing said that was not yours. */
export function newestAnswer(events: AgentEvent[], outcome: ItemOutcome | null): { at: number; text: string } | null {
  if (outcome) return { at: outcome.at, text: outcome.text };
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (said(e) && e.who !== 'you' && e.text?.trim()) return { at: e.at, text: e.text };
  }
  return null;
}

/** The newest thing you said; on a shared thread a teammate's words are theirs, not yours. */
export function yourLast(events: AgentEvent[], me: string | null, opening?: { at: number; text: string } | null): { at: number; text: string } | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (said(e) && e.who === 'you' && (!e.by || e.by === me) && e.text?.trim()) return { at: e.at, text: e.text };
  }
  return opening ? { at: opening.at, text: opening.text } : null;
}

/** Whether your message is the thread's title, or the title was cut from it, so the bar already says it. */
export function repeatsTitle(text: string, title: string): boolean {
  const plain = (s: string) => s.replace(/\s+/g, ' ').replace(/(…|\.\.\.)$/, '').trim().toLowerCase();
  const said = plain(text);
  const named = plain(title);
  return !!named && (said === named || (named.length >= 24 && said.startsWith(named)));
}

/** How many messages sit behind "Show N earlier messages": all but the newest answer. */
export function earlierCount(events: AgentEvent[], outcome: ItemOutcome | null, opening?: { at: number; text: string } | null): number {
  const messages = events.filter(said).length + (opening ? 1 : 0);
  return outcome ? messages : Math.max(0, messages - (newestAnswer(events, null) ? 1 : 0));
}

/** An answer opening with a line that is bold and nothing else wears it as its headline. */
export function splitHeadline(text: string): { headline: string | null; rest: string } {
  const m = /^\s*\*\*([^*\n]+)\*\*[ \t]*(?:\n|$)/.exec(text);
  if (!m) return { headline: null, rest: text };
  return { headline: m[1].trim(), rest: text.slice(m[0].length).replace(/^\s+/, '') };
}
