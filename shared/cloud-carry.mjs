// THE COMPUTER'S OWN WORK, HANDED TO THE CLOUD WHILE IT SLEEPS.
//
// A shut Mac wakes for a few seconds every quarter of an hour. Too short to
// start a run (packing alone takes longer), and a run started then dies at the
// next wake. Long enough to write one line per waiting row into the phone's
// command table, which the cloud server starts from the thread's kit the way
// it starts a reply sent from the phone (cloud/gateway/phone.mjs). Shared by
// the computer, the server and the phone, so all three read the mark the same.

export const CARRIED = 'computer';

/** Whether a command is the computer's own hand-over rather than something the phone sent. */
export const isCarried = (cmd) => cmd?.payload?.carried === CARRIED;

// A pass this late means the process was frozen (Supervisor SLEPT_GAP_MS).
export const SLEPT_GAP_MS = 2 * 60_000;
// After a wake, this long passes before the Mac counts as awake on its own.
// Dark wakes measured on a MacBook Air: 2 to 21 seconds.
export const ASLEEP_SETTLE_MS = 60_000;

/**
 * Whether the computer is in one of a sleeping Mac's short wakes, where a run
 * started would die. True from the first pass after a gap until ASLEEP_SETTLE_MS
 * later, and while a pass is overdue by a gap. A key or mouse touched since
 * the wake is a person at the Mac: `idleMs` under the time since `wokeAt`.
 */
export function macAsleep({ now = Date.now(), lastTickAt = 0, wokeAt = 0, idleMs = null, gapMs = SLEPT_GAP_MS, settleMs = ASLEEP_SETTLE_MS } = {}) {
  const overdue = lastTickAt > 0 && now - lastTickAt >= gapMs;
  const settling = wokeAt > 0 && now - wokeAt < settleMs;
  if (!overdue && !settling) return false;
  if (!overdue && Number.isFinite(idleMs) && idleMs < now - wokeAt) return false;
  return true;
}

/**
 * The command that hands one row to the cloud, or null. A row carrying a
 * reply goes as that reply, started from the thread's own kit; a row nobody
 * has run goes as Run now, started from its project's new-thread kit under
 * the row's own id.
 */
export function carryCommand({ item, continuation = false, engine = null } = {}) {
  if (!item?.id || !item.product) return null;
  const base = { project: item.product, item: item.id };
  if (continuation) {
    if (typeof item.answer !== 'string' || !item.answer.trim()) return null;
    return { ...base, kind: 'reply', payload: { carried: CARRIED, text: item.answer } };
  }
  const title = String(item.title ?? '').trim();
  if (!title) return null;
  return {
    ...base,
    kind: 'run-now',
    payload: {
      carried: CARRIED,
      title,
      body: String(item.body ?? ''),
      ...(engine ? { engine } : {}),
      ...(item.model ? { model: item.model } : {}),
      ...(item.effort ? { effort: item.effort } : {}),
    },
  };
}
