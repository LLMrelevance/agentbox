// Types for ./neo-tools.mjs, for the renderer's TypeScript.
export const NEO_TOOLS: ReadonlyArray<{ type: 'function'; name: string; description: string; parameters: Record<string, unknown> }>;
export function checkCall(name: string, rawArgs: string): { ok: true; args: Record<string, unknown> } | { ok: false; error: string };
export function needsYes(optionText: string): boolean;
export const PACES: Record<'slow' | 'normal' | 'fast' | 'faster', string>;
export function neoSession(o?: { context?: string; history?: Array<{who: string; text: string}>; pending?: string; model?: string; backend?: string; voice?: string; pace?: string; engine?: 'decisions' | 'tools' }): Record<string, unknown>;
