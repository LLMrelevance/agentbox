export const CARRIED: 'computer';
export const SLEPT_GAP_MS: number;
export const ASLEEP_SETTLE_MS: number;
export const CARRY_AHEAD_MS: number;
export const CARRY_FRESH_MS: number;

export function isCarried(command: unknown): boolean;
export function notBeforeOf(command: unknown): number;
export function macAsleep(options?: {
  now?: number;
  lastTickAt?: number;
  wokeAt?: number;
  idleMs?: number | null;
  gapMs?: number;
  settleMs?: number;
}): boolean;

export interface CarryItem {
  id?: string;
  product?: string;
  answer?: string | null;
  title?: string;
  body?: string | null;
  model?: string | null;
  effort?: string | null;
}

export interface CarryRepeat {
  rule: string;
  key: string;
}

export type CarriedCommand = { project: string; item: string } & (
  { kind: 'reply'; payload: { carried: typeof CARRIED; text: string; notBefore?: number } }
  | { kind: 'run-now'; payload: {
    carried: typeof CARRIED;
    title: string;
    body: string;
    engine?: string;
    model?: string;
    effort?: string;
    notBefore?: number;
    repeat?: CarryRepeat;
  } }
);

export function carryCommand(options?: {
  item?: CarryItem | null;
  continuation?: boolean;
  engine?: string | null;
  notBefore?: number | null;
  repeat?: CarryRepeat | null;
}): CarriedCommand | null;
