type Command = { payload?: { carried?: string; notBefore?: unknown } | null } | null | undefined;

export declare const CARRIED: 'computer';
export declare const isCarried: (cmd: Command) => boolean;
export declare const SLEPT_GAP_MS: number;
export declare const ASLEEP_SETTLE_MS: number;
export declare const CARRY_AHEAD_MS: number;
export declare const CARRY_FRESH_MS: number;
export declare function macAsleep(opts?: {
  now?: number;
  lastTickAt?: number;
  wokeAt?: number;
  idleMs?: number | null;
  gapMs?: number;
  settleMs?: number;
}): boolean;
export declare function carryCommand(opts?: {
  item?: { id?: string; product?: string; answer?: unknown; title?: unknown; body?: unknown; model?: string; effort?: string } | null;
  continuation?: boolean;
  engine?: string | null;
  notBefore?: number | null;
  repeat?: { rule: string; key: string } | null;
}): { project: string; item: string; kind: 'reply' | 'run-now'; payload: Record<string, unknown> } | null;
export declare const notBeforeOf: (cmd: Command) => number;
