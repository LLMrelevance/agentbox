// THE DESKTOP'S FOUR TABS, FROM THE COPIES A MAC SENDS ONLINE.
//
// App.tsx builds these lists inline, among teammates, agent sessions, imports
// and the rows the app makes itself, none of which the online inbox carries.
// So this composes the same exported rules for what it does carry, and orders
// rows the way the desktop draws them (`sorted`). Lifting App.tsx's lists into
// one module both read is the follow-up that retires this file.

import {
  belongsInInbox, belongsInProgress, hiddenUntil, isProposal, notStarted, rowTitle, stillAsksYou, waitsInLater, waitsThatCanEnd,
} from '../../../renderer/src/list-rules';
import { DEFAULT_DISPLAY, sorted, updatedWords } from '../../../renderer/src/threads/page-rules';
import type { phoneView } from '../../../renderer/src/phone-rows';

export type TabId = 'inbox' | 'progress' | 'snoozed' | 'done';
export const TABS: { id: TabId; label: string }[] = [
  { id: 'inbox', label: 'Needs you' },
  { id: 'progress', label: 'In progress' },
  { id: 'snoozed', label: 'Later' },
  { id: 'done', label: 'Done' },
];

type View = Pick<ReturnType<typeof phoneView>, 'items' | 'running' | 'products'>;
export interface Row {
  key: string;
  id: string;
  product: string;
  title: string;
  projectName: string;
  when: string;
  running: boolean;
  /** Running in the cloud rather than on a Mac, which the row marks differently. */
  cloud: boolean;
  item: any;
}

// The desktop stamps the moment it first knew to deliver an agent's answers
// (App.tsx `deliveredThrough`), years before any phone. Zero is that, for
// every desktop the phone could be reading.
const DELIVERED_THROUGH = 0;

export function phoneTabs(view: View, now = Date.now()): Record<TabId, Row[]> {
  const items: any[] = view.items;
  const live = new Set(view.running.map((r: { itemId: string }) => r.itemId));
  const inCloud = new Set(view.running.filter((r: { where?: string }) => r.where === 'cloud').map((r: { itemId: string }) => r.itemId));
  const byId = new Map(items.map((i) => [i.id, i]));
  const waitingOn = (i: any) => waitsThatCanEnd(i, byId);
  const hiddenAt = (i: any) => hiddenUntil(i);

  const inbox = items.filter((i) => {
    if (live.has(i.id) && !stillAsksYou(i)) return false;
    return belongsInInbox(i, { deliveredThrough: DELIVERED_THROUGH, hiddenUntil: hiddenAt(i), now, waitingOn: waitingOn(i) });
  });
  const needsYou = new Set(inbox.map((i) => i.id));
  const progress = items.filter((i) => {
    if (hiddenAt(i) > now && !live.has(i.id)) return false;
    return belongsInProgress(i, { deferredUntil: i.runAt ?? 0, now, live: live.has(i.id) });
  });
  const snoozed = items.filter((i) => (notStarted(i) || isProposal(i) || hiddenAt(i) > now || (waitsInLater(i, waitingOn(i)) && !live.has(i.id)))
    && (i.status !== 'done' || i.wrote?.status?.source !== 'founder'));
  const done = items.filter((i) => !needsYou.has(i.id) && !live.has(i.id) && i.status === 'done');

  const names = new Map(view.products.map((p: { slug: string; name: string }) => [p.slug, p.name]));
  const order = view.products.map((p: { slug: string }) => p.slug);
  const row = (i: any): Row => ({
    key: `${i.product}/${i.id}`, id: i.id, product: i.product, title: rowTitle(i), projectName: names.get(i.product) ?? '',
    when: updatedWords(i.status === 'done' ? i.wrote?.status?.ts ?? i.updatedAt : i.updatedAt, now), running: live.has(i.id), cloud: inCloud.has(i.id), item: i,
  });
  const drawn = (list: any[], tab: TabId) => sorted(list, DEFAULT_DISPLAY.inbox, tab, order).map(row);
  return { inbox: drawn(inbox, 'inbox'), progress: drawn(progress, 'progress'), snoozed: drawn(snoozed, 'snoozed'), done: drawn(done, 'done') };
}
