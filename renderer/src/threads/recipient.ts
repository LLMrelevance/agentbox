export const LAST_RECIPIENT_KEY = 'zero.lastThreadRecipient';

type Recipient = { to: string; mate: string | null; auto: boolean };

export function readLastRecipient(
  people: readonly { id: string }[],
  mates: readonly { id: string }[] | undefined,
  canReachMates: boolean,
  store: Storage | undefined = globalThis.localStorage,
): Recipient {
  const fallback = { to: 'agent', mate: null, auto: true };
  try {
    const saved = JSON.parse(store?.getItem(LAST_RECIPIENT_KEY) ?? 'null');
    if (!saved || typeof saved.auto !== 'boolean') return fallback;
    if (saved.to === 'agent' && saved.mate === null) return { to: 'agent', mate: null, auto: saved.auto };
    if (saved.to === 'agent' && canReachMates && saved.mate !== 'new' && mates?.some(m => m.id === saved.mate)) {
      return { to: 'agent', mate: saved.mate, auto: false };
    }
    if (saved.mate === null && people.some(p => p.id === saved.to)) {
      return { to: saved.to, mate: null, auto: false };
    }
  } catch { /* Open with the default if storage is unavailable. */ }
  return fallback;
}

export function writeLastRecipient(recipient: Recipient, store: Storage | undefined = globalThis.localStorage): void {
  if (recipient.mate === 'new') return;
  try { store?.setItem(LAST_RECIPIENT_KEY, JSON.stringify(recipient)); } catch { /* The current choice still stands. */ }
}
