export const CARRIED: 'computer';
export const SLEPT_GAP_MS: number;
export const ASLEEP_SETTLE_MS: number;
export const CARRY_AHEAD_MS: number;
export const CARRY_FRESH_MS: number;
type Command = { payload?: Record<string, unknown> | null };
export function isCarried(cmd: Command | null | undefined): boolean;
export function notBeforeOf(cmd: Command | null | undefined): number;
export function macAsleep(options?: {
  now?: number;
  lastTickAt?: number;
  wokeAt?: number;
  idleMs?: number | null;
  gapMs?: number;
  settleMs?: number;
}): boolean;
export function carryCommand(options?: {
  item?: { id?: string; product?: string; answer?: string; title?: string; body?: string; model?: string; effort?: string };
  continuation?: boolean;
  engine?: string | null;
  notBefore?: number | null;
  repeat?: { rule: string; key: string } | null;
}): { project: string; item: string; kind: 'reply' | 'run-now'; payload: Record<string, unknown> } | null;
