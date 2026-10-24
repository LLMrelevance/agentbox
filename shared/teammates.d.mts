export const YOU: 'you';
export const TEAMMATE_LABEL_PREFIX: 'teammate:';
export function teammateIdOf(item: { labels?: string[] } | null | undefined): string | null;
export function passedFromOf(item: { labels?: string[] } | null | undefined): string | null;
export function mentionsIn(text: string, teammates: { id: string; name: string }[]): string[];
export interface Starter {
  starter: string; name: string; role: string; outcome: string; sends: string; job: string; goal: string;
  counted: string; asksFirst: string; works: { every: 'day' | 'weekday' | 'week'; at: string; on?: number } | null;
}
export const STARTERS: Starter[];
export const OFFER_LABEL: 'teammate-offer';
export const OFFER_MAKE: string;
export const OFFER_NOT_NOW: string;
export const MAX_HOPS: number;
