// WHAT AN ACCOUNT ROW SAYS ABOUT ITS OWN ROOM, on this computer and in the cloud.
import type { CloudAccount, CloudStatus } from './cloud-menu';
import type { UsageLimit } from './types';

/** "5:10pm", "8pm": the clock as the usage rows already print it. */
export function hourWords(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}

export interface Meter { key: 'session' | 'week'; word: string; percent: number; back: string | null }

/** The two numbers every account shows: this session and this week (all models). A full one says when it is back. */
export function meterPair(limits: UsageLimit[] | undefined | null): Meter[] {
  const all = limits ?? [];
  const session = all.find((l) => l.span === 'session');
  const week = all.find((l) => l.span === 'week' && (!l.qualifier || /all/i.test(l.qualifier))) ?? all.find((l) => l.span === 'week');
  const back = (l: UsageLimit) => (l.percent >= 100 ? l.resetsText ?? (l.resetsAt ? hourWords(l.resetsAt) : null) : null);
  return [
    ...(session && Number.isFinite(session.percent) ? [{ key: 'session' as const, word: 'Session', percent: Math.round(session.percent), back: back(session) }] : []),
    ...(week && Number.isFinite(week.percent) ? [{ key: 'week' as const, word: 'Week', percent: Math.round(week.percent), back: back(week) }] : []),
  ];
}

/** One cloud login's state, in the words the Settings row prints. */
export function cloudAccountState(a: CloudAccount, now = Date.now()): string {
  const state = a.state as string | undefined;
  if (state === 'limited' || (a.limitedUntil && a.limitedUntil > now)) {
    return a.limitedUntil ? `At its limit, back at ${hourWords(a.limitedUntil)}` : 'At its limit';
  }
  if (state === 'broken') return 'Stopped working. Sign in again from the cloud menu.';
  if (state === 'renew') return 'Renewing its sign-in';
  return 'Ready';
}

/** The cloud card's first line: when threads go there, and which logins they use. */
export function cloudPlaceLine(cloud: Pick<CloudStatus, 'mode'>, accounts: number): string {
  if (cloud.mode === 'mac') return 'Off, so every thread runs on this computer. Press C to turn it on.';
  const when = cloud.mode === 'all' ? 'Threads start here first' : 'Threads start here when this computer is full';
  return `${when}, on ${accounts > 1 ? 'these accounts in turn' : 'this account'}.`;
}
