import type { WorkItem } from './types';
import { arrivedAt } from './unread';

/** Something arrived in Needs You after you last had it open. */
export const needsYouLit = (inbox: readonly Pick<WorkItem, 'id' | 'createdAt' | 'wrote'>[], lookedAt: number): boolean =>
  inbox.some((i) => arrivedAt(i) > lookedAt);
