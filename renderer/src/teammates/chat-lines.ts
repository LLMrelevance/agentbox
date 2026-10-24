// What the team chat draws, from the snapshot: messages, passes and the lines
// runs leave, in time order, seen whole or through one teammate.
import type { RunningSession, Teammate, TeamChatLine, TeamRunLine, TeammatesView, WorkItem } from '../types';
import { spanLabel } from '../notes';
import { nextRunAt } from '../../../shared/repeats.mjs';
import { teammateIdOf } from '../../../shared/teammates.mjs';

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

// A teammate that asked you something in the chat, with answers to tap, and
// has not heard from you since. A new teammate's setup questions are asked
// this way, and nothing else would say it is waiting.
export function asksYou(view: TeammatesView | null | undefined, id: string): boolean {
  if (!view) return false;
  let asked = 0;
  for (const m of view.chat) if (m.kind === 'msg' && m.from === id && m.options?.length) asked = Math.max(asked, m.ts);
  if (!asked) return false;
  // Answered in the chat, or in one of its threads.
  if (view.runs.some((r) => r.teammate === id && r.verb === 'answered' && r.ts > asked)) return false;
  return !view.chat.some((m) => m.kind === 'msg' && m.from === 'you' && m.ts > asked && toList(m.to).includes(id));
}

// What you said back to a teammate's question: your next words to it, or null
// while it is still waiting on you.
export function answerTo(view: TeammatesView | null | undefined, q: TeamChatLine): string | null {
  if (!view || q.kind !== 'msg' || !q.options?.length) return null;
  const next = view.chat.find((m) => m.kind === 'msg' && m.from === 'you' && m.ts > q.ts && toList(m.to).includes(q.from));
  return next ? String(next.text ?? '') : null;
}

// A teammate's run waiting its turn behind the one it is on. It is the
// teammate's queue, shown on its page, and not something you put off: the
// second power test found these in its Later list, "not started".
export function queuedTeammateRun(i: Pick<WorkItem, 'labels' | 'start'>): boolean {
  return i.start === 'later' && !!teammateIdOf(i);
}

// Work held for a teammate after too many hand-offs between teammates, which
// waits for your go-ahead: the last such stop with no word from you since.
export function heldFor(view: TeammatesView | null | undefined, id: string): TeamChatLine | null {
  if (!view) return null;
  const stops = view.chat.filter((m) => m.kind === 'act' && m.verb === 'hops' && m.from === id);
  const last = stops.at(-1);
  if (!last) return null;
  return view.chat.some((m) => (m.kind === 'msg' || m.kind === 'pass') && m.from === 'you' && m.ts > last.ts && toList(m.to).includes(id)) ? null : last;
}

// What the held work was called, from the message or pass that was held.
export function heldTitle(view: TeammatesView | null | undefined, stop: TeamChatLine): string {
  const held = view?.chat.find((m) => m.id === stop.ref);
  return String(held?.title ?? held?.text ?? 'the work').replace(/\s+/g, ' ').trim().slice(0, 120);
}

// What a teammate's current run is doing, for the live line under its chat:
// the step it is on and for how long, or that no agent has it yet.
export function workingLine(
  t: Pick<Teammate, 'name' | 'running' | 'now'>,
  session: Pick<RunningSession, 'startedAt' | 'activity'> | null | undefined,
  now = Date.now(),
): { state: 'working' | 'waiting'; lead: string; step: string } | null {
  if (!t.running) return null;
  const run = t.now && t.now !== 'Waiting on you' && t.now !== 'Paused' ? t.now : 'its next run';
  if (!session) return { state: 'waiting', lead: `${t.name} is waiting for a free agent to start`, step: run };
  const elapsed = Math.max(0, now - session.startedAt);
  const step = session.activity?.at(-1)?.label?.trim() || run;
  return { state: 'working', lead: elapsed < 60_000 ? `${t.name} just started` : `${t.name} is working, ${spanLabel(elapsed)} in`, step };
}

export function longMessage(text: string): boolean {
  return text.length > 900 || text.split('\n').length > 12;
}

// Not "Free", which reads as the plan you are on.
export function idleLine(t: Pick<Teammate, 'works'>, now = Date.now()): string {
  const at = t.works ? nextRunAt(t.works, now) : null;
  if (!at) return 'Idle';
  const when = new Date(at);
  const clock = when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(/\s/g, '');
  const sameDay = new Date(now).toDateString() === when.toDateString();
  return `Idle until ${sameDay ? '' : `${when.toLocaleDateString('en-US', { weekday: 'short' })} `}${clock}`;
}
