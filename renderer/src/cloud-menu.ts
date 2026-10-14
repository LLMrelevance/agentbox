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

// A sign-in going on in the cloud for one account (main/cloud/logins.mjs).
// Claude: its page opens, she pastes the code it shows. Codex: OpenAI's page
// opens, she types the code shown here, and it finishes by itself.
export interface CloudSignIn {
  state: 'starting' | 'needs-code' | 'waiting' | 'checking' | 'saved' | 'failed';
  url: string | null;
  code: string | null;
  message: string | null;
  // One sign-in, told from the next, which may show the same link.
  attempt?: string;
}

export interface CloudAccount {
  engine: 'claude' | 'codex';
  profile: string;
  name: string;
  ready: boolean;
  // 'none' (never signed in for the cloud), 'broken' (stopped working),
  // 'renew' / 'stale' (a Codex login being renewed), 'ready'.
  state?: 'none' | 'broken' | 'renew' | 'stale' | 'ready';
  signIn?: CloudSignIn | null;
}

export interface CloudStatus {
  setUp: boolean;
  mode: CloudMode;
  running: number;
  month: CloudMonth;
  accounts?: CloudAccount[];
}

const GOING = new Set(['starting', 'needs-code', 'waiting', 'checking']);
export const signingIn = (a: CloudAccount) => !!a.signIn && GOING.has(a.signIn.state);
export const engineWord = (a: CloudAccount) => (a.engine === 'codex' ? 'Codex' : 'Claude');

// The page a sign-in step opens, and what tells this opening from the
// last: two Codex accounts show the same link, and each must open it.
export function pageToOpen(a: CloudAccount | null): { key: string; url: string } | null {
  const url = a?.signIn?.url;
  return a && url ? { key: `${a.engine}:${a.profile}:${a.signIn?.attempt ?? ''}:${url}`, url } : null;
}

// THE ACCOUNTS THAT STILL NEED THEIR ONE SIGN-IN, in the order the setup
// walks them. A Codex login being renewed is not one: that needs nothing
// from her. Nothing at all while threads stay on this Mac.
export function cloudNeedsSignIn(status: CloudStatus): CloudAccount[] {
  if (status.mode === 'mac') return [];
  return (status.accounts || []).filter((a) => !a.ready && a.state !== 'renew' && a.state !== 'stale');
}

// The one line the menu says about them, before she starts.
export function cloudSetupLine(pending: CloudAccount[]): string {
  if (!pending.length) return '';
  if (pending.length === 1) {
    const a = pending[0];
    return a.state === 'broken'
      ? `${engineWord(a)} · ${a.name} needs to sign in again to run in the cloud.`
      : `${engineWord(a)} · ${a.name} needs one sign-in to run in the cloud.`;
  }
  return `${pending.length} accounts need one sign-in each to run in the cloud.`;
}

// WHAT ONE STEP OF THE SETUP SAYS, for the account being signed in.
export function cloudStepCopy(a: CloudAccount): { lead: string; codeToType: string | null; paste: boolean } {
  const s = a.signIn?.state;
  if (s === 'starting') return { lead: 'Starting the sign-in…', codeToType: null, paste: false };
  if (s === 'needs-code') return { lead: 'Claude’s sign-in opened in your browser. Approve it, then paste the code it shows.', codeToType: null, paste: true };
  if (s === 'waiting') return { lead: 'OpenAI’s page opened in your browser. Enter this code there; this step finishes by itself.', codeToType: a.signIn?.code ?? null, paste: false };
  if (s === 'checking') return { lead: 'Checking the sign-in…', codeToType: null, paste: false };
  if (s === 'failed') return { lead: a.signIn?.message || 'That did not work.', codeToType: null, paste: false };
  return { lead: '', codeToType: null, paste: false };
}

export const CLOUD_MODES: { id: CloudMode; label: string; note: string }[] = [
  { id: 'mac', label: 'This Mac only', note: 'Threads that don’t fit wait for a free agent.' },
  { id: 'full', label: 'When this Mac is full', note: 'Threads that don’t fit here start in the cloud.' },
  { id: 'all', label: 'Everything', note: 'Threads start in the cloud first, wherever they can.' },
];

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

export function cloudMonthLine(month: CloudMonth): string {
  if (!month.runs) return 'Nothing in the cloud yet this month';
  const base = `${hours(month.agentHours)} agent-hours`;
  return month.costPerAgentHour != null ? `${base} · about $${month.estimatedCost.toFixed(2)}` : base;
}
