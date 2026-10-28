export const CARRIED: 'computer';
export const SLEPT_GAP_MS: number;
export const ASLEEP_SETTLE_MS: number;
export const CARRY_AHEAD_MS: number;
export const CARRY_FRESH_MS: number;

type Command = { payload?: { carried?: unknown; notBefore?: unknown } | null };
export function isCarried(cmd?: Command | null): boolean;
export function notBeforeOf(cmd?: Command | null): number;

export function macAsleep(options?: {
  now?: number;
  lastTickAt?: number;
  wokeAt?: number;
  idleMs?: number | null;
  gapMs?: number;
  settleMs?: number;
}): boolean;

export function carryCommand(options?: {
  item?: {
    id?: string;
    product?: string;
    answer?: string | null;
    title?: string | null;
    body?: string | null;
    model?: string | null;
    effort?: string | null;
  } | null;
  continuation?: boolean;
  engine?: string | null;
  notBefore?: number | null;
  repeat?: unknown;
}): {
  project: string;
  item: string;
  kind: 'reply' | 'run-now';
  payload: {
    carried: 'computer';
    text?: string;
    title?: string;
    body?: string;
    engine?: string;
    model?: string;
    effort?: string;
    notBefore?: number;
    repeat?: unknown;
  };
} | null;
