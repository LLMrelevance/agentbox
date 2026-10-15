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
// a phone; the whole of it stays on the Mac. `bytes` is measured in UTF-8, as
// the database measures it (Codex's review of step 1, finding 9).
export const SNAPSHOT_LIMITS = { lines: 120, textChars: 12_000, items: 300, bytes: 900_000 };

// WHAT A COPY MAY CARRY, BY NAME (Codex's review of step 1, finding 2). A copy
// is built out of these and nothing else, never by copying a row and deleting
// the bad parts: a lease, an epoch, who may see a team thread, a field some
// later version adds, none of it leaves unless it is named here.
const ROW_FIELDS = [
  'id', 'title', 'label', 'body', 'kind', 'labels', 'priority', 'parent', 'status',
  'result', 'note', 'answer', 'runAt', 'snoozedUntil', 'answeredThrough',
  'engine', 'model', 'start', 'due', 'problem', 'progress', 'solution',
  'createdAt', 'updatedAt',
];
// The fields a line in a thread's history may carry in its patch: what the
// thread view draws as the conversation and its state changes.
const LINE_FIELDS = [
  'title', 'label', 'body', 'kind', 'labels', 'priority', 'status', 'result',
  'note', 'answer', 'runAt', 'snoozedUntil', 'start', 'due', 'problem',
  'progress', 'solution', 'inReplyTo',
];
const SOURCES = new Set(['founder', 'agent', 'system']);

// KEYS AND TOKENS IN WHAT AN AGENT OR SHE WROTE, hidden. A conversation can
// quote one ("here is the key it used"), and a copy online is no place for it.
const SECRETS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /\b(Bearer\s+)[A-Za-z0-9._~+/-]{20,}=*/gi,
  /\b(Basic\s+)[A-Za-z0-9+/]{12,}=*/gi,
];
// A VALUE GIVEN A SECRET'S NAME, whatever it looks like (Codex's second and
// third reviews): `AWS_SECRET_ACCESS_KEY=...`, `password: hunter22`,
// `PASSWORD=12345678`, `password="correct horse battery staple"`. The name
// stays, so the sentence still reads; a quoted value goes whole.
const STRONG = '[A-Za-z0-9_.-]*(?:passw(?:or)?d|passphrase|secret|api[_-]?key|access[_-]?key|private[_-]?key|credentials?|authorization|(?:auth|access|refresh|session|bearer|id)[_-]?token)[A-Za-z0-9_.-]*';
// "token" alone is a word people use ("token: unexpected identifier"), so it
// counts only as an ENV_STYLE name, or before a long run that looks like a key.
const WEAK = '(?:[A-Z0-9_]*TOKEN[A-Z0-9_]*|token)';
const VALUE = '(?:"([^"\\n]{1,500})"|\'([^\'\\n]{1,500})\'|([^\\s"\',;()\\[\\]{}<>][^\\s"\',;)\\]}]*))';
const NAMED_STRONG = new RegExp(`\\b(${STRONG})(["']?\\s*[:=]\\s*)${VALUE}`, 'gi');
const NAMED_WEAK = new RegExp(`\\b(${WEAK})(["']?\\s*[:=]\\s*)${VALUE}`, 'g');
const hidden = (name, sep, dq, sq, bare) => `${name}${sep}${dq !== undefined ? '"[hidden]"' : sq !== undefined ? "'[hidden]'" : '[hidden]'}`;
function hideNamed(text) {
  let out = text.replace(NAMED_STRONG, (m, name, sep, dq, sq, bare) => (bare === '[hidden]' ? m : hidden(name, sep, dq, sq, bare)));
  out = out.replace(NAMED_WEAK, (m, name, sep, dq, sq, bare) => {
    const value = dq ?? sq ?? bare ?? '';
    const envStyle = name !== 'token' && name === name.toUpperCase();
    const keyLike = value.length >= 16 && /[0-9]/.test(value) && !/\s/.test(value);
    return value !== '[hidden]' && (envStyle || keyLike) ? hidden(name, sep, dq, sq, bare) : m;
  });
  return out;
}
// AND A LONG RUN OF LETTERS AND DIGITS THAT LOOKS LIKE NOTHING BUT A KEY: 32 or
// more, upper and lower case and digits all present. A commit id or a uuid is
// one case of hex and is left alone.
const KEYLIKE = /\b(?=[A-Za-z0-9_-]{32,}\b)(?=[A-Za-z0-9_-]*[a-z])(?=[A-Za-z0-9_-]*[A-Z])(?=[A-Za-z0-9_-]*[0-9])[A-Za-z0-9_-]{32,}\b/g;
export function hideSecrets(text, { home = null } = {}) {
  let out = String(text);
  for (const re of SECRETS) out = out.replace(re, (m, bearer) => (typeof bearer === 'string' && /^(Bearer|Basic)/i.test(bearer) ? `${bearer}[hidden]` : '[hidden]'));
  out = hideNamed(out);
  out = out.replace(KEYLIKE, '[hidden]');
  // Her home folder is ~ online, as it is in a crash report (shared/crash-scrub.mjs).
  if (home && home.length > 1) out = out.split(home).join('~');
  return out;
}

const clip = (s, n, ctx) => {
  const t = hideSecrets(s, ctx);
  return t.length > n ? `${t.slice(0, n)}…` : t;
};
// A value of a named field: text cut and cleaned, numbers as they are, short
// lists of words, nothing nested.
function plain(v, n, ctx) {
  if (typeof v === 'string') return clip(v, n, ctx);
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'boolean' || v === null) return v;
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string').slice(0, 40).map((x) => clip(x, 200, ctx));
  return undefined;
}
function pick(obj, fields, n, ctx) {
  const out = {};
  for (const f of fields) {
    if (!obj || !(f in obj)) continue;
    const v = plain(obj[f], n, ctx);
    if (v !== undefined) out[f] = v;
  }
  return out;
}

export const bytesOf = (value) => new TextEncoder().encode(JSON.stringify(value)).length;

// `item` is the folded row; `history` is store.readHistory for it. `home` is
// her home folder, written ~ in the copy.
export function threadSnapshot(item, history = [], limits = SNAPSHOT_LIMITS, { home = null } = {}) {
  const ctx = { home };
  const row = pick(item, ROW_FIELDS, limits.textChars, ctx);
  // Who wrote each field, which is how the screens tell her words from an
  // agent's: the source and the moment, nothing else of it.
  if (item?.wrote && typeof item.wrote === 'object') {
    const wrote = {};
    for (const f of ROW_FIELDS) {
      const w = item.wrote[f];
      if (w && SOURCES.has(w.source) && Number.isFinite(w.ts)) wrote[f] = { ts: w.ts, source: w.source };
    }
    row.wrote = wrote;
  }
  const lines = [];
  for (const l of Array.isArray(history) ? history : []) {
    if (!l || l.claim || l.release || l.heartbeat || !SOURCES.has(l.source) || !Number.isFinite(l.ts)) continue;
    const patch = pick(l.patch, LINE_FIELDS, limits.textChars, ctx);
    if (!Object.keys(patch).length) continue;
    lines.push({ id: row.id, ts: l.ts, source: l.source, patch });
  }
  // Under the database's megabyte, with room: fewer lines until it fits, and
  // then shorter text, so one long thread never stops the rest being sent.
  for (let keep = limits.lines, chars = limits.textChars; ;) {
    const kept = lines.slice(-keep);
    const snap = {
      v: 3,
      item: chars === limits.textChars ? row : pick(row, ROW_FIELDS, chars, ctx),
      history: chars === limits.textChars ? kept : kept.map((l) => ({ ...l, patch: pick(l.patch, LINE_FIELDS, chars, ctx) })),
      olderLines: lines.length - kept.length,
    };
    if (row.wrote && snap.item !== row) snap.item.wrote = row.wrote;
    if (bytesOf(snap) <= limits.bytes) return snap;
    if (keep > 1) keep = Math.floor(keep / 2);
    else if (chars > 200) chars = Math.floor(chars / 4);
    else return { v: 3, item: { id: row.id, title: clip(row.title ?? '', 200, ctx), status: row.status, updatedAt: row.updatedAt }, history: [], olderLines: lines.length };
  }
}

// WHICH PROJECTS ARE ON THE PHONE OF THE PERSON SIGNED IN (Codex's review of
// step 1, finding 1). Her yes is kept with her id on it (`phoneProducts` in the
// config: { owner, slugs }), so somebody else signing in on this computer
// starts with nothing on their phone, not with her projects.
export function phoneProjectsOf(saved, personId) {
  if (!personId || !saved || typeof saved !== 'object' || saved.owner !== personId || !Array.isArray(saved.slugs)) return [];
  return saved.slugs.filter((s) => typeof s === 'string' && s);
}
export function withPhoneProject(saved, personId, slug, on) {
  if (!personId) throw new Error('sign in first');
  const set = new Set(phoneProjectsOf(saved, personId));
  if (on) set.add(slug); else set.delete(slug);
  return set.size ? { owner: personId, slugs: [...set] } : undefined;
}

// A NEW THREAD STARTED ON THE PHONE has a row there before the Mac makes it,
// under this id, and a reply to it before then is a reply to this id. The Mac
// remembers which real row it became (main/phone-inbox.mjs) (Codex's review of
// step 1, finding 8). Shaped like a row id, so every screen takes it.
export const madeHere = (commandId) => `w-${String(commandId).replace(/[^0-9a-f]/gi, '').slice(0, 10).toLowerCase()}`;

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
  if (cmd.kind === 'snooze' && !(Number.isFinite(p.until) && p.until >= 0)) return 'a snooze needs a time';
  return null;
}
