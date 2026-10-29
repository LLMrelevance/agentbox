// What the window does when the screen throws: reload once on its own, and
// only stop and ask when a reload it made itself crashed again straight away.

export type CrashStore = Pick<Storage, 'getItem' | 'setItem'>;

export const CRASH_RELOAD_KEY = 'agentbox.crash-reloaded-at';
// Long enough to cover a screen that crashes again as it comes back up, short
// enough that a crash an hour later still reloads on its own.
export const CRASH_LOOP_MS = 60_000;
// The toast is for the page the reload drew, not one opened minutes later.
const TOLD_WITHIN_MS = 15_000;

export const RELOADED_AFTER_A_CRASH = 'The screen hit an error and reloaded itself';

const reloadedAt = (store: CrashStore) => {
  const at = Number(store.getItem(CRASH_RELOAD_KEY));
  return Number.isFinite(at) && at > 0 ? at : null;
};

// A store that cannot be read cannot remember the last reload, so it stays
// rather than risk reloading for ever.
export function afterACrash(now: number, store: () => CrashStore = () => sessionStorage): 'reload' | 'stay' {
  try {
    const s = store();
    const at = reloadedAt(s);
    if (at !== null && now - at >= 0 && now - at < CRASH_LOOP_MS) return 'stay';
    s.setItem(CRASH_RELOAD_KEY, String(now));
    return 'reload';
  } catch {
    return 'stay';
  }
}

let told = false;
/** True once, on the page a crash reload drew. The mark stays for the loop check. */
export function cameBackFromACrash(now: number, store: () => CrashStore = () => sessionStorage): boolean {
  if (told) return false;
  try {
    const at = reloadedAt(store());
    if (at === null || now - at < 0 || now - at > TOLD_WITHIN_MS) return false;
  } catch {
    return false;
  }
  told = true;
  return true;
}

// The close or answer still held for Z lives in App, which a crash unmounts.
// App leaves its writer here, so the reload can write it first.
let heldWriter: (() => Promise<void>) | null = null;
export function keepHeldWriter(fn: () => Promise<void>) { heldWriter = fn; }

export async function writeHeldBeforeReload(timeoutMs = 2000) {
  const write = heldWriter;
  if (!write) return;
  await Promise.race([
    Promise.resolve().then(write).catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
