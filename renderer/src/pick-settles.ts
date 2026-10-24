// PURE. A NUMBER DOES NOT ANSWER A THREAD THAT ARRIVED UNDER YOU.
//
// Two halves of the design are both wanted: a number picks without a
// confirmation (the strip draws the numbers, so the press is the answer), and
// answering from Needs you moves you on, which is what makes clearing an inbox
// a flow rather than a round trip (./advance). The seam between them is not
// wanted. The advance replaces the thread on screen while your hand is still
// over the keys, so a second press aimed at the thread you were reading lands
// on one you have not read, and that press SHIPS something. Nothing else in the
// app can send to the wrong thread with one keystroke.
//
// So a number is inert for a moment after THE APP moved you, and only then:
// opening a thread yourself and pressing 1 is a deliberate press, and a guard
// there would be the app second-guessing you. Every other key stays live.

/**
 * How long a number is inert for. A keystroke already on its way when the
 * screen changed arrives within a couple of hundred milliseconds of it; this is
 * several times that and still short enough that a press you make after reading
 * the new thread is never refused (the strip takes longer than this to read).
 */
export const PICK_SETTLES_MS = 800;

/** The thread the app last moved you to, and when. */
export type Arrival = { key: string; at: number } | null;

/**
 * Whether a number pressed now is aimed at the thread on screen. `here` and
 * `arrival.key` are the window's own key for a thread (`keyOf` in App.tsx,
 * which names the project too: two projects can hold the same id).
 */
export function pickLandsHere(arrival: Arrival, here: string, now: number): boolean {
  if (!arrival || arrival.key !== here) return true;
  return now - arrival.at >= PICK_SETTLES_MS;
}

/**
 * What is said when one is refused. It says which thread the press was for,
 * because the whole fault is not knowing that, and it says the way to answer
 * this one, because the key works again a moment later.
 */
export const AIMED_AT_THE_THREAD_YOU_LEFT =
  'That number was for the thread you just left. Press it again to answer this one.';
