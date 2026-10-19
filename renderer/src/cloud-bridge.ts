// THE PHONE WITH THE MAC SHUT (docs/cloud/PHONE-PLAN.md, step 1).
//
// The same screens as the phone that talks to the Mac (browser-bridge.ts), on
// a site of their own, and a `window.zero` built out of her rows online
// instead of out of a Mac: the copies her Mac last sent of each thread of the
// projects she put on her phone, and the commands her phone has left for it.
//
// It does four things and nothing else (Codex's review, finding 13): it reads,
// and it leaves a reply, a new thread, a snooze or a close for her Mac. Each
// shows "Waiting for your Mac" until her Mac takes it. Every other door of the
// app answers as a door that is not here.
//
// The page has it only when the site's build put the cloud's public address
// in the page (`<meta name="agentbox-cloud">`, scripts/build-phone-site.mjs).
// The desktop window and the Mac's own phone page never have that.

import { REQUEST_CHANNELS, PUSH_CHANNELS, DESKTOP_ONLY } from '../../shared/bridge-map.mjs';
import { cloudClient, type CloudClient, type CloudConfig } from './cloud-rest';
import { installPhoneScreen } from './phone-screen';
import { atMostEvery } from './phone-polls';
import { madeHere, phoneChoices } from '../../shared/phone-snapshot.mjs';
import { statusForReply } from './list-rules';
import { setPictureLinks } from './picture';
import { sendFiles, sentFileName, sentNamesIn } from './phone-sends-files';
import { BUCKET, cloudPlaces, findFile, homeOf, installCloudFiles, keyAt, pageForPhone, pageStyles, withStyles, type Place } from './cloud-files';

type Push = (payload: unknown) => void;

export interface PhoneRows {
  projects: { device: string; project: string; name: string; updated_at?: string }[];
  threads: { device: string; project: string; item: string; snapshot: any; updated_at?: string }[];
  commands: { id: string; device: string; project: string; item: string | null; kind: string; payload: any; created_at: string; claimed_at?: string | null; taken_at: string | null; outcome: string | null }[];
}

export interface Waiting { product: string; id: string; at: number; text: string; refused?: string }

// How long a refusal stays on her screen: long enough to be read the next time
// she looks, not forever.
const REFUSAL_SHOWN_MS = 24 * 3600_000;
const LANDING_SHOWN_MS = 2 * 3600_000;
// A run the Mac has not said is still going for this long is not drawn as
// running: the Mac went to sleep or lost the network mid-run, and its copy
// online would otherwise say "working" forever (main/phone-inbox.mjs sends it
// every two minutes while it runs).
const LIVE_FOR_MS = 10 * 60_000;
export const UNDONE = 'refused: taken back on the phone';
// A PROJECT ON THE PHONE IS A PROJECT ON ONE COMPUTER (Codex's review of
// step 1, finding 4): the screens know it by its name there and that
// computer's id together, so two computers' projects of the same name stay two.
export const phoneSlug = (device: string, project: string) => `${project}@${device}`;
export function splitSlug(slug: string): { device: string; project: string } | null {
  const m = /^(.+)@([0-9a-f]{12})$/.exec(String(slug));
  return m ? { project: m[1], device: m[2] } : null;
}

// THE SAME THREAD ID ON TWO COMPUTERS (a store copied from one to the other)
// would be one row to the screens, which pick, pin and close by id (Codex's
// second review, finding 6). The first keeps its id; every other gets one of
// its own, made from where it lives, and is turned back at the boundary.
const fnv = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
};
const aliasFor = (slug: string, item: string, n: number) => `w-${(fnv(`${slug}/${item}/${n}`) + fnv(`${n}/${item}/${slug}`)).slice(0, 10)}`;
export type Aliases = Record<string, { product: string; item: string }>;
/** The thread a screen's id stands for, in its project. */
export const realItem = (aliases: Aliases, product: string, id: string) => (aliases[id]?.product === product ? aliases[id].item : id);

/**
 * Her rows, as the inbox draws them: each thread as her computer last saw it,
 * with what she did on the phone since laid over it. A close or a snooze moves
 * the row at once; a new thread is a row of its own; a reply is a message of
 * hers in the thread, marked as waiting. What her computer turned down says
 * why, for a day after it did (second review, finding 9).
 */
export function phoneView(rows: PhoneRows, now = Date.now()) {
  const names = new Map(rows.projects.map((p) => [phoneSlug(p.device, p.project), p.name]));
  // Each project's stand-in folders, so a path in a message finds its file here (cloud-files.ts).
  const places = cloudPlaces(rows.threads, phoneSlug);
  const products = rows.projects.map((p) => {
    const slug = phoneSlug(p.device, p.project);
    return { slug, name: p.name, dir: places.get(slug)?.dir ?? '', oneLiner: '', repoPath: places.get(slug)?.repo ?? '' };
  });
  const items = new Map<string, any>();
  const screenId = new Map<string, string>();
  const aliases: Aliases = {};
  const approvals: { id: string; at: number; product: string; item: string; tool: string; input: Record<string, unknown> }[] = [];
  const cards: Cards = {};
  // Every real id, and every id a new thread waiting on the phone shows under,
  // is spoken for before any stand-in is made, and a stand-in is never one of
  // them (Codex's third review, finding 6).
  const taken = new Set<string>([...rows.threads.map((t) => t.item), ...rows.commands.filter((c) => c.kind === 'new').map((c) => madeHere(c.id))]);
  const used = new Set<string>();
  const running: any[] = [];
  const threads = [...rows.threads].sort((a, b) => `${a.device}/${a.project}`.localeCompare(`${b.device}/${b.project}`));
  for (const t of threads) {
    const slug = phoneSlug(t.device, t.project);
    if (!names.has(slug) || !t.snapshot?.item) continue;
    let id = t.item;
    if (used.has(id)) {
      let n = 0;
      do { id = aliasFor(slug, t.item, n); n += 1; } while (taken.has(id) || used.has(id));
      aliases[id] = { product: slug, item: t.item };
    }
    used.add(id);
    screenId.set(`${slug}/${t.item}`, id);
    items.set(`${slug}/${t.item}`, { ...t.snapshot.item, id, product: slug, productName: names.get(slug) });
    // Its permission cards, but not one she has answered here already.
    for (const a of Array.isArray(t.snapshot.approvals) ? t.snapshot.approvals : []) {
      if (!a?.id || !a.card || rows.commands.some((c) => c.kind === 'approve' && c.payload?.approval === a.id && !c.taken_at)) continue;
      approvals.push({ id: String(a.id), at: Number(a.at) || 0, product: slug, item: id, tool: String(a.tool ?? 'unknown'), input: a.input ?? {} });
      cards[a.id] = { device: t.device, project: t.project, item: t.item, card: String(a.card) };
    }
    const live = t.snapshot.live;
    if (live && now - Number(live.at) < LIVE_FOR_MS) {
      running.push({
        itemId: id, product: slug, startedAt: Number(live.since) || 0,
        ...(live.where === 'cloud' ? { where: 'cloud' } : {}),
        tail: [],
        activity: (Array.isArray(live.doing) ? live.doing : []).map((d: any, i: number) => ({ id: `live-${i}`, label: String(d?.label ?? ''), detail: '', startedAt: Number(d?.startedAt) || 0 })),
      });
    }
  }
  const waiting: Waiting[] = [];
  const ordered = [...rows.commands].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  for (const c of ordered) {
    const at = Date.parse(c.created_at) || now;
    const refused = c.outcome?.startsWith('refused') ? c.outcome.replace(/^refused:\s*/, '') : null;
    const takenAt = c.taken_at ? Date.parse(c.taken_at) || at : null;
    // A reply her Mac took shows until a copy of its thread made after that arrives.
    const copyAt = Date.parse(rows.threads.find((t) => t.device === c.device && t.project === c.project && t.item === c.item)?.updated_at ?? '') || 0;
    const landing = c.kind === 'reply' && c.outcome === 'done' && takenAt !== null && copyAt < takenAt && now - takenAt < LANDING_SHOWN_MS;
    if (takenAt !== null && !landing && !(refused && now - takenAt < REFUSAL_SHOWN_MS)) continue;
    // Taken back on the phone: nothing to show.
    if (c.outcome === UNDONE) continue;
    const slug = phoneSlug(c.device, c.project);
    const key = `${slug}/${c.item}`;
    const row = items.get(key);
    const id = screenId.get(key) ?? c.item;
    const said = (text: string) => waiting.push({ product: slug, id: id as string, at, text, ...(refused ? { refused } : {}) });
    if (c.kind === 'reply' && c.item) {
      said(String(c.payload?.text ?? ''));
      // Answered, as the window marks a row the moment she sends, so it is In
      // progress until her Mac takes it and its own copy says what happened.
      if (row && !refused) items.set(key, { ...row, status: statusForReply(row.status) ?? row.status, answer: String(c.payload?.text ?? ''), wrote: { ...row.wrote, answer: { ts: at, source: 'founder' } }, updatedAt: at });
    }
    else if (refused && c.item && (c.kind === 'close' || c.kind === 'snooze')) {
      said(c.kind === 'close' ? 'Close this thread' : Number(c.payload?.until) > 0 ? 'Move to Later' : 'Bring back from Later');
    } else if (c.kind === 'close' && row) items.set(key, { ...row, status: 'done', updatedAt: at });
    else if (c.kind === 'snooze' && row) items.set(key, { ...row, snoozedUntil: Number(c.payload?.until) || null, updatedAt: at });
    else if (c.kind === 'new' && names.has(slug)) {
      const made = madeHere(c.id);
      items.set(`${slug}/${made}`, {
        id: made, product: slug, productName: names.get(slug), title: String(c.payload?.title || c.payload?.body || '').slice(0, 200),
        body: String(c.payload?.body ?? ''), kind: 'directive', labels: ['founder'], priority: 0, createdAt: at, updatedAt: at,
        ...(refused ? { status: 'blocked', result: `Your computer could not start this: ${refused}` } : { status: 'open', waitsForMac: true }),
      });
    }
  }
  return { products, items: [...items.values()], waiting, aliases, running, places, approvals, cards };
}

const THREADS_MAX = 3000;
type ThreadRow = PhoneRows['threads'][number];
/**
 * Her threads, fetching only the copies new or changed since `cache` had them:
 * a light list of when each last changed, then the changed copies at once.
 * `cache` is kept up to date, and a thread gone from the list leaves it.
 */
export async function readThreads(select: (table: string, query: string) => Promise<any[]>, cache: Map<string, ThreadRow>): Promise<ThreadRow[]> {
  const keyOf = (t: { device: string; project: string; item: string }) => `${t.device}/${t.project}/${t.item}`;
  const light: ThreadRow[] = await select('phone_threads', `select=device,project,item,updated_at&order=updated_at.desc&limit=${THREADS_MAX}`);
  const changed = light.filter((t) => cache.get(keyOf(t))?.updated_at !== t.updated_at);
  if (changed.length) {
    const since = changed.map((t) => String(t.updated_at ?? '')).sort()[0];
    const fresh: ThreadRow[] = await select('phone_threads', `select=device,project,item,snapshot,updated_at${since ? `&updated_at=gte.${encodeURIComponent(since)}` : ''}&order=updated_at.desc&limit=${THREADS_MAX}`);
    for (const t of fresh) cache.set(keyOf(t), t);
  }
  const here = new Set(light.map(keyOf));
  for (const k of [...cache.keys()]) if (!here.has(k)) cache.delete(k);
  return light.map((t) => cache.get(keyOf(t))).filter((t): t is ThreadRow => !!t);
}

// Each card drawn on the phone: where it is, and the fingerprint her Mac drew it with.
export type Cards = Record<string, { device: string; project: string; item: string; card: string }>;
/** Her answer to a card, for her Mac, carrying the fingerprint it was drawn with; null for a card never drawn. */
export function approvalCommand(cards: Cards, p: { id: string; allow: boolean; note?: string }) {
  const c = cards[p?.id];
  if (!c) return null;
  return { device: c.device, project: c.project, item: c.item, kind: 'approve', payload: { approval: p.id, allow: p.allow === true, ...(typeof p.note === 'string' && p.note ? { note: p.note } : {}), card: c.card } };
}

/** The thread's lines as her computer sent them, for the thread view. */
export function phoneHistory(rows: PhoneRows, product: string, id: string, aliases: Aliases = {}) {
  const item = realItem(aliases, product, id);
  const t = rows.threads.find((r) => phoneSlug(r.device, r.project) === product && r.item === item);
  return { ok: true, lines: Array.isArray(t?.snapshot?.history) ? t.snapshot.history.map((l: any) => ({ ...l, id })) : [] };
}

/** What one press on the phone leaves for her Mac, or null for a press that is not one of the four. */
// UNDO OF A CLOSE MADE ON THE PHONE takes the close back while it is still
// waiting: the phone marks its own command taken, as undone, and the computer
// never sees it. Once the computer has closed the thread, undoing is the
// computer's. Returns the command to take back, or null.
export function closeToTakeBack(rows: PhoneRows, channel: string, p: any, aliases: Aliases = {}) {
  if (channel !== REQUEST_CHANNELS.answer || p?.status !== 'open' || (typeof p.answer === 'string' && p.answer.trim())) return null;
  return waitingFor(rows, p, aliases, 'close');
}

// The same for a reply, when the window stops the agent to undo it, and for a
// new thread, closed by the id the inbox drew it with.
export function takeBack(rows: PhoneRows, channel: string, p: any, aliases: Aliases = {}) {
  if (channel === REQUEST_CHANNELS.stopSession) return p?.withdraw ? waitingFor(rows, p, aliases, 'reply') : null;
  if (channel === REQUEST_CHANNELS.answer && p?.status === 'done' && !(typeof p.answer === 'string' && p.answer.trim())) {
    const where = splitSlug(p.product);
    return rows.commands.find((c) => c.kind === 'new' && !c.taken_at && !c.claimed_at && c.device === where?.device && c.project === where?.project && madeHere(c.id) === p.id) ?? null;
  }
  return closeToTakeBack(rows, channel, p, aliases);
}

function waitingFor(rows: PhoneRows, p: any, aliases: Aliases, kind: string) {
  const where = splitSlug(p?.product);
  if (!where) return null;
  const item = realItem(aliases, p.product, p.id);
  return rows.commands.filter((c) => c.kind === kind && !c.taken_at && !c.claimed_at && c.device === where.device && c.project === where.project && c.item === item).at(-1) ?? null;
}

export function commandFor(channel: string, p: any, aliases: Aliases = {}): { device: string; project: string; item: string | null; kind: string; payload: Record<string, unknown> } | null {
  const where = splitSlug(p?.product);
  if (!where) return null;
  const on = (item: string | null, kind: string, payload: Record<string, unknown>) => ({ ...where, item: item === null ? null : realItem(aliases, p.product, item), kind, payload });
  if (channel === REQUEST_CHANNELS.answer) {
    if (typeof p.answer === 'string' && p.answer.trim()) return on(p.id, 'reply', { text: p.answer, ...phoneChoices('reply', p) });
    if (p.status === 'done') return on(p.id, 'close', {});
    return null;
  }
  if (channel === REQUEST_CHANNELS.snooze && Number.isFinite(p.snoozedUntil) && p.snoozedUntil >= 0) return on(p.id, 'snooze', { until: p.snoozedUntil });
  if (channel === REQUEST_CHANNELS.schedule && Number.isFinite(p.runAt) && p.runAt >= 0) return on(p.id, 'schedule', { runAt: p.runAt });
  const plain: Record<string, string> = { [REQUEST_CHANNELS.stopSession]: 'stop', [REQUEST_CHANNELS.runNow]: 'run-now', [REQUEST_CHANNELS.sendNow]: 'send-now', [REQUEST_CHANNELS.reopen]: 'reopen' };
  if (plain[channel] && p.id) return on(p.id, plain[channel], {});
  if (channel === REQUEST_CHANNELS.compose && (String(p.title ?? '').trim() || String(p.body ?? '').trim())) {
    return on(null, 'new', { title: String(p.title ?? ''), body: String(p.body ?? ''), ...phoneChoices('new', p) });
  }
  return null;
}

// THE DOORS THAT ONLY READ, answered here as a door with nothing behind it.
// Every other door changes something on her computer that the phone cannot
// reach, so it says so rather than answering as if it had (Codex's review of
// step 1, finding 7: Stop said the agent stopped when nothing had).
const READS = new Set([
  'refreshUsage', 'assistiveTech', 'olderItems', 'commandCatalog', 'compactionStatus',
  'firstRunExamples', 'firstRunWalking', 'listFolders', 'folderExists', 'agentFiles', 'agentFolders',
  'agentThreads', 'cornerTag', 'bootInfo', 'updateCheck', 'instructionRead', 'instructionHistory',
  'instructionVersion', 'standingRead', 'messageRulesRead', 'settingsRead', 'engineBin',
  'cloudClipboardCode', 'projectInstructionsRead', 'codeFile', 'railNote',
  'agentConversation', 'phoneLink', 'teamStatus',
  // Where she dragged a row or a project to: kept on this page, not sent.
  'setThreadPlaces', 'setThreadPins', 'setProductOrder', 'setProductHidden',
]);
const ago = (ms: number) => {
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
};
// Her Mac writes its projects again every five minutes (main/phone-inbox.mjs),
// so one quiet for longer than this is away.
const MAC_AWAY_MS = 15 * 60_000;
/** The line over her inbox when what it shows may be out of date, or null. */
export function phoneStatusLine({ error, fetchedAt, macSeen }: { error: string | null; fetchedAt: number; macSeen: number }, now = Date.now()): string | null {
  if (error) return `Can't reach your inbox online.${fetchedAt ? ` This is how it was ${ago(now - fetchedAt)}.` : ''}`;
  if (macSeen && now - macSeen > MAC_AWAY_MS) return `Your Mac was last online ${ago(now - macSeen)}. What you send waits for it.`;
  return null;
}
/** When the most recently seen of her computers last wrote its projects. */
export const macSeenOf = (projects: { updated_at?: string }[]) => Math.max(0, ...projects.map((p) => Date.parse(p.updated_at ?? '') || 0));

export const NOT_HERE = 'Your computer does this. Your phone can reply, start a thread, close, and move things to Later.';

export function readCloudConfig(doc: Document = document): CloudConfig | null {
  const raw = doc.querySelector('meta[name="agentbox-cloud"]')?.getAttribute('content');
  if (!raw) return null;
  try {
    const c = JSON.parse(raw);
    return typeof c?.url === 'string' && typeof c?.anonKey === 'string' ? { url: c.url, anonKey: c.anonKey } : null;
  } catch { return null; }
}

/** A folder a message names, among those her Mac listed: its full path here and its pictures' keys. */
function findFolder(place: Place, src: string): { folder: string; keys: string[] } | null {
  let raw = String(src ?? '').replace(/^file:\/\//, '').replace(/\/+$/, '');
  try { raw = decodeURIComponent(raw); } catch { /* as written */ }
  const full = raw.startsWith('~/') ? `${homeOf(place.device)}${raw.slice(1)}` : raw;
  const key = full.startsWith(`${place.dir}/`) ? full.slice(place.dir.length + 1) : full.startsWith(`${place.repo}/`) && place.repo ? `@repo/${full.slice(place.repo.length + 1)}` : full.replace(/^\.\//, '');
  const keys = place.folders.get(`${key}/`);
  return keys ? { folder: key.startsWith('@repo/') ? `${place.repo}/${key.slice(6)}` : `${place.dir}/${key}`, keys } : null;
}

const LINK_LIFE_MS = 12 * 3600_000;
// The bucket's own bound on a file (20261017000000_phone_files.sql).
const SEND_MAX_BYTES = 25 * 1024 * 1024;
const LINK_RENEW_MS = 3600_000;

const SUPERVISOR = { paused: false, pausedProducts: [], running: [], stalled: [], queued: [], scheduled: [], productOrder: [], hiddenProducts: [], personalProducts: [], capacity: 0 };
const EMPTY_ROWS: PhoneRows = { projects: [], threads: [], commands: [] };

export function installCloudBridge(cfg: CloudConfig | null = typeof document === 'undefined' ? null : readCloudConfig()): boolean {
  if (!cfg || typeof window === 'undefined' || (window as any).zero) return false;
  const client: CloudClient = cloudClient(cfg, { storage: localStorage, fetchImpl: (u, i) => fetch(u, i) });
  document.documentElement.dataset.door = 'phone';
  document.documentElement.dataset.via = 'cloud';
  document.documentElement.dataset.shell = 'tab';
  installPhoneScreen();
  // There is nothing to walk through here: her projects are on her Mac.
  try { localStorage.setItem('zero.firstRun.done', '1'); } catch { /* private mode */ }

  let rows: PhoneRows = EMPTY_ROWS;
  let started = false;
  // The screen ids of threads that share an id with another computer's.
  let aliases: Aliases = {};
  let error: string | null = null;
  let last = '';
  // Her files' links, by name in the bucket, each signed for twelve hours and
  // asked for again an hour before it runs out, so a film is not pulled from
  // under her mid-play by a new link; and each page made ready.
  let places = new Map<string, Place>();
  const links = new Map<string, { url: string; until: number }>();
  // A page made ready is good while every file it points at keeps its name
  // and its link; at most a few are kept.
  const pages = new Map<string, { url: string; keys: string[]; names: string; until: number }>();
  const dropPage = (key: string) => { const p = pages.get(key); if (p) URL.revokeObjectURL(p.url); pages.delete(key); };
  const objectOf = (place: Place, name: string) => `${client.session()?.user.id}/${place.device}/${name}`;
  async function signLinks() {
    const want: string[] = [];
    const stale = (n: string) => !((links.get(n)?.until ?? 0) - Date.now() > LINK_RENEW_MS);
    for (const place of places.values()) for (const e of place.files.values()) {
      if (e.n && stale(e.n)) want.push(objectOf(place, e.n));
    }
    // What she sent that her computer has not taken yet, drawn from where she put it.
    for (const c of rows.commands) {
      if (c.taken_at) continue;
      for (const n of sentNamesIn(String(c.payload?.text ?? c.payload?.body ?? ''))) if (stale(n)) want.push(`${client.session()?.user.id}/${c.device}/${n}`);
    }
    const asked = client.generation();
    for (let i = 0; i < want.length; i += 300) {
      const got = await client.signFiles(BUCKET, [...new Set(want.slice(i, i + 300))], LINK_LIFE_MS / 1000);
      if (client.generation() !== asked) return;
      for (const [object, url] of got) links.set(object.slice(object.lastIndexOf('/') + 1), { url, until: Date.now() + LINK_LIFE_MS });
    }
  }
  const linkOfEntry = (n?: string) => (n ? links.get(n)?.url ?? null : null);
  const linkFor = (file: string) => {
    const sent = sentFileName(file);
    if (sent) return linkOfEntry(sent);
    const at = keyAt(places, file);
    return at ? linkOfEntry(at.place.files.get(at.key)?.n) : null;
  };
  setPictureLinks(linkFor);
  installCloudFiles(linkFor);
  const listeners = new Map<string, Set<Push>>();
  const deliver = (channel: string, payload?: unknown) => {
    for (const fn of listeners.get(channel) ?? []) { try { fn(payload); } catch { /* its own fault */ } }
  };
  const changed = atMostEvery(1000, (payload?: unknown) => deliver(PUSH_CHANNELS.onChanged, payload));

  const COMMANDS = 'select=id,device,project,item,kind,payload,created_at,claimed_at,taken_at,outcome&order=created_at';
  // Every command still waiting, however old (Codex's review of step 1,
  // finding 10), and those taken in the last two days, for what they say.
  async function commands() {
    const waiting: PhoneRows['commands'] = [];
    for (let from = 0; ; from += 500) {
      const page = await client.select('phone_commands', `${COMMANDS}&taken_at=is.null&offset=${from}&limit=500`);
      waiting.push(...page);
      if (page.length < 500) break;
    }
    const since = new Date(Date.now() - 2 * 24 * 3600_000).toISOString();
    const done = await client.select('phone_commands', `${COMMANDS}&taken_at=gte.${since}&limit=500`);
    return [...waiting, ...done];
  }

  // One read at a time: on a slow network a read can outlast the five seconds between them.
  let reading: Promise<void> | null = null;
  // Her threads' copies as last fetched; a read fetches only what changed since.
  const threadCache = new Map<string, PhoneRows['threads'][number]>();
  let fetchedAt = 0;
  function refresh() {
    if (reading) return reading;
    reading = readRows().finally(() => { reading = null; });
    return reading;
  }
  async function readRows() {
    if (!client.signedIn()) { rows = EMPTY_ROWS; return; }
    const asked = client.generation();
    try {
      const [projects, threads, cmds] = await Promise.all([
        client.select('phone_projects', 'select=device,project,name,updated_at&order=name'),
        readThreads((table, query) => client.select(table, query), threadCache),
        commands(),
      ]);
      // Read for a sign-in that has since ended: not hers to show.
      if (client.generation() !== asked) { threadCache.clear(); return; }
      rows = { projects, threads, commands: cmds };
      places = cloudPlaces(threads, phoneSlug);
      error = null;
      fetchedAt = Date.now();
      // Links before the screens draw, so a picture is pointed at its file the moment it is drawn.
      await signLinks().catch(() => { /* the pictures say missing, the words still read */ });
    } catch (err) {
      if (client.generation() !== asked) return;
      if (!client.signedIn()) rows = EMPTY_ROWS;
      error = String((err as Error)?.message ?? err);
    }
    // A run going stale changes nothing online, and still has to stop being drawn.
    const fresh = rows.threads.map((t) => !!t.snapshot?.live && Date.now() - Number(t.snapshot.live.at) < LIVE_FOR_MS);
    const key = JSON.stringify([rows.threads.map((t) => [t.item, t.updated_at]), fresh, links.size, rows.commands.map((c) => [c.id, c.taken_at]), rows.projects, error, client.signedIn(), phoneStatusLine({ error, fetchedAt, macSeen: macSeenOf(rows.projects) })]);
    if (key !== last) { last = key; changed(null); }
  }

  // WHILE SHE IS LOOKING, every five seconds; nothing while the page is hidden.
  // Live updates are step 3.
  const tick = () => { if (document.visibilityState === 'visible') void refresh(); };
  setInterval(tick, 5000);
  document.addEventListener('visibilitychange', tick);

  // Back from Google with a code: finish signing in, and take the code out of
  // the address bar (it is spent, and a screenshot should not carry it).
  const code = new URL(location.href).searchParams.get('code');
  const boot = (async () => {
    if (code) {
      const url = new URL(location.href);
      url.searchParams.delete('code');
      history.replaceState(history.state, '', url.toString());
      try { await client.finishGoogle(code); } catch (err) { error = String((err as Error)?.message ?? err); }
    }
    await refresh();
    started = true;
    changed(null);
  })();

  const team = () => (client.signedIn()
    // Signed in, the page is the single-person app's: no team pages here.
    ? null
    : { configured: true, started, signedIn: false, signingIn: null, me: null, team: null, invites: [], sent: [], people: [], cards: [], lastSyncAt: null, error });

  // Threads whose reply was just taken back: the window's own undo goes on to
  // put the schedule back and send "(withdrawn)", none of which the Mac saw.
  const withdrawn = new Map<string, number>();
  const leave = async (channel: string, payload: any) => {
    const back = takeBack(rows, channel, payload, aliases);
    if (back) {
      const asked = client.generation();
      // Only while the computer has not claimed it (Codex's third review, finding 3).
      const done = await client.update('phone_commands', `id=eq.${encodeURIComponent(back.id)}&taken_at=is.null&claimed_at=is.null`, { taken_at: new Date().toISOString(), outcome: UNDONE });
      if (!done.length) throw new Error('Your computer already has it. Reopen it there.');
      if (client.generation() === asked) rows = { ...rows, commands: rows.commands.map((c) => (c.id === back.id ? done[0] : c)) };
      if (back.kind === 'reply') withdrawn.set(`${payload.product}/${payload.id}`, Date.now());
      changed(null);
      return { ok: true };
    }
    if ((withdrawn.get(`${payload?.product}/${payload?.id}`) ?? 0) > Date.now() - 60_000
      && (channel === REQUEST_CHANNELS.schedule || (channel === REQUEST_CHANNELS.answer && (payload?.answer === '(withdrawn)' || !String(payload?.answer ?? '').trim())))) return { ok: true };
    if (channel === REQUEST_CHANNELS.stopSession && payload?.withdraw) throw new Error('Your computer already has it. Undo it there.');
    const cmd = commandFor(channel, channel === REQUEST_CHANNELS.answer && scheduled(payload) ? { ...payload, unschedule: true } : payload, aliases);
    if (!cmd) throw new Error(NOT_HERE);
    const asked = client.generation();
    const row = await client.insertCommand(cmd);
    if (client.generation() === asked) rows = { ...rows, commands: [...rows.commands, row] };
    if (cmd.kind === 'reply' && cmd.payload.unschedule) replied.set(`${payload.product}/${payload.id}`, Date.now());
    changed(null);
    // The row the inbox draws for a new thread until her Mac makes it, so it has Undo and Open.
    if (cmd.kind === 'new') return { id: madeHere(row.id), product: payload.product, title: String(cmd.payload.title || cmd.payload.body || '').slice(0, 200), body: String(cmd.payload.body ?? ''), status: 'open', kind: 'directive', labels: ['founder'], priority: 0, createdAt: Date.now(), updatedAt: Date.now() };
    return { ok: true };
  };
  // A reply to a thread put off clears the schedule on her Mac (phone-inbox.mjs
  // ROUTES), so the window's clearing call right after it has nothing to do.
  const replied = new Map<string, number>();
  const scheduled = (p: any) => {
    const item = realItem(aliases, p?.product, p?.id);
    const t = rows.threads.find((r) => phoneSlug(r.device, r.project) === p?.product && r.item === item)?.snapshot?.item;
    return Math.max(Number(t?.runAt) || 0, Number(t?.snoozedUntil) || 0) > Date.now();
  };
  const signedInThen = async (fn: () => Promise<unknown>) => {
    try { await fn(); error = null; await refresh(); changed(null); return { ok: true }; } catch (err) { return { ok: false, error: String((err as Error)?.message ?? err) }; }
  };

  const bridge: Record<string, unknown> = {};
  // A door that reads answers as one with nothing behind it: the screens treat
  // a null as "nothing to show". Every other door says it is not here.
  for (const name of Object.keys(REQUEST_CHANNELS)) bridge[name] = READS.has(name) ? async () => null : async () => { throw new Error(NOT_HERE); };
  for (const name of DESKTOP_ONLY) bridge[name] = () => null;
  for (const [name, channel] of Object.entries(PUSH_CHANNELS)) {
    bridge[name] = (fn: Push) => {
      const set = listeners.get(channel) ?? new Set<Push>();
      listeners.set(channel, set);
      set.add(fn);
      return () => set.delete(fn);
    };
  }

  Object.assign(bridge, {
    async snapshot() {
      await boot;
      const view = phoneView(rows);
      aliases = view.aliases;
      return {
        products: view.products, items: view.items, phoneWaiting: view.waiting,
        phoneStatus: client.signedIn() ? phoneStatusLine({ error, fetchedAt, macSeen: macSeenOf(rows.projects) }) : null,
        team: team(), agents: [], approvals: view.approvals, supervisor: { ...SUPERVISOR, running: view.running, productOrder: view.products.map((p) => p.slug) },
        engines: null, runsOn: null, restartNeeded: null, cloud: null,
        config: { browserHome: '', browserPins: [], outsideAgents: 'off' },
      };
    },
    itemHistory: async ({ product, id, before }: { product: string; id: string; before?: number }) => {
      const read = phoneHistory(rows, product, id, aliases);
      return Number.isFinite(before) ? { ...read, lines: read.lines.filter((l: any) => l.ts <= (before as number)) } : read;
    },
    // Whether Claude Code or Codex has an update is the computer's to say;
    // starting one is the computer's to do.
    agentUpdate: async (p: any) => { if (p?.action === 'start') throw new Error(NOT_HERE); return null; },
    sessionTrace: async () => ({ sessions: [] }),
    repeats: async () => [],
    // Her Mac runs the agents; nothing here asks her to set one up.
    engineSetup: async () => ({ ok: true, phase: 'ready', found: true, signedIn: true }),
    dashboard: async () => null,
    codeChange: async () => ({ ok: false }),
    answer: (p: unknown) => leave(REQUEST_CHANNELS.answer, p),
    stopSession: (p: unknown) => leave(REQUEST_CHANNELS.stopSession, p),
    // Allow and Deny go to her Mac with the card they answer (phone-inbox.mjs).
    approve: async (p: { id: string; allow: boolean; note?: string }) => {
      const cmd = approvalCommand(phoneView(rows).cards, p);
      if (!cmd) return { ok: false, error: 'This card is no longer waiting.' };
      try {
        const asked = client.generation();
        const row = await client.insertCommand(cmd);
        if (client.generation() === asked) rows = { ...rows, commands: [...rows.commands, row] };
        changed(null);
        return { ok: true };
      } catch (err) { return { ok: false, error: String((err as Error)?.message ?? err) }; }
    },
    runNow: (p: unknown) => leave(REQUEST_CHANNELS.runNow, p),
    sendNow: (p: unknown) => leave(REQUEST_CHANNELS.sendNow, p),
    reopen: (p: unknown) => leave(REQUEST_CHANNELS.reopen, p),
    schedule: async (p: any) => {
      if (p?.runAt === 0 && (replied.get(`${p.product}/${p.id}`) ?? 0) > Date.now() - 60_000) return { ok: true };
      return leave(REQUEST_CHANNELS.schedule, p);
    },
    snooze: (p: unknown) => leave(REQUEST_CHANNELS.snooze, p),
    compose: (p: unknown) => leave(REQUEST_CHANNELS.compose, p),
    badge: async () => null,
    notify: async () => null,
    track: async () => null,
    crash: async () => null,
    teamSignIn: () => signedInThen(async () => { location.assign(await client.googleUrl(`${location.origin}${location.pathname}`)); }),
    teamSignInCancel: async () => ({ ok: true }),
    teamSignInReopen: async () => ({ ok: true }),
    teamSignInEmail: ({ email, password }: { email: string; password: string }) => signedInThen(() => client.signInWithPassword(email, password)),
    teamSignUp: ({ name, email, password }: { name: string; email: string; password: string }) => signedInThen(async () => {
      const out = await client.signUp(name, email, password);
      if (out.confirm) throw new Error('Check your email to confirm it, then sign in here.');
    }),
    teamSignOut: async () => {
      client.signOut(); rows = EMPTY_ROWS; error = null; threadCache.clear();
      places = new Map(); links.clear();
      for (const key of [...pages.keys()]) dropPage(key);
      changed(null);
      return { ok: true };
    },
    // A picture in a reply goes to her storage first (phone-sends-files.ts).
    saveAttachments: async ({ product, files }: { product: string; files: Array<{ name: string; dataBase64?: string }> }) => {
      const where = splitSlug(product);
      const owner = client.session()?.user.id;
      if (!where || !owner) throw new Error(NOT_HERE);
      return sendFiles({ put: (object, bytes, type) => client.putFile(BUCKET, object, bytes, type), owner, device: where.device, files, maxBytes: SEND_MAX_BYTES });
    },
    // HER FILES, from the links her Mac's list gives (cloud-files.ts).
    openArtifact: async (p: { product: string; src: string; mode?: string }) => {
      const sent = sentFileName(p?.src);
      if (sent) {
        const link = linkOfEntry(sent);
        if (!link) return { ok: false, error: 'This file is still on its way.' };
        if (p.mode !== 'resolve') window.open(link, '_blank', 'noopener');
        return { ok: true, opened: p.src };
      }
      const found = findFile(places, p?.product, p?.src);
      if (!found) return { ok: false, error: 'This file is on your computer.' };
      if (found.entry.big) return { ok: false, error: 'This file is too big for your phone. Open it on your computer.' };
      const link = linkOfEntry(found.entry.n);
      if (!link) return { ok: false, error: 'This file is on its way from your computer.' };
      if (p.mode === 'resolve') {
        if (!/\.html?$/i.test(found.key)) return { ok: true, opened: found.file };
        const cacheKey = `${client.session()?.user.id}|${p.product}|${found.key}`;
        const namesOf = (keys: string[]) => keys.map((k) => found.place.files.get(k)?.n ?? '').join('|');
        const kept = pages.get(cacheKey);
        if (kept && kept.until > Date.now() && kept.names === namesOf(kept.keys)) return { ok: true, opened: found.file, url: kept.url };
        dropPage(cacheKey);
        const asked = client.generation();
        const used = new Set<string>([found.key]);
        // Every file it names counts, here or not yet, so one that arrives later makes the page again.
        const linkOf = (key: string) => { used.add(key); return linkOfEntry(found.place.files.get(key)?.n); };
        const read = async (url: string) => { const res = await fetch(url); if (!res.ok) throw new Error('This page could not be read.'); return res.text(); };
        try {
          let html = await read(link);
          const styles = new Map<string, string>();
          for (const key of pageStyles(html, found.key)) {
            const l = linkOf(key);
            if (l) styles.set(key, await read(l).catch(() => ''));
          }
          if (client.generation() !== asked) return { ok: false, error: 'You signed out.' };
          html = pageForPhone(withStyles(html, found.key, styles, linkOf), found.key, linkOf);
          const until = Math.min(Infinity, ...[...used].map((k) => links.get(found.place.files.get(k)?.n ?? '')?.until).filter((u): u is number => !!u)) - LINK_RENEW_MS;
          const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
          pages.set(cacheKey, { url, keys: [...used], names: namesOf([...used]), until });
          while (pages.size > 12) dropPage(pages.keys().next().value!);
          return { ok: true, opened: found.file, url };
        } catch (err) {
          return { ok: false, error: String((err as Error)?.message ?? err) };
        }
      }
      window.open(link, '_blank', 'noopener');
      return { ok: true, opened: found.file };
    },
    readDoc: async (p: { product: string; src: string }) => {
      const sent = sentFileName(p?.src);
      const found = sent ? null : findFile(places, p?.product, p?.src);
      const link = sent ? linkOfEntry(sent) : found && linkOfEntry(found.entry.n);
      if (!link) return { ok: false, error: found?.entry.big ? 'This file is too big for your phone.' : 'This file is on your computer.' };
      const asked = client.generation();
      const res = await fetch(link);
      const text = res.ok ? await res.text() : null;
      if (client.generation() !== asked) return { ok: false, error: 'You signed out.' };
      return text !== null ? { ok: true, text, mtime: 0 } : { ok: false, error: 'This file could not be read.' };
    },
    folderPictures: async (p: { product: string; src: string }) => {
      const place = places.get(p?.product);
      const found = place && findFolder(place, p.src);
      if (!place || !found) return { ok: false, error: 'This folder is on your computer.' };
      return { ok: true, folder: found.folder, pictures: found.keys.map((k) => (k.startsWith('@repo/') ? `${place.repo}/${k.slice(6)}` : `${place.dir}/${k}`)), total: found.keys.length };
    },
  });

  (window as any).zero = bridge;
  return true;
}
