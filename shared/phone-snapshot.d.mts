// Types for shared/phone-snapshot.mjs, for the phone with the computer closed.
export const SNAPSHOT_LIMITS: { lines: number; textChars: number; items: number; bytes: number };
export const PHONE_COMMANDS: string[];
export function hideSecrets(text: string, opts?: { home?: string | null }): string;
export function bytesOf(value: unknown): number;
export function threadSnapshot(item: Record<string, unknown>, history?: unknown[], limits?: typeof SNAPSHOT_LIMITS, opts?: { home?: string | null }): { v: number; item: Record<string, unknown>; history: unknown[]; olderLines: number };
export function threadsWorthCarrying<T>(items: T[], opts?: { now?: number }): T[];
export function snapshotKey(snapshot: unknown): string;
export function madeHere(commandId: string): string;
export function phoneProjectsOf(saved: unknown, personId: string | null | undefined): string[];
export function withPhoneProject(saved: unknown, personId: string | null | undefined, slug: string, on: boolean): { owner: string; slugs: string[] } | undefined;
export function checkCommand(cmd: unknown, ctx: { projects: string[]; hasItem: (project: string, id: string) => boolean }): string | null;
