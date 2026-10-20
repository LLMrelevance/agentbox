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
import { setPictureLinks } from './picture';
import { sendFiles, sentFileName, sentNamesIn } from './phone-sends-files';
import { BUCKET, cloudPlaces, findFile, homeOf, installCloudFiles, keyAt, pageForPhone, pageStyles, withStyles, type Place } from './cloud-files';
import {
  LIVE_FOR_MS, NOT_HERE, UNDONE, approvalCommand, commandFor, macSeenOf, phoneHistory, phoneSlug, phoneStatusLine,
  phoneView, readCommands, readThreads, realItem, splitSlug, takeBack, type Aliases, type PhoneRows,
} from './phone-rows';

export {
  NOT_HERE, UNDONE, approvalCommand, closeToTakeBack, commandFor, macSeenOf, phoneHistory, phoneSlug, phoneStatusLine,
  phoneView, readCommands, readThreads, realItem, splitSlug, takeBack, type Aliases, type Cards, type PhoneRows, type Waiting,
} from './phone-rows';

type Push = (payload: unknown) => void;

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

  const commands = () => readCommands((table, query) => client.select(table, query));

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
