// Types for shared/which-card-is-in-front.mjs, which is plain ESM so that the
// main process (the ⌘Y chord and the Agents menu) and the screen (the card)
// order the pending approvals by one copy of the rule.

/** What is open on screen: a thread, or nothing that is one thread. */
export type Looking = { product: string | null; id: string | null } | null;

export function cardsInFront<T extends { product?: string | null; item?: string | null }>(
  pending: readonly T[] | null | undefined,
  looking: Looking,
): T[];
