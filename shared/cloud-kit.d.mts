// Types for shared/cloud-kit.mjs, the thread's next turn as the cloud starts it.

export const KIT_VERSION: number;
export const REPLY_MARK: string;
export const CLOUD_TAKES_AFTER_MS: number;
export const CLOUD_TAKES_UNTIL_MS: number;
export const KIT_FRESH_MS: number;

export const cloudClaim: (runId: string) => string;
/** The run id in a `cloud:<run id>` claim, or null when it is not one. */
export const runOfClaim: (claimedBy: unknown) => string | null;
export const cloudSessionId: (item: string | null | undefined, runId: string) => string;

export const kitKey: (device: string, project: string, item: string) => string;
export const serverRunKey: (runId: string) => string;
export const serverJoinedKey: (runId: string) => string;
export const runKey: (runId: string, name: string) => string;

export interface ReplyFrame { before: string; after: string }
export function replyFrame(prompt: string | null | undefined): ReplyFrame | null;
export function replyPrompt(frame: ReplyFrame, reply: string | null | undefined): string;
export function cloudUserLine(text: string, opts?: { note?: string | null; uuid?: string }): string;

export function checkKit(kit: unknown, opts?: { now?: number }): string | null;
export function startPayload(kit: Record<string, any>, opts: {
  runId: string;
  getUrl: (key: string) => string | Promise<string>;
  putUrl: (key: string) => string | Promise<string>;
  loginName: (key: string) => string;
  offlineAfterMs?: number;
  kept?: unknown;
  endTurn?: string;
  refs?: Record<string, string> | null;
  away?: boolean;
}): Promise<Record<string, any>>;

export const APPROVALS_SERVER: string;
export const askId: (runId: string, conn: string | number, id: string | number) => string;
export const cloudCard: (approval: unknown) => boolean;
export const DECLINED: string;
export function approvalAnswerLine(id: string | number, opts?: { allow?: boolean; note?: string | null; input?: Record<string, unknown> }): string;

export interface Answer { text: string; isError: boolean }
export function answersIn(eventsText: string | null | undefined): Answer[];
export function resultsInLines(lines: string[]): Answer[];
export function lastAnswerIn(eventsText: string | null | undefined): Answer | null;

export const codexOpenLines: (kit: Record<string, any>) => string;
export function codexTurnLines(kit: Record<string, any>, reply: string | null | undefined, opts: { id: number; raw?: string | null; threadId?: string | null }): string;
/** `state` carries a turn across reads and is told the resume's answer. */
export function codexReadLines(lines: string[], state?: Record<string, any>): Answer[];
export const codexAnswersIn: (eventsText: string | null | undefined, state?: Record<string, any>) => Answer[];
export function codexAnswerIn(eventsText: string | null | undefined): Answer | null;

export const NEW_THREAD: string;
export const NEW_ITEM_MARK: string;
export const NEW_TITLE_MARK: string;
export const NEW_BODY_MARK: string;
export const NEW_THREAD_CODEX: string;
export const newThreadKitKey: (device: string, project: string, engine?: string) => string;
export function fillNewThreadKit(kit: Record<string, any> | null | undefined, opts: { itemId: string; title?: string; body?: string }): { kit: Record<string, any>; prompt: string; refs: Record<string, string>; mainSha: string } | null;
