import type { WorkItem } from './types';

type Dated = Pick<WorkItem, 'id' | 'createdAt' | 'wrote'>;

/** When a thread last had something new for you: its latest answer, or when it was made. */
const arrivedAt = (i: Dated): number => i.wrote?.result?.ts ?? i.createdAt ?? 0;

/** Something arrived in Needs You after you last had it open. */
export const needsYouLit = (inbox: readonly Dated[], lookedAt: number): boolean =>
  inbox.some((i) => arrivedAt(i) > lookedAt);
