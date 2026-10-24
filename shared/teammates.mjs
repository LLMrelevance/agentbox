// Teammates: the pure rules, shared by the main process, the store tools and
// the renderer, the way shared/repeats.mjs is.
//
// A teammate is a standing job, not a thread. Each time it wakes it works on an
// ordinary work item labelled `teammate:<id>`, so every rule about runs (held
// starts, Needs you, deadlines, the clean marker) applies to it unchanged.
// What is new lives in two append-only files per account: the teammates
// themselves, and one team chat that you and every teammate write to.
import { periodKey, isRepeatRule, servedOf, dateKey } from './repeats.mjs';

export const TEAMMATE_LABEL_PREFIX = 'teammate:';
export const FROM_LABEL_PREFIX = 'from:';
export const YOU = 'you';
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_LIMIT = 20;
export const CHAT_TAIL = 30;
// Teammates waking each other with no person or schedule in between stop after
// this many hops, so two of them cannot keep each other running.
export const MAX_HOPS = 8;
export const HOP_LABEL_PREFIX = 'hop:';

export function hopOf(item) {
  const found = (item?.labels ?? []).find((l) => typeof l === 'string' && l.startsWith(HOP_LABEL_PREFIX));
  const n = found ? Number(found.slice(HOP_LABEL_PREFIX.length)) : 0;
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

export function teammateLabel(id) {
  return `${TEAMMATE_LABEL_PREFIX}${id}`;
}

export function teammateIdOf(item) {
  const found = (item?.labels ?? []).find((l) => typeof l === 'string' && l.startsWith(TEAMMATE_LABEL_PREFIX));
  return found ? found.slice(TEAMMATE_LABEL_PREFIX.length) : null;
}

export function passedFromOf(item) {
  const found = (item?.labels ?? []).find((l) => typeof l === 'string' && l.startsWith(FROM_LABEL_PREFIX));
  return found ? found.slice(FROM_LABEL_PREFIX.length) : null;
}

const ID_RE = /^t-[0-9a-f]{6,}$/;
export function isTeammateId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}

// ---------------------------------------------------------------- teammates

// A field written and missing from here is folded away at the next start, the
// way `on` once vanished from every weekly repeating task.
const FIELDS = [
  'name', 'letter', 'role', 'job', 'goal', 'counted', 'works', 'asksFirst',
  'product', 'engine', 'model', 'effort', 'limit', 'paused', 'status',
  'endedAt', 'served', 'starter', 'createdAt',
];

export const STATUSES = ['draft', 'active'];

export function isWorks(works) {
  return isRepeatRule(works);
}

function cleanText(v, max = 2000) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

function coerce(field, value) {
  switch (field) {
    case 'name': return cleanText(value, 40);
    case 'role': return cleanText(value, 60);
    case 'letter': {
      const t = cleanText(value, 2);
      return t ? t.toUpperCase() : null;
    }
    case 'job': case 'goal': case 'counted': case 'asksFirst': return cleanText(value, 2000);
    case 'product': case 'engine': case 'model': case 'effort': case 'starter': return cleanText(value, 120);
    case 'works': return value === null ? null : isWorks(value) ? { every: value.every, at: value.at, ...(value.every === 'week' ? { on: value.on } : {}) } : undefined;
    case 'limit': return Number.isInteger(value) && value >= 1 && value <= 500 ? value : undefined;
    case 'paused': return !!value;
    case 'status': return STATUSES.includes(value) ? value : undefined;
    case 'endedAt': case 'createdAt': return Number.isFinite(value) ? value : value === null ? null : undefined;
    case 'served': return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
    default: return undefined;
  }
}

// Newest wins per field. Memory is a list, written as `remember`/`forget` lines
// so two runs learning at once both keep what they learned.
export function foldTeammates(lines, now = Date.now()) {
  const today = dateKey(now);
  const byId = new Map();
  for (const line of lines ?? []) {
    if (!line || typeof line !== 'object') continue;
    const { id, ts, patch } = line;
    if (!isTeammateId(id) || !Number.isFinite(ts) || !patch || typeof patch !== 'object') continue;
    let t = byId.get(id);
    if (!t) {
      t = { id, createdAt: ts, updatedAt: ts, status: 'active', paused: false, served: '', memory: [], limit: DEFAULT_LIMIT };
      byId.set(id, t);
    }
    t.updatedAt = Math.max(t.updatedAt, ts);
    for (const field of FIELDS) {
      if (!(field in patch)) continue;
      const v = coerce(field, patch[field]);
      if (v === undefined) continue;
      if (field === 'served') {
        if (v <= today && v > t.served) t.served = v;
        continue;
      }
      t[field] = v;
    }
    const r = patch.remember;
    if (r && typeof r === 'object' && typeof r.id === 'string' && cleanText(r.text, 300) && !t.memory.some((m) => m.id === r.id)) {
      t.memory.push({ id: r.id, text: cleanText(r.text, 300), from: cleanText(r.from, 300), at: Number.isFinite(r.at) ? r.at : ts, by: typeof r.by === 'string' ? r.by : null });
    }
    if (typeof patch.forget === 'string') t.memory = t.memory.filter((m) => m.id !== patch.forget);
  }
  return [...byId.values()]
    .filter((t) => !t.endedAt && t.name)
    .sort((a, b) => a.createdAt - b.createdAt);
}

// A free letter for a new teammate: its own initial when nobody has it, else
// the next letter of its name, else the first free one.
export function letterFor(name, teammates = []) {
  const taken = new Set(teammates.map((t) => t.letter).filter(Boolean));
  const letters = String(name ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  for (const ch of letters) if (!taken.has(ch)) return ch;
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (!taken.has(ch)) return ch;
  return letters[0] ?? '?';
}

// ---------------------------------------------------------------- the chat

export const CHAT_KINDS = ['msg', 'pass', 'seen', 'act'];

export function foldChat(lines) {
  const messages = [];
  const seen = new Set();
  const ids = new Set();
  for (const line of lines ?? []) {
    if (!line || typeof line !== 'object' || !CHAT_KINDS.includes(line.kind)) continue;
    if (!Number.isFinite(line.ts)) continue;
    if (line.kind === 'seen') {
      if (typeof line.ref === 'string' && typeof line.for === 'string') seen.add(seenKey(line.ref, line.for));
      continue;
    }
    if (typeof line.id !== 'string' || ids.has(line.id)) continue;
    ids.add(line.id);
    messages.push(line);
  }
  messages.sort((a, b) => a.ts - b.ts);
  return { messages, seen };
}

export function seenKey(msgId, teammateId) {
  return `${msgId}>${teammateId}`;
}

// Who a message is addressed to: the ones it names with @, matched on name.
export function mentionsIn(text, teammates = []) {
  const out = [];
  const lower = String(text ?? '').toLowerCase();
  for (const t of teammates) {
    if (!t.name) continue;
    const re = new RegExp(`(^|[^\\w])@${t.name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (re.test(lower)) out.push(t.id);
  }
  return out;
}

// ---------------------------------------------------------------- runs

export function runsOf(teammateId, items) {
  return (items ?? []).filter((i) => teammateIdOf(i) === teammateId);
}

// A finished word from the agent that the person has not answered: the run is
// waiting on them, and so in Needs you, not running.
export function waitingOnYou(item) {
  if (!item || item.status === 'done' || item.status === 'claimed') return false;
  // Queued behind another run, or closed quietly: neither is in your inbox.
  if (item.start === 'later' || (item.labels ?? []).includes('clean')) return false;
  if (item.status === 'blocked') return true;
  const r = item.wrote?.result;
  if (!r || r.source !== 'agent') return false;
  const a = item.wrote?.answer?.ts ?? 0;
  return r.ts > a;
}

export function isQueued(item) {
  return item?.status === 'open' && item?.start === 'later';
}

// Running or about to: one at a time per teammate, so this is what the queue
// waits behind.
export function isActiveRun(item) {
  if (!item || item.status === 'done') return false;
  if (isQueued(item)) return false;
  return !waitingOnYou(item);
}

export function activeRunOf(teammateId, items) {
  return runsOf(teammateId, items).find(isActiveRun) ?? null;
}

export function runsThisWeek(teammateId, items, now = Date.now()) {
  return runsOf(teammateId, items).filter((i) => (i.createdAt ?? 0) > now - WEEK_MS).length;
}

// Deterministic, so a tick that dies after creating the run and before marking
// the message seen finds the same row next time rather than making a second.
export function runIdFor(seed) {
  let h1 = 0x811c9dc5;
  let h2 = 0x1b873593;
  const s = String(seed);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return `w-${h1.toString(16).padStart(8, '0')}${(h2 >>> 16).toString(16).padStart(4, '0')}`;
}

function clip(text, max) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export function runTitle(trigger, teammate) {
  if (trigger.kind === 'schedule') return trigger.label === 'week' ? "This week's round" : "Today's round";
  if (trigger.kind === 'pass') return clip(trigger.title || 'Work passed on', 120);
  // Inbox rows lead with the teammate's name, so a title never repeats it.
  if (trigger.opening === 'setup') return 'Set up its job';
  if (trigger.opening === 'start') return 'Introduce itself and begin';
  const said = partFor(trigger.text, teammate.name) || firstLine(trigger.text) || 'A message';
  return clip(trigger.fromName ? `From ${trigger.fromName}: ${said}` : said, 120);
}

const firstLine = (text) => String(text ?? '').trim().split('\n')[0].trim();

// What a message says to one teammate it names: from its @Name to the end of
// that sentence, when there is anything there.
function partFor(text, name) {
  const words = String(text ?? '');
  const at = name ? words.search(new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'i')) : -1;
  if (at < 0) return null;
  const rest = words.slice(at + name.length + 1).replace(/^[\s,:;–—-]+/, '');
  const part = rest.split(/\n|\s@\w/)[0].replace(/[\s.,;:]+$/, '').trim();
  return part ? part[0].toUpperCase() + part.slice(1) : null;
}

// What the tick should do now, decided without touching anything, so it can be
// tested on plain data and the main process only carries it out.
//
// - A message or pass addressed to a teammate wakes it. Your words go into the
//   run already waiting on you or already running, since they are most likely
//   the answer; anything else becomes a run of its own.
// - A schedule that is owed becomes a run.
// - One run at a time: a new run behind an active one is made queued, and a
//   teammate with nothing active gets its oldest queued run released.
// - A teammate past its weekly runs takes nothing new except your own words.
export function planWakes({ teammates = [], chat = { messages: [], seen: new Set() }, items = [], now = Date.now() } = {}) {
  const actions = [];
  const live = teammates.filter((t) => !t.endedAt);
  const byId = new Map(live.map((t) => [t.id, t]));
  const pendingNew = new Map();
  const startsNow = new Map();
  const limited = new Set();

  const active = (t) => !!activeRunOf(t.id, items) || startsNow.get(t.id);
  const overLimit = (t) => runsThisWeek(t.id, items, now) + (pendingNew.get(t.id) ?? 0) >= (t.limit ?? DEFAULT_LIMIT);

  const newRun = (t, trigger, seed, { fromYou = false } = {}) => {
    if (!fromYou && overLimit(t)) {
      limited.add(t.id);
      return null;
    }
    const later = active(t);
    const id = runIdFor(seed);
    actions.push({ type: 'run', teammate: t.id, id, trigger, title: runTitle(trigger, t), start: later ? 'later' : 'now' });
    pendingNew.set(t.id, (pendingNew.get(t.id) ?? 0) + 1);
    if (!later) startsNow.set(t.id, true);
    return id;
  };

  for (const m of chat.messages ?? []) {
    if (m.kind !== 'msg' && m.kind !== 'pass') continue;
    const targets = m.kind === 'pass' ? [m.to] : (Array.isArray(m.to) ? m.to : []);
    for (const tid of targets) {
      const t = byId.get(tid);
      if (!t || chat.seen.has(seenKey(m.id, tid))) continue;
      if (m.from === tid) { actions.push({ type: 'seen', msg: m.id, teammate: tid }); continue; }
      if (t.paused && m.from !== YOU) continue;
      const fromYou = m.from === YOU;
      const hop = fromYou ? 0 : (Number.isInteger(m.hop) ? m.hop : 0) + 1;
      if (hop > MAX_HOPS) {
        actions.push({ type: 'seen', msg: m.id, teammate: tid });
        actions.push({ type: 'hops', teammate: tid, msg: m.id, from: m.from });
        continue;
      }
      if (fromYou && m.kind === 'msg') {
        const runs = runsOf(tid, items);
        const waiting = runs.filter(waitingOnYou).sort((a, b) => (b.wrote?.result?.ts ?? 0) - (a.wrote?.result?.ts ?? 0))[0];
        // A running run hears your words only if your words started it;
        // anything else is new work, queued behind it.
        const yours = new Set((chat.messages ?? []).filter((x) => x.kind === 'msg' && x.from === YOU && x.id !== m.id).map((x) => runIdFor(`${x.id}>${tid}`)));
        const running = runs.find((i) => isActiveRun(i) && i.status === 'claimed' && yours.has(i.id));
        const into = waiting ?? running;
        if (into) {
          actions.push({ type: 'answer', teammate: tid, item: into.id, product: into.product, text: m.text, msg: m.id });
          actions.push({ type: 'seen', msg: m.id, teammate: tid, run: into.id });
          continue;
        }
      }
      // Where it came from travels with it: the project it was passed from, and
      // the thread that spoke for you, when one did.
      const origin = { ...(m.product ? { product: m.product } : {}), ...(m.via ? { via: m.via, viaProduct: m.viaProduct ?? null } : {}) };
      const trigger = m.kind === 'pass'
        ? { kind: 'pass', from: m.from, title: m.title, details: m.details, msg: m.id, hop, ...origin }
        : { kind: 'message', from: m.from, fromName: fromYou ? null : byId.get(m.from)?.name ?? null, text: m.text, msg: m.id, hop, ...origin, ...(fromYou && m.start ? { opening: 'start' } : fromYou && m.setup ? { opening: 'setup' } : {}) };
      const id = newRun(t, trigger, `${m.id}>${tid}`, { fromYou });
      if (id) actions.push({ type: 'seen', msg: m.id, teammate: tid, run: id });
    }
  }

  for (const t of live) {
    if (t.paused || t.status !== 'active' || !isWorks(t.works)) continue;
    const key = periodKey(t.works, now);
    if (!key || key <= servedOf(t)) continue;
    const id = newRun(t, { kind: 'schedule', key, label: t.works.every === 'week' ? 'week' : 'round' }, `${t.id}@${key}`);
    if (id) actions.push({ type: 'served', teammate: t.id, key });
  }

  for (const t of live) {
    if (t.paused || active(t)) continue;
    const next = runsOf(t.id, items).filter(isQueued).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))[0];
    if (next) actions.push({ type: 'release', teammate: t.id, item: next.id, product: next.product });
  }

  for (const tid of limited) actions.push({ type: 'limit', teammate: tid });
  return actions;
}

// ---------------------------------------------------------------- what you see

function verbFor(item, teammates) {
  const from = passedFromOf(item);
  if (from) {
    const who = teammates.find((t) => t.id === from);
    return { verb: 'passed', by: from, byName: who?.name ?? 'A teammate' };
  }
  return { verb: 'picked' };
}

// The lines a run leaves in the chat, read straight off the ledger so they can
// never disagree with it: picked up (or passed on), sent you, finished.
export function runLines(items, teammates = []) {
  const out = [];
  for (const item of items ?? []) {
    const tid = teammateIdOf(item);
    if (!tid) continue;
    const base = { teammate: tid, item: item.id, product: item.product, title: item.label || item.title };
    if (isQueued(item)) {
      out.push({ ...base, id: `${item.id}:queued`, kind: 'run', verb: 'queued', ts: item.createdAt ?? 0 });
      continue;
    }
    const v = verbFor(item, teammates);
    out.push({ ...base, id: `${item.id}:start`, kind: 'run', verb: v.verb, by: v.by, byName: v.byName, ts: item.wrote?.start?.ts ?? item.createdAt ?? 0 });
    const a = item.wrote?.answer;
    const said = typeof item.answer === 'string' ? item.answer.trim() : '';
    if (a && a.source === 'founder' && said && said !== '(withdrawn)') {
      out.push({ ...base, id: `${item.id}:answered`, kind: 'run', verb: 'answered', text: clip(said, 400), ts: a.ts });
    }
    const r = item.wrote?.result;
    if (r && r.source === 'agent' && !(item.labels ?? []).includes('clean')) {
      const answered = (item.wrote?.answer?.ts ?? 0) > r.ts;
      out.push({ ...base, id: `${item.id}:sent`, kind: 'run', verb: 'sent', waiting: waitingOnYou(item), answered, ts: r.ts });
    }
    if (item.status === 'done') {
      out.push({ ...base, id: `${item.id}:done`, kind: 'run', verb: 'finished', ts: item.wrote?.status?.ts ?? item.updatedAt ?? 0 });
    }
  }
  return out.sort((a, b) => a.ts - b.ts);
}

function startOfDay(now) {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// The panel beside a teammate: what is waiting on you, what it is on now, and
// what it finished today.
export function statusOf(teammate, items, now = Date.now()) {
  const runs = runsOf(teammate.id, items);
  const waiting = runs.filter(waitingOnYou).map((i) => ({ id: i.id, product: i.product, title: i.label || i.title }));
  const running = runs.find((i) => isActiveRun(i));
  const next = runs.filter(isQueued).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)).map((i) => ({ id: i.id, product: i.product, title: i.label || i.title }));
  const queued = next.length;
  const today = startOfDay(now);
  const done = runs
    .filter((i) => i.status === 'done' && (i.wrote?.status?.ts ?? i.updatedAt ?? 0) >= today)
    .map((i) => ({ id: i.id, product: i.product, title: i.label || i.title }));
  let now_ = null;
  if (running) now_ = running.label || running.title;
  else if (waiting.length) now_ = 'Waiting on you';
  else if (teammate.paused) now_ = 'Paused';
  return { waiting, now: now_, running: running ? { id: running.id, product: running.product } : null, queued, next, done, runsThisWeek: runsThisWeek(teammate.id, items, now) };
}

// ---------------------------------------------------------------- starters

// The six a new person can start from. Copy is plain and specific about what
// each one brings you, because that is what has to jump out.
export const STARTERS = [
  {
    starter: 'quality', name: 'Ada', role: 'Quality lead',
    outcome: 'Finds bugs before your users do',
    sends: 'A bug, with the steps to make it happen',
    job: 'Use the project the way a new user would, every weekday morning. Try the main flows on a phone-sized window and a slow connection. File anything broken with the exact steps to make it happen, and pass fixable bugs to whoever fixes things on the team.',
    goal: 'Nothing broken reaches a user',
    counted: 'Bugs users report that you did not find first',
    asksFirst: 'Before paying with a real card or signing in as a real person',
    works: { every: 'weekday', at: '09:00' },
  },
  {
    starter: 'maintainer', name: 'Felix', role: 'Maintainer',
    outcome: 'Fixes what gets filed, and asks you before shipping',
    sends: 'A fix that is ready to ship',
    job: 'Fix the bugs your teammates pass you and keep the project healthy: one branch per fix, with a test that fails before the fix and passes after. Never ship or merge without asking the person first.',
    goal: 'Every bug fixed within two days',
    counted: 'Days from a bug being filed to its fix being ready',
    asksFirst: 'Before shipping, merging, or deleting anything',
    works: null,
  },
  {
    starter: 'video', name: 'Vera', role: 'Video marketer',
    outcome: 'Brings you three video ideas a week, then makes the ones you pick',
    sends: 'Three video ideas for this week',
    job: 'Every Monday, bring the person three short video ideas about the project, not only about new features. When they pick one, write the script and a shot list, and make what you can. Nothing is posted without their yes.',
    goal: 'Post something worth watching three times a week',
    counted: 'Videos posted each week',
    asksFirst: 'Before anything is posted or sent in their name',
    works: { every: 'week', on: 1, at: '09:00' },
  },
  {
    starter: 'support', name: 'June', role: 'Support lead',
    outcome: 'Answers user emails, and asks you before any refund',
    sends: 'A refund or a tricky reply to approve',
    job: 'Read what users ask, draft clear answers, and keep a short list of what people get stuck on. Ask the person before any refund, promise or reply that commits them to something.',
    goal: 'Every user question answered the same day',
    counted: 'Questions still unanswered at the end of the day',
    asksFirst: 'Before any refund, promise, or reply that commits you',
    works: { every: 'weekday', at: '10:00' },
  },
  {
    starter: 'growth', name: 'Rui', role: 'Growth lead',
    outcome: 'Tells you what moved signups, and what to try next',
    sends: 'What moved signups this week',
    job: 'Every Friday, look at what changed in signups and usage this week, explain what moved it in plain words, and suggest one thing to try next week.',
    goal: 'One clear next step for growth every week',
    counted: 'Experiments tried each month',
    asksFirst: 'Before changing anything users can see',
    works: { every: 'week', on: 5, at: '15:00' },
  },
  {
    starter: 'fundraising', name: 'Hugo', role: 'Fundraiser',
    outcome: 'Finds investors who fit, and drafts intros from you',
    sends: 'Intro emails ready for your yes',
    job: 'Build and keep a short list of investors who fit the project, with why each one fits. Draft intro emails for the person to send. Never send anything yourself.',
    goal: 'First meetings with investors who fit',
    counted: 'First meetings booked',
    asksFirst: 'Before anything is sent in their name',
    works: { every: 'week', on: 2, at: '09:00' },
  },
];

// ---------------------------------------------------------------- the offer
// When you keep asking for the same kind of thing, the app offers a teammate
// for it: one inbox row, which no agent ever runs, answered by a tap.
export const OFFER_LABEL = 'teammate-offer';
export const OFFER_MAKE = 'Make a teammate for it';
export const OFFER_NOT_NOW = 'Not now';
const OFFER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const OFFER_AT_LEAST = 3;
const STOP = new Set(('the a an and or but for to of in on at by with from into onto about as is are was were be been it its this that these those '
  + 'my our your their me we you i us can could would should will please pls just also some any all new more make do does did get got let lets '
  + 'need want like have has had what which who how why when where there here then than them they not no yes ok okay one two three today tomorrow week').split(' '));

function wordsOf(title) {
  return new Set(String(title ?? '').toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)));
}

function alike(a, b) {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  return shared >= 2 && shared / Math.min(a.size, b.size) >= 0.6;
}

// Threads you wrote yourself in the last month: not a teammate's or a repeat's
// runs, not imported, not an offer.
function yourAsks(items, now) {
  return (items ?? []).filter((i) => {
    const labels = i.labels ?? [];
    if (!labels.includes('founder') || i.wrote?.labels?.source === 'agent') return false;
    if (labels.some((l) => /^(teammate|repeat|hop|from):/.test(l) || l === OFFER_LABEL || l === 'thread-import' || l === 'codex-import' || l === 'codex')) return false;
    return now - (i.createdAt ?? 0) <= OFFER_WINDOW_MS && wordsOf(i.title).size >= 2;
  });
}

/**
 * The offer to make now, if any: three or more of your own asks this month
 * alike enough to be one job, under a key no offer has used. One open offer at
 * a time, and one a day at most.
 */
export function offerFrom({ items = [], offered = new Set(), now = Date.now() } = {}) {
  const open = (items ?? []).filter((i) => (i.labels ?? []).includes(OFFER_LABEL));
  if (open.some((i) => i.status !== 'done' || now - (i.createdAt ?? 0) < 24 * 60 * 60 * 1000)) return null;
  const asks = yourAsks(items, now).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  const bags = new Map(asks.map((i) => [i.id, wordsOf(i.title)]));
  for (const lead of asks) {
    const group = asks.filter((i) => i === lead || alike(bags.get(lead.id), bags.get(i.id)));
    if (group.length < OFFER_AT_LEAST) continue;
    const counts = new Map();
    for (const i of group) for (const w of bags.get(i.id)) counts.set(w, (counts.get(w) ?? 0) + 1);
    const common = [...counts].filter(([, n]) => n >= Math.ceil(group.length / 2)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([w]) => w);
    const key = common.sort().join('-');
    if (!key || offered.has(key)) continue;
    const byProduct = new Map();
    for (const i of group) byProduct.set(i.product, (byProduct.get(i.product) ?? 0) + 1);
    const product = [...byProduct].sort((a, b) => b[1] - a[1])[0]?.[0] ?? lead.product;
    return {
      key, product, count: group.length,
      titles: group.slice(0, 5).map((i) => i.label || i.title),
      title: `Want a teammate for things like “${clip(lead.label || lead.title, 60)}”?`,
      said: `You've asked for this ${group.length} times this month.`,
    };
  }
  return null;
}

/** What a tap on the offer meant: 'make', 'dismiss', or your own words to make one from. */
export function offerAnswer(answer) {
  const said = String(answer ?? '').trim();
  if (!said || said === '(withdrawn)') return null;
  if (/not now|^no\b|^2\.?$/i.test(said)) return { kind: 'dismiss' };
  if (said.toLowerCase().includes(OFFER_MAKE.toLowerCase()) || /^1\.?$/.test(said) || /^(yes|yep|sure|ok|okay)\b/i.test(said)) return { kind: 'make' };
  return { kind: 'make', words: said };
}
