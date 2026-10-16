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

/** How much of its session one login has spent; when it is all spent, when it comes back. Null with no reading. */
export function sessionUse(limits: UsageLimit[] | undefined | null): string | null {
  const session = (limits ?? []).find((l) => l.span === 'session');
  if (!session || !Number.isFinite(session.percent)) return null;
  const said = `${session.percent}% of this session used`;
  if (session.percent < 100) return said;
  const when = session.resetsText ?? (session.resetsAt ? hourWords(session.resetsAt) : null);
  return when ? `${said}, back at ${when}` : said;
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

/** Whether cloud runs happen at all, and when. */
export function cloudModeWords(cloud: Pick<CloudStatus, 'mode'>): string {
  if (cloud.mode === 'mac') return 'Off. Agents run on this computer only.';
  if (cloud.mode === 'all') return 'On for everything. Cloud runs use these accounts, not this computer’s.';
  return 'On when this computer is full. Cloud runs use these accounts, not this computer’s.';
}
