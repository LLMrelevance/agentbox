// YOUR THREADS AS ONE LIST (w-b5f23cff71): In progress, then Later, then what
// you finished today, each under a header you can fold. The rows arrive already
// filtered and sorted the way each tab sorts them; this only stacks them.
import type { WorkItem } from '../types';
import { finishedAt } from './page-rules';

export type StackKey = 'progress' | 'later' | 'done';
export type StackTab = 'progress' | 'snoozed' | 'done';

export interface StackSection { key: StackKey; label: string; count: number; tab: StackTab; folded: boolean }

export interface Stack {
  sections: StackSection[];
  /** The rows of the open sections, in the order they are drawn and walked. */
  rows: WorkItem[];
  sectionOf: (item: WorkItem) => StackKey;
  /** The tab a row's keys and time column belong to. */
  tabOf: (item: WorkItem) => StackTab;
}

const PARTS: { key: StackKey; label: string; tab: StackTab }[] = [
  { key: 'progress', label: 'In progress', tab: 'progress' },
  { key: 'later', label: 'Later', tab: 'snoozed' },
  { key: 'done', label: 'Done today', tab: 'done' },
];

export function stackRows({ progress, later, done, dayStart, folded, laterRules = 0 }: {
  progress: WorkItem[]; later: WorkItem[]; done: WorkItem[]; dayStart: number; folded: ReadonlySet<string>;
  /** Repeating tasks drawn at the head of Later: a Later with only those still has a header. */
  laterRules?: number;
}): Stack {
  const bySection: Record<StackKey, WorkItem[]> = { progress, later, done: done.filter((i) => finishedAt(i) >= dayStart) };
  const where = new Map<string, StackKey>();
  const sections: StackSection[] = [];
  const rows: WorkItem[] = [];
  for (const part of PARTS) {
    // A thread in two of the lists is in the first, as the tabs settle it (App `tabState`).
    const items = bySection[part.key].filter((i) => !where.has(i.id));
    if (!items.length && !(part.key === 'later' && laterRules > 0)) continue;
    const shut = folded.has(part.key);
    sections.push({ ...part, count: items.length, folded: shut });
    for (const i of items) where.set(i.id, part.key);
    if (!shut) rows.push(...items);
  }
  const sectionOf = (item: WorkItem) => where.get(item.id) ?? 'progress';
  const tabOf = (item: WorkItem) => PARTS.find((p) => p.key === sectionOf(item))!.tab;
  return { sections, rows, sectionOf, tabOf };
}

const FOLDED_KEY = 'agentbox.yourThreads.folded';
type Store = Pick<Storage, 'getItem' | 'setItem'> | null;
const local = (): Store => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function readFolded(store: Store = local()): Set<StackKey> {
  try {
    const v = JSON.parse(store?.getItem(FOLDED_KEY) ?? '[]');
    return new Set((Array.isArray(v) ? v : []).filter((k): k is StackKey => PARTS.some((p) => p.key === k)));
  } catch { return new Set(); }
}

export function toggleFolded(key: StackKey, store: Store = local()): Set<StackKey> {
  const next = readFolded(store);
  if (next.has(key)) next.delete(key); else next.add(key);
  try { store?.setItem(FOLDED_KEY, JSON.stringify([...next])); } catch { /* kept for this window only */ }
  return next;
}
