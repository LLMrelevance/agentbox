import type { WorkItem } from './types';

type Dated = Pick<WorkItem, 'id' | 'createdAt' | 'wrote'>;

/** When a thread last had something new for you: its latest answer, or when it was made. */
export const arrivedAt = (i: Dated): number => i.wrote?.result?.ts ?? i.createdAt ?? 0;

/**
 * Unread while its latest answer is newer than when you last opened it.
 * `since` stands in for threads with no opened time, so the first launch
 * does not dot everything you already had; Mark Unread stores 0.
 */
export const isUnread = (i: Dated, seenAt: Readonly<Record<string, number>>, since: number): boolean =>
  arrivedAt(i) > (seenAt[i.id] ?? since);
