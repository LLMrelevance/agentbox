// THE CLOUD MENU'S WORDS AND NUMBERS (tests/the-cloud-button-chooses-where-threads-run).
// The button and the menu are drawn in threads/Pages.tsx, beside the filters
// button and built like its menu; what they say lives here.
import type { UsageLimit } from './types';

export type CloudMode = 'mac' | 'full' | 'all';

export interface CloudMonth {
  runs: number;
  agentHours: number;
  estimatedCost: number;
  costPerAgentHour: number | null;
}

// A sign-in going on in the cloud (main/cloud/logins.mjs). Claude: its page
// opens, she copies the code it shows. Codex: OpenAI's page opens, she types
// the code shown here, and it finishes by itself.
export interface CloudSignIn {
  engine: 'claude' | 'codex';
  // The cloud account it adds, or signs in again.
  key: string;
  state: 'starting' | 'needs-code' | 'waiting' | 'checking' | 'saved' | 'failed';
  url: string | null;
  code: string | null;
  message: string | null;
  // One sign-in, told from the next, which may show the same link.
  attempt?: string;
}

// AN ACCOUNT SHE ADDED FOR THE CLOUD. Not this Mac's account: any she likes
// (2026-10-14: "we shouldn't predefine which accounts to sign up with").
export interface CloudAccount {
  engine: 'claude' | 'codex';
  key: string;
  // Its email, when the vendor said it.
  name: string | null;
  ready: boolean;
  // 'broken' (stopped working), 'renew' / 'stale' (a Codex login being
  // renewed), 'limited' (at its usage limit until it resets), 'ready'.
  state?: 'broken' | 'renew' | 'stale' | 'limited' | 'ready';
  savedAt?: number | null;
  limitedUntil?: number | null;
  /** Its session and week, read off a reply's own headers in the cloud. */
  limits?: UsageLimit[] | null;
}

export interface CloudStatus {
  setUp: boolean;
  mode: CloudMode;
  /** What "on" means, kept while the cloud is off. */
  whenOn?: Exclude<CloudMode, 'mac'>;
  running: number;
  month: CloudMonth;
  accounts?: CloudAccount[];
  signIns?: CloudSignIn[];
}

export const engineWord = (a: { engine: 'claude' | 'codex' }) => (a.engine === 'codex' ? 'Codex' : 'Claude');

const GOING = new Set(['starting', 'needs-code', 'waiting', 'checking']);
export const signingIn = (s: CloudSignIn | null | undefined) => !!s && GOING.has(s.state);

// The page a sign-in opens, and what tells this opening from the last: two
// Codex sign-ins show the same link, and each must open it.
export function pageToOpen(s: CloudSignIn | null): { key: string; url: string } | null {
  return s && s.url ? { key: `${s.engine}:${s.key}:${s.attempt ?? ''}:${s.url}`, url: s.url } : null;
}

// What an account is called: its email, or, when the vendor would not say,
// "Claude account 2", counted among that engine's accounts.
export function accountLabel(a: CloudAccount, all: CloudAccount[]): string {
  if (a.name) return a.name;
  const same = all.filter((x) => x.engine === a.engine);
  const n = same.indexOf(a) + 1;
  return `${engineWord(a)} account${same.length > 1 ? ` ${n}` : ''}`;
}

export const CLOUD_MODES: { id: CloudMode; label: string; note: string }[] = [
  { id: 'mac', label: 'This Mac only', note: 'Threads that don’t fit wait for a free agent.' },
  { id: 'full', label: 'When this Mac is full', note: 'Threads that don’t fit here start in the cloud.' },
  { id: 'all', label: 'Everything', note: 'Threads start in the cloud first, wherever they can.' },
];

// THE CLOUD IS ON OR OFF (2026-10-16, her pick of five drawings). C flips it;
// what "on" means, when this Mac is full or everything, is kept as a
// preference in the menu and survives the cloud being off.
export const CLOUD_KEY = '⌘C';

/**
 * ⌘C (Ctrl+C) TURNS THE CLOUD ON OR OFF (2026-10-17: a plain C was hit by
 * accident). It is Copy first: never with text selected, in a field, or over a
 * dialog.
 */
export function cloudChord(
  e: { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean },
  { inInput, selection, modal }: { inInput: boolean; selection: string; modal: boolean },
): boolean {
  if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'c') return false;
  return !inInput && !modal && !selection.trim();
}

export const CLOUD_WHEN_ON: { id: Exclude<CloudMode, 'mac'>; label: string; note: string }[] = [
  { id: 'full', label: 'When this Mac is full', note: 'Threads that don’t fit here start in the cloud.' },
  { id: 'all', label: 'Everything', note: 'Threads start in the cloud first, wherever they can.' },
];

type OnOff = { mode: CloudMode; whenOn?: Exclude<CloudMode, 'mac'> } | null | undefined;

export const cloudIsOn = (status: OnOff) => !!status && status.mode !== 'mac';

/**
 * THE MENU'S LAST LINE: what runs in the cloud, or, while the cloud is on and
 * every Claude account there is at its usage limit, that and when the first
 * comes back (2026-10-16: "our cloud must be broken", when it was out of usage).
 */
export function cloudFootLine(cloud: CloudStatus, now = Date.now()): string {
  const claude = (cloud.accounts || []).filter((a) => a.engine === 'claude');
  const back = claude.map((a) => (a.limitedUntil && a.limitedUntil > now ? a.limitedUntil : null));
  if (cloudIsOn(cloud) && claude.length && back.every(Boolean)) {
    const at = new Date(Math.min(...(back as number[]))).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase();
    return `Your cloud accounts are at their usage limit until ${at}. Threads run on this Mac until then.`;
  }
  return cloud.running ? `${cloud.running} running in the cloud now` : 'Nothing running in the cloud now';
}

/** Where C takes it: off from either kind of on, back on to what "on" means. */
export function cloudToggleTarget(status: OnOff): CloudMode {
  if (cloudIsOn(status)) return 'mac';
  return status?.whenOn === 'all' ? 'all' : 'full';
}

/** The note after C, naming where new threads go now. */
export function cloudToggleNote(mode: CloudMode): string {
  if (mode === 'mac') return 'Cloud off: new threads run on this Mac';
  if (mode === 'all') return 'Cloud on: everything starts in the cloud';
  return 'Cloud on: threads that don’t fit here start in the cloud';
}

/** ⌘K's rows: on or off with its key first, then each meaning of on. */
export function cloudCommands(status: OnOff): { mode: CloudMode; label: string; keyHint?: string; hint?: string }[] {
  const on = cloudIsOn(status);
  return [
    { mode: cloudToggleTarget(status), label: on ? 'Turn the cloud off' : 'Turn the cloud on', keyHint: CLOUD_KEY },
    ...CLOUD_WHEN_ON.map((c) => ({
      mode: c.id,
      label: `Cloud on: ${c.label[0].toLowerCase()}${c.label.slice(1)}`,
      ...(on && status?.mode === c.id ? { hint: 'On now' } : {}),
    })),
  ];
}

// `cloudRuns` in the config, read the way the supervisor reads it: false is
// off, 'all' is everything, anything else is "when this Mac is full".
export function cloudModeOf(cloudRuns: unknown): CloudMode {
  if (cloudRuns === false) return 'mac';
  if (cloudRuns === 'all') return 'all';
  return 'full';
}

export function cloudButtonCount(status: { running: number } | null | undefined): number | null {
  return status && status.running > 0 ? status.running : null;
}

const hours = (n: number) => String(Math.round(n * 10) / 10);

// USE, NEVER A PRICE (2026-10-16): each person is on their own plan and pays
// nothing like the estimate, so the hours are said and the cost is not.
export function cloudMonthLine(month: CloudMonth): string {
  if (!month.runs) return 'Nothing in the cloud yet this month';
  return `${hours(month.agentHours)} agent-hours`;
}

/**
 * WHERE ONE THREAD RUNS, for its menu's row (threads/ThreadMenu.tsx): in the
 * cloud now, kept on this Mac, or here and free to go to the cloud. Null where
 * the cloud could never run it: no cloud set up, the cloud off and the thread
 * not kept, or a project with no code folder of its own.
 */
export function threadPlace(
  item: { id: string; product: string; onMac?: boolean },
  session: { where?: string } | null,
  cloud: CloudStatus | null,
  products: { slug: string; repoPath?: string | null }[],
): 'cloud' | 'here' | 'kept' | null {
  if (!cloud?.setUp) return null;
  if (item.onMac) return 'kept';
  if (session?.where === 'cloud') return 'cloud';
  if (!cloudIsOn(cloud)) return null;
  return products.some((p) => p.slug === item.product && p.repoPath) ? 'here' : null;
}
