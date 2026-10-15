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
import { madeHere } from '../../shared/phone-snapshot.mjs';

type Push = (payload: unknown) => void;

export interface PhoneRows {
  projects: { device: string; project: string; name: string }[];
  threads: { device: string; project: string; item: string; snapshot: any; updated_at?: string }[];
  commands: { id: string; device: string; project: string; item: string | null; kind: string; payload: any; created_at: string; taken_at: string | null; outcome: string | null }[];
}

export interface Waiting { product: string; id: string; at: number; text: string; refused?: string }

// How long a refusal stays on her screen: long enough to be read the next time
// she looks, not forever.
const REFUSAL_SHOWN_MS = 24 * 3600_000;
// A PROJECT ON THE PHONE IS A PROJECT ON ONE COMPUTER (Codex's review of
// step 1, finding 4): the screens know it by its name there and that
// computer's id together, so two computers' projects of the same name stay two.
export const phoneSlug = (device: string, project: string) => `${project}@${device}`;
export function splitSlug(slug: string): { device: string; project: string } | null {
  const m = /^(.+)@([0-9a-f]{12})$/.exec(String(slug));
  return m ? { project: m[1], device: m[2] } : null;
}

/**
 * Her rows, as the inbox draws them: each thread as her Mac last saw it, with
 * what she did on the phone since laid over it. A close or a snooze moves the
 * row at once; a new thread is a row of its own; a reply is a message of hers
 * in the thread, marked as waiting.
 */
export function phoneView(rows: PhoneRows, now = Date.now()) {
  const names = new Map(rows.projects.map((p) => [phoneSlug(p.device, p.project), p.name]));
  const products = rows.projects.map((p) => ({ slug: phoneSlug(p.device, p.project), name: p.name, dir: '', oneLiner: '', repoPath: '' }));
  const items = new Map<string, any>();
  for (const t of rows.threads) {
    const slug = phoneSlug(t.device, t.project);
    if (!names.has(slug) || !t.snapshot?.item) continue;
    items.set(`${slug}/${t.item}`, { ...t.snapshot.item, id: t.item, product: slug, productName: names.get(slug) });
  }
  const waiting: Waiting[] = [];
  const ordered = [...rows.commands].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  for (const c of ordered) {
    const at = Date.parse(c.created_at) || now;
    const refused = c.outcome?.startsWith('refused') ? c.outcome.replace(/^refused:\s*/, '') : null;
    if (c.taken_at && !(refused && now - at < REFUSAL_SHOWN_MS)) continue;
    const slug = phoneSlug(c.device, c.project);
    const key = `${slug}/${c.item}`;
    const row = items.get(key);
    if (c.kind === 'reply' && c.item) waiting.push({ product: slug, id: c.item, at, text: String(c.payload?.text ?? ''), ...(refused ? { refused } : {}) });
    else if (refused) continue;
    else if (c.kind === 'close' && row) items.set(key, { ...row, status: 'done', updatedAt: at });
    else if (c.kind === 'snooze' && row) items.set(key, { ...row, snoozedUntil: Number(c.payload?.until) || null, updatedAt: at });
    else if (c.kind === 'new' && names.has(slug)) {
      const id = madeHere(c.id);
      items.set(`${slug}/${id}`, {
        id, product: slug, productName: names.get(slug), title: String(c.payload?.title || c.payload?.body || '').slice(0, 200),
        body: String(c.payload?.body ?? ''), status: 'open', kind: 'directive', labels: [], priority: 0,
        createdAt: at, updatedAt: at, waitsForMac: true,
      });
    }
  }
  return { products, items: [...items.values()], waiting };
}

/** The thread's lines as her Mac sent them, for the thread view. */
export function phoneHistory(rows: PhoneRows, product: string, id: string) {
  const t = rows.threads.find((r) => phoneSlug(r.device, r.project) === product && r.item === id);
  return { ok: true, lines: Array.isArray(t?.snapshot?.history) ? t.snapshot.history : [] };
}

/** What one press on the phone leaves for her Mac, or null for a press that is not one of the four. */
// UNDO OF A CLOSE MADE ON THE PHONE takes the close back while it is still
// waiting: the phone marks its own command taken, as undone, and the computer
// never sees it. Once the computer has closed the thread, undoing is the
// computer's. Returns the command to take back, or null.
export function closeToTakeBack(rows: PhoneRows, channel: string, p: any) {
  if (channel !== REQUEST_CHANNELS.answer || p?.status !== 'open' || (typeof p.answer === 'string' && p.answer.trim())) return null;
  const where = splitSlug(p.product);
  if (!where) return null;
  const waiting = rows.commands.filter((c) => c.kind === 'close' && !c.taken_at && c.device === where.device && c.project === where.project && c.item === p.id);
  return waiting.at(-1) ?? null;
}
export const UNDONE = 'refused: taken back on the phone';

export function commandFor(channel: string, p: any): { device: string; project: string; item: string | null; kind: string; payload: Record<string, unknown> } | null {
  const where = splitSlug(p?.product);
  if (!where) return null;
  const on = (item: string | null, kind: string, payload: Record<string, unknown>) => ({ ...where, item, kind, payload });
  if (channel === REQUEST_CHANNELS.answer) {
    if (typeof p.answer === 'string' && p.answer.trim()) return on(p.id, 'reply', { text: p.answer });
    if (p.status === 'done') return on(p.id, 'close', {});
    return null;
  }
  if (channel === REQUEST_CHANNELS.snooze && Number.isFinite(p.snoozedUntil) && p.snoozedUntil >= 0) return on(p.id, 'snooze', { until: p.snoozedUntil });
  if (channel === REQUEST_CHANNELS.compose && (String(p.title ?? '').trim() || String(p.body ?? '').trim())) {
    return on(null, 'new', { title: String(p.title ?? ''), body: String(p.body ?? '') });
  }
  return null;
}

// THE DOORS THAT ONLY READ, answered here as a door with nothing behind it.
// Every other door changes something on her computer that the phone cannot
// reach, so it says so rather than answering as if it had (Codex's review of
// step 1, finding 7: Stop said the agent stopped when nothing had).
const READS = new Set([
  'agentUpdate', 'refreshUsage', 'assistiveTech', 'olderItems', 'commandCatalog', 'compactionStatus',
  'firstRunExamples', 'firstRunWalking', 'listFolders', 'folderExists', 'agentFiles', 'agentFolders',
  'agentThreads', 'cornerTag', 'bootInfo', 'updateCheck', 'instructionRead', 'instructionHistory',
  'instructionVersion', 'standingRead', 'messageRulesRead', 'settingsRead', 'engineBin',
  'cloudClipboardCode', 'projectInstructionsRead', 'folderPictures', 'readDoc', 'codeFile', 'railNote',
  'agentConversation', 'phoneLink', 'teamStatus', 'resumeAgents', 'resumeItems',
  // Where she dragged a row or a project to: kept on this page, not sent.
  'setThreadPlaces', 'setThreadPins', 'setProductOrder', 'setProductHidden',
]);
export const NOT_HERE = 'Your computer does this. Your phone can reply, start a thread, close, and move things to Later.';

export function readCloudConfig(doc: Document = document): CloudConfig | null {
  const raw = doc.querySelector('meta[name="agentbox-cloud"]')?.getAttribute('content');
  if (!raw) return null;
  try {
    const c = JSON.parse(raw);
    return typeof c?.url === 'string' && typeof c?.anonKey === 'string' ? { url: c.url, anonKey: c.anonKey } : null;
  } catch { return null; }
}

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
  let error: string | null = null;
  let last = '';
  const listeners = new Map<string, Set<Push>>();
  const deliver = (channel: string, payload?: unknown) => {
    for (const fn of listeners.get(channel) ?? []) { try { fn(payload); } catch { /* its own fault */ } }
  };
  const changed = atMostEvery(1000, (payload?: unknown) => deliver(PUSH_CHANNELS.onChanged, payload));

  const COMMANDS = 'select=id,device,project,item,kind,payload,created_at,taken_at,outcome&order=created_at';
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
    const done = await client.select('phone_commands', `${COMMANDS}&taken_at=not.is.null&created_at=gte.${since}&limit=500`);
    return [...waiting, ...done];
  }

  async function refresh() {
    if (!client.signedIn()) { rows = EMPTY_ROWS; return; }
    const asked = client.generation();
    try {
      const [projects, threads, cmds] = await Promise.all([
        client.select('phone_projects', 'select=device,project,name&order=name'),
        client.select('phone_threads', 'select=device,project,item,snapshot,updated_at&order=updated_at.desc&limit=1000'),
        commands(),
      ]);
      // Read for a sign-in that has since ended: not hers to show.
      if (client.generation() !== asked) return;
      rows = { projects, threads, commands: cmds };
      error = null;
    } catch (err) {
      if (client.generation() !== asked) return;
      if (!client.signedIn()) rows = EMPTY_ROWS;
      error = String((err as Error)?.message ?? err);
    }
    const key = JSON.stringify([rows.threads.map((t) => [t.item, t.updated_at]), rows.commands.map((c) => [c.id, c.taken_at]), rows.projects, error, client.signedIn()]);
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

  const leave = async (channel: string, payload: unknown) => {
    const back = closeToTakeBack(rows, channel, payload);
    if (back) {
      const asked = client.generation();
      const done = await client.update('phone_commands', `id=eq.${encodeURIComponent(back.id)}&taken_at=is.null`, { taken_at: new Date().toISOString(), outcome: UNDONE });
      if (!done.length) throw new Error('Your computer already closed it. Reopen it there.');
      if (client.generation() === asked) rows = { ...rows, commands: rows.commands.map((c) => (c.id === back.id ? done[0] : c)) };
      changed(null);
      return { ok: true };
    }
    const cmd = commandFor(channel, payload);
    if (!cmd) throw new Error(NOT_HERE);
    const asked = client.generation();
    const row = await client.insert('phone_commands', cmd);
    if (client.generation() === asked) rows = { ...rows, commands: [...rows.commands, row] };
    changed(null);
    return { ok: true };
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
      return {
        products: view.products, items: view.items, phoneWaiting: view.waiting,
        team: team(), agents: [], approvals: [], supervisor: { ...SUPERVISOR, productOrder: view.products.map((p) => p.slug) },
        engines: null, runsOn: null, restartNeeded: null, cloud: null,
        config: { browserHome: '', browserPins: [], outsideAgents: 'off' },
      };
    },
    itemHistory: async ({ product, id }: { product: string; id: string }) => phoneHistory(rows, product, id),
    sessionTrace: async () => ({ sessions: [] }),
    repeats: async () => [],
    // Her Mac runs the agents; nothing here asks her to set one up.
    engineSetup: async () => ({ ok: true, phase: 'ready', found: true, signedIn: true }),
    dashboard: async () => null,
    codeChange: async () => ({ ok: false }),
    answer: (p: unknown) => leave(REQUEST_CHANNELS.answer, p),
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
    teamSignOut: async () => { client.signOut(); rows = EMPTY_ROWS; error = null; changed(null); return { ok: true }; },
  });

  (window as any).zero = bridge;
  return true;
}
