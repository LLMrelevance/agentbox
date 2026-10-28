// Types for shared/cloud-carry.mjs, which is plain ESM so that the computer,
// the cloud server and the phone share one copy of the mark.

export interface CarryCommand {
  project: string;
  item: string;
  kind: 'reply' | 'run-now';
  payload: {
    carried: string;
    text?: string;
    title?: string;
    body?: string;
    engine?: string;
    model?: string;
    effort?: string;
    notBefore?: number;
    repeat?: { rule: string; key: string };
  };
}

export const CARRIED: 'computer';
export function isCarried(cmd: { payload?: { carried?: unknown } | null } | null | undefined): boolean;
export const SLEPT_GAP_MS: number;
export const ASLEEP_SETTLE_MS: number;
export const CARRY_AHEAD_MS: number;
export const CARRY_FRESH_MS: number;
export function macAsleep(opts?: {
  now?: number;
  lastTickAt?: number;
  wokeAt?: number;
  idleMs?: number | null;
  gapMs?: number;
  settleMs?: number;
}): boolean;
export function carryCommand(opts?: {
  item?: { id?: string; product?: string; answer?: string; title?: string; body?: string; model?: string; effort?: string } | null;
  continuation?: boolean;
  engine?: string | null;
  notBefore?: number | null;
  repeat?: { rule: string; key: string } | null;
}): CarryCommand | null;
export function notBeforeOf(cmd: { payload?: { notBefore?: unknown } | null } | null | undefined): number;
