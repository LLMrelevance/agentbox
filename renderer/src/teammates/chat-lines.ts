// What the team chat draws, from the snapshot: messages, passes and the lines
// runs leave, in time order, seen whole or through one teammate.
import type { Teammate, TeamChatLine, TeamRunLine, TeammatesView } from '../types';

export type ChatEntry = TeamChatLine | TeamRunLine;

const toList = (to: TeamChatLine['to']): string[] => (Array.isArray(to) ? to : to ? [to] : []);

// One teammate's page is the team chat seen through them: what they said and
// did, and what was said to them.
export function involves(entry: ChatEntry, id: string): boolean {
  if (entry.kind === 'run') return entry.teammate === id;
  if (entry.from === id) return true;
  return toList(entry.to).includes(id);
}

export function chatEntries(view: TeammatesView | null | undefined, only: string | null = null): ChatEntry[] {
  if (!view) return [];
  const all: ChatEntry[] = [...view.chat, ...view.runs];
  // What you wrote in the chat reaches a waiting run as its answer; the chat
  // already shows it, so only answers typed in the thread itself get a line.
  const saidInChat = new Set(view.chat.filter((m) => m.kind === 'msg' && m.from === 'you').map((m) => String(m.text ?? '').trim()));
  // The team chat says a run finished and leaves out that it was picked up;
  // a teammate's own page keeps both.
  const finished = new Set(view.runs.filter((r) => r.verb === 'finished').map((r) => r.item));
  const shown = all.filter((e) => {
    if (!only && e.kind === 'run' && e.verb === 'picked' && finished.has(e.item)) return false;
    // A run's own start line repeats the pass that made it, so the pass speaks for it.
    if (e.kind === 'run' && e.verb === 'passed') return false;
    if (e.kind === 'run' && e.verb === 'answered' && saidInChat.has(String(e.text ?? '').trim())) return false;
    if (e.kind === 'msg' && (e as TeamChatLine & { start?: boolean }).start) return false;
    return only ? involves(e, only) : true;
  });
  return shown.sort((a, b) => a.ts - b.ts);
}

export function nameOf(id: string | undefined, team: Teammate[]): string {
  if (!id || id === 'you') return 'You';
  return team.find((t) => t.id === id)?.name ?? 'A teammate';
}

export function waitingCount(team: Teammate[]): number {
  return team.reduce((n, t) => n + t.waiting.length, 0);
}

// The day header a run of lines sits under.
export function dayOf(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const today = new Date(now);
  const yesterday = new Date(now - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function clockOf(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(/\s/g, '');
}
