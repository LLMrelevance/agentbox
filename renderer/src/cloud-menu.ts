// THE CLOUD MENU'S WORDS AND NUMBERS (tests/the-cloud-button-chooses-where-threads-run).
// The button and the menu are drawn in threads/Pages.tsx, beside the filters
// button and built like its menu; what they say lives here.

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
  // renewed), 'ready'.
  state?: 'broken' | 'renew' | 'stale' | 'ready';
  savedAt?: number | null;
}

export interface CloudStatus {
  setUp: boolean;
  mode: CloudMode;
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

// THE KEY THAT OPENS THE MENU. W for where threads run, the button's own
// title; C still starts a thread for those who learned it.
export const CLOUD_KEY = 'W';
/** What W sends to the cloud button, which owns whether its menu is open. */
export const CLOUD_MENU_EVENT = 'agentbox:cloud-menu';
export const openCloudMenu = () => window.dispatchEvent(new Event(CLOUD_MENU_EVENT));

/** In the open menu, 1 2 3 pick the choices in the order they are drawn. */
export function cloudModeForKey(key: string): CloudMode | null {
  const n = /^[1-9]$/.test(key) ? Number(key) : 0;
  return CLOUD_MODES[n - 1]?.id ?? null;
}

/** ⌘K's rows for where threads run, most cloud first, the one in use saying so. */
export function cloudCommands(mode: CloudMode | null | undefined): { mode: CloudMode; label: string; hint?: string }[] {
  const rows: { mode: CloudMode; label: string }[] = [
    { mode: 'all', label: 'Run everything in the cloud' },
    { mode: 'full', label: 'Run threads in the cloud when this Mac is full' },
    { mode: 'mac', label: 'Run threads on this Mac only' },
  ];
  return rows.map((r) => (r.mode === mode ? { ...r, hint: 'on now' } : r));
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
