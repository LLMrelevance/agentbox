// ONE THREAD, AS HER PHONE SEES IT WITH THE MAC SHUT (docs/cloud/PHONE-PLAN.md).
//
// Her Mac writes this for each thread of a project she put on her phone, and
// the phone reads it. It is what the phone's own screens already draw: the row
// as the Mac folded it (the phone never decides a thread's state from raw
// lines; Codex's review of the plan, finding 5), and the thread's history as
// the window reads it (store.readHistory), which the thread view turns into
// the conversation. Long text is cut, and only the latest lines go. Browser-
// safe: no node imports.

// How much of one thread goes up. The latest of a thread is what she reads on
// a phone; the whole of it stays on the Mac.
export const SNAPSHOT_LIMITS = { lines: 120, textChars: 12_000, items: 300, bytes: 900_000 };

// Strings cut to `n`, all the way down, so no single field can carry a
// thread's copy past the database's megabyte.
function clipDeep(value, n, depth = 0) {
  if (typeof value === 'string') return value.length > n ? `${value.slice(0, n)}…` : value;
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => clipDeep(v, n, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = clipDeep(v, n, depth + 1);
  return out;
}

// `item` is the folded row; `history` is store.readHistory for it.
export function threadSnapshot(item, history = [], limits = SNAPSHOT_LIMITS) {
  const lines = Array.isArray(history) ? history : [];
  const row = clipDeep(item, limits.textChars);
  let keep = limits.lines;
  for (;;) {
    const kept = lines.slice(-keep);
    const snap = { v: 2, item: row, history: kept.map((l) => clipDeep(l, limits.textChars)), olderLines: lines.length - kept.length };
    // Under the database's megabyte, with room: fewer lines until it fits.
    if (keep <= 1 || JSON.stringify(snap).length <= limits.bytes) return snap;
    keep = Math.floor(keep / 2);
  }
}

// The threads of a project worth carrying: everything not yet archived, and
// what was finished in the last fortnight, newest first, at most `items`.
export function threadsWorthCarrying(items, { now = Date.now(), limits = SNAPSHOT_LIMITS } = {}) {
  const fortnight = 14 * 24 * 3600_000;
  return (Array.isArray(items) ? items : [])
    .filter((i) => i && !i.agent && (i.status !== 'done' || now - (i.updatedAt ?? 0) < fortnight))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, limits.items);
}

// A cheap, stable fingerprint, so a thread that did not change is not sent.
export function snapshotKey(snapshot) {
  const text = JSON.stringify(snapshot);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `${text.length}:${(h >>> 0).toString(36)}`;
}

// WHAT HER PHONE MAY ASK HER MAC TO DO, and nothing else. A command that is not
// one of these, or names a project she did not put on her phone, or a thread
// that is not in it, is refused and says why.
export const PHONE_COMMANDS = ['reply', 'new', 'snooze', 'close'];
export function checkCommand(cmd, { projects, hasItem }) {
  if (!cmd || !PHONE_COMMANDS.includes(cmd.kind)) return 'not something the phone may do';
  if (!projects.includes(cmd.project)) return 'that project is not on your phone';
  const p = cmd.payload || {};
  if (cmd.kind === 'new') {
    const title = typeof p.title === 'string' ? p.title.trim() : '';
    const body = typeof p.body === 'string' ? p.body.trim() : '';
    if (!title && !body) return 'a new thread needs some words';
    return null;
  }
  if (!cmd.item || !hasItem(cmd.project, cmd.item)) return 'that thread is not on your phone';
  if (cmd.kind === 'reply' && !(typeof p.text === 'string' && p.text.trim())) return 'an empty reply';
  if (cmd.kind === 'snooze' && !(Number.isFinite(p.until) && p.until > 0)) return 'a snooze needs a time';
  return null;
}
