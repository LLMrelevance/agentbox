// Types for ./neo-tools.mjs, for the renderer's TypeScript.
export const NEO_TOOLS: ReadonlyArray<{ type: 'function'; name: string; description: string; parameters: Record<string, unknown> }>;
export function checkCall(name: string, rawArgs: string): { ok: true; args: Record<string, unknown> } | { ok: false; error: string };
export function needsYes(optionText: string): boolean;
export function neoSession(o?: { screen?: string; model?: string; backend?: string; voice?: string }): Record<string, unknown>;
