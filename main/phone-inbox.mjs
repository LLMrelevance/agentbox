// HER MAC'S SIDE OF THE PHONE WITH THE MAC SHUT (docs/cloud/PHONE-PLAN.md, step 1).
//
// For each project she put on her phone, this writes a readable copy of every
// thread worth carrying (shared/phone-snapshot.mjs) to her own rows in the
// cloud, and takes the commands her phone left while the Mac was away: a
// reply, a new thread, a snooze, a close. Each command goes through the very
// handler the window uses for the same thing, so a reply from the phone is a
// reply, with everything a reply does. Then it is marked taken, which is what
// turns "Waiting for your computer" on her phone into done.
//
// THIS COMPUTER IS ONE DEVICE (Codex's review of step 1, finding 4). Its
// projects online carry its own id, and it takes only the commands left on
// them, so a second computer signed into the same account neither takes this
// one's commands nor overwrites a project that happens to share a name. The id
// belongs to this installation and this store together (main/main.mjs
// phoneDevice), so a store copied to another computer gets another id
// (second review, finding 7).
//
// EVERYTHING IT SENDS IS SENT AS ONE PERSON (second review, finding 1). The
// inbox is made for whoever is signed in, names them on every write, and asks
// `alive()` before each one: once she signs out, a pass already running stops
// rather than carrying her projects into whoever signs in next.
//
// A COMMAND IS DONE ONCE (finding 3). Before it is done, that it is being done
// is written down here, and what it writes carries the command's own id
// (`fromPhone`). If this computer stopped half way, the next pass looks for a
// line or a row with that id before doing it again (second and third reviews:
// matching the words, or the moment, took an earlier "yes" for a second one).
// Closing and snoozing are the same twice over. Once done,
// the outcome is kept here before the cloud is told, so a mark that fails is
// retried and the command never runs twice. One that cannot be done is marked
// with why.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { threadSnapshot, threadsWorthCarrying, snapshotKey, checkCommand, madeHere, hideSecrets, bytesOf, SNAPSHOT_LIMITS } from '../shared/phone-snapshot.mjs';
import { createPhoneUploads } from './phone-uploads.mjs';

// How long a thread started on the phone is remembered as the row it became:
// long past any reply still waiting for it (second review, finding 8).
const MADE_KEPT_MS = 60 * 24 * 3600_000;
// A copy the cloud would not take is tried again, less and less often.
const RETRY_MS = [60_000, 5 * 60_000, 30 * 60_000, 3600_000];
// A running thread's step goes up at most this often, and its copy is sent
// again this often while it runs, so a phone can tell a Mac that went to sleep
// mid-run (cloud-bridge.ts LIVE_FOR_MS) from one still working.
const STEP_EVERY_MS = 30_000;
const STILL_RUNNING_MS = 2 * 60_000;
const SWEEP_EVERY_MS = 3600_000;

export class SignedOut extends Error {}

export function createPhoneInbox({
  backend,
  // Who this inbox sends as, and whether they still are.
  owner,
  alive = () => true,
  // This computer's id online; made here and kept with the rest when none is given.
  device: given = null,
  // The projects on her phone, read fresh each pass: [{ slug, name, dir?, repoPath? }].
  projects,
  listItems, // (slug) -> folded rows
  historyOf, // (slug, id, { all }) -> the thread's history lines (store.readHistory); all of them when asked
  apply, // async (command) -> the handler's answer; throws to refuse
  stateFile,
  home = os.homedir(),
  now = Date.now,
  log = () => {},
  // How a thread's copy is made; a test counts the calls.
  build = threadSnapshot,
  // (slug, id) -> { since, where: 'mac' | 'cloud', doing: [{ label, startedAt }] } while an agent runs on it, else null.
  liveOf = () => null,
}) {
  const state = readState(stateFile);
  const save = () => writeState(stateFile, state);
  if (!given && !state.device) { state.device = crypto.randomBytes(6).toString('hex'); save(); }
  const device = given ?? state.device;
  if (!/^[0-9a-f]{12}$/.test(device)) throw new Error('a computer id is twelve hex digits');
  // WHAT WAS SENT WAS SENT AS ONE COMPUTER (Codex's third review, finding 2).
  // Under another id (a store copied here, or the id made a new way) nothing
  // is online yet, so it all goes again; the other id's rows are that
  // computer's, and are left to it.
  // Which rows the phone's new threads became is about this store, not the
  // id, and is kept (Codex's fourth review, finding 3).
  if (state.forDevice !== device) {
    state.forDevice = device;
    state.sent = {};
    state.failed = {};
    state.uploaded = {};
    save();
  }
  const still = () => { if (!alive()) throw new SignedOut('signed out'); };
  // The files threads name, when this cloud can hold them (main/phone-uploads.mjs).
  const uploads = backend.putPhoneFile ? createPhoneUploads({ backend, owner, device, alive, state, save, home, now, log }) : null;
  let swept = 0;
  const homeWritten = (p) => (p && home && (p === home || p.startsWith(`${home}/`)) ? `~${p.slice(home.length)}` : p ?? null);

  // WHAT EACH THREAD'S COPY WAS LAST BUILT FROM, so a pass skips building the
  // copies of threads that did not change. Building them is the costly part of
  // a pass (261 of 361 ms for 300 threads of the real agentbox-team ledger,
  // 2026-10-14), and it runs on the thread that draws the window every few
  // seconds. A copy is made of the row and its lines and nothing else, so the
  // same row and lines make the same copy.
  const built = new Map();
  const inputsOf = (item, history) => crypto.createHash('sha1').update(JSON.stringify(item)).update('\0').update(JSON.stringify(history)).digest('base64');
  // What each running thread's copy last said about the run, by thread.
  const lives = new Map();
  const liveNow = (sk, slug, id) => {
    let raw = null;
    try { raw = liveOf(slug, id); } catch { /* the supervisor's trouble, not the phone's */ }
    if (!raw) { lives.delete(sk); return null; }
    const doing = (Array.isArray(raw.doing) ? raw.doing : []).slice(0, 3).map((d) => {
      const label = hideSecrets(String(d?.label ?? ''), { home }).replace(/\s+/g, ' ').trim();
      return { label: label.length > 160 ? `${label.slice(0, 159)}…` : label, startedAt: Number(d?.startedAt) || now() };
    });
    const was = lives.get(sk);
    const same = was && was.since === raw.since && was.where === raw.where;
    const steps = (l) => JSON.stringify(l.doing.map((d) => d.label));
    if (same && now() - was.at < STEP_EVERY_MS) return was;
    if (same && now() - was.at < STILL_RUNNING_MS && steps(was) === steps({ doing })) return was;
    const live = { since: Number(raw.since) || now(), where: raw.where === 'cloud' ? 'cloud' : 'mac', doing, at: now() };
    lives.set(sk, live);
    return live;
  };
  // Each project's pass is one stretch of work; between them the window gets a turn.
  const breathe = () => new Promise((resolve) => setImmediate(resolve));

  async function publish() {
    let sent = 0;
    const chosen = projects();
    const known = new Set(chosen.map((p) => p.slug));
    for (const p of chosen) {
      await breathe();
      const key = `project:${p.slug}`;
      if (state.sent[key] !== p.name) { still(); await backend.putPhoneProject({ owner, device, project: p.slug, name: p.name }); state.sent[key] = p.name; save(); }
      const rows = threadsWorthCarrying(listItems(p.slug), { now: now() });
      const batch = [];
      const here = new Set();
      for (const item of rows) {
        here.add(item.id);
        const sk = `${p.slug}:${item.id}`;
        const history = historyOf(p.slug, item.id);
        const inputs = inputsOf(item, history);
        const live = liveNow(sk, p.slug, item.id);
        const was = built.get(sk);
        // Only the run or its files moved: the copy of the row and its lines is the one already made.
        let base = was?.inputs === inputs ? was.base : null;
        const made = () => (base ??= build(item, history, SNAPSHOT_LIMITS, { home }));
        const files = uploads && p.dir ? uploads.manifest(sk, made, { dir: p.dir, repoPath: p.repoPath, updatedAt: item.updatedAt ?? 0, base: inputs }) : null;
        if (was && was.inputs === inputs && was.live === live && was.files === files && state.sent[sk] === was.key) continue;
        let snap = live ? { ...made(), live } : made();
        // Where the files are on this Mac, written from her home as the words are, so the phone can follow a path the words give in full.
        if (files) {
          const attached = { dir: homeWritten(p.dir), ...(p.repoPath ? { repo: homeWritten(p.repoPath) } : {}), ...files };
          if (bytesOf(snap) + bytesOf(attached) < SNAPSHOT_LIMITS.bytes) snap = { ...snap, attached };
        }
        const k = snapshotKey(snap);
        built.set(sk, { inputs, key: k, live, files, base: live || files ? base : null });
        if (state.sent[sk] === k) continue;
        const failed = state.failed[sk];
        if (failed && failed.key === k && now() < failed.next) continue;
        batch.push({ item: item.id, snapshot: snap, key: k });
      }
      sent += await sendAll(p.slug, batch);
      // Threads no longer carried (archived long ago, or gone) leave the phone.
      const gone = Object.keys(state.sent).filter((k) => k.startsWith(`${p.slug}:`) && !here.has(k.slice(p.slug.length + 1)));
      if (gone.length) {
        still();
        await backend.dropPhoneThreads(device, p.slug, gone.map((k) => k.slice(p.slug.length + 1)), owner);
        for (const k of gone) { delete state.sent[k]; delete state.failed[k]; built.delete(k); }
        save();
      }
    }
    // A project taken off her phone takes its threads with it.
    for (const k of Object.keys(state.sent).filter((k) => k.startsWith('project:') && !known.has(k.slice(8)))) {
      const slug = k.slice(8);
      still();
      await backend.dropPhoneProject(device, slug, owner);
      for (const t of Object.keys(state.sent).filter((t) => t.startsWith(`${slug}:`))) { delete state.sent[t]; built.delete(t); }
      for (const t of Object.keys(state.failed).filter((t) => t.startsWith(`${slug}:`))) delete state.failed[t];
      delete state.sent[k];
      save();
    }
    uploads?.kick();
    if (uploads && now() - swept > SWEEP_EVERY_MS) { swept = now(); try { await uploads.sweep(); } catch (err) { log(`phone: could not clear old files: ${err?.message ?? err}`); } }
    return sent;
  }

  // In one go when it can; one at a time when the cloud refuses the lot, so
  // a thread it will not take never holds up the others (finding 9). A copy
  // that fails is NOT counted as sent: it is tried again, later each time
  // (second review, finding 5), and at once when it changes.
  async function sendAll(slug, batch) {
    if (!batch.length) return 0;
    const sk = (b) => `${slug}:${b.item}`;
    try {
      still();
      await backend.putPhoneThreads(device, slug, batch.map(({ item, snapshot }) => ({ item, snapshot })), owner);
      for (const b of batch) { state.sent[sk(b)] = b.key; delete state.failed[sk(b)]; }
      save();
      return batch.length;
    } catch (err) {
      if (err instanceof SignedOut) throw err;
      if (batch.length === 1) {
        const b = batch[0];
        const tries = state.failed[sk(b)]?.key === b.key ? state.failed[sk(b)].tries + 1 : 1;
        state.failed[sk(b)] = { key: b.key, tries, next: now() + RETRY_MS[Math.min(tries, RETRY_MS.length) - 1] };
        save();
        log(`phone: could not send ${b.item} (try ${tries}): ${err?.message ?? err}`);
        return 0;
      }
      let n = 0;
      for (const b of batch) n += await sendAll(slug, [b]);
      return n;
    }
  }

  // What a command already did, if this computer did it before it stopped:
  // the line or the row that carries the command's own id (`fromPhone`,
  // shared/work-items.mjs). Nothing else counts, however alike its words.
  function landed(cmd, item) {
    if (cmd.kind === 'reply') return historyOf(cmd.project, item, { all: true }).some((l) => l?.patch?.fromPhone === cmd.id) ? item : null;
    if (cmd.kind === 'new') return listItems(cmd.project).find((i) => i.fromPhone === cmd.id)?.id ?? null;
    return null;
  }

  async function takeCommands() {
    const slugs = projects().map((p) => p.slug);
    still();
    const waiting = (await backend.waitingPhoneCommands(device)).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    let taken = 0;
    for (const cmd of waiting) {
      still();
      let outcome = state.done[cmd.id];
      if (!outcome) {
        // A reply to a thread started on the phone goes to the row it became.
        const item = cmd.item && state.made[cmd.item] ? state.made[cmd.item].id : cmd.item;
        const resolved = { ...cmd, item };
        const why = checkCommand(resolved, { projects: slugs, hasItem: (project, id) => listItems(project).some((i) => i.id === id) });
        if (why) outcome = `refused: ${why}`;
        else {
          // Claimed in the cloud first: after this the phone cannot take it
          // back, and if she already did, it is not done (third review, 3).
          const claim = await backend.claimPhoneCommand(cmd.id, owner);
          const already = claim === 'gone' ? null : state.doing[cmd.id] || claim === 'ours' ? landed(resolved, item) : null;
          if (claim === 'gone') {
            delete state.doing[cmd.id];
            save();
            continue;
          }
          if (already) {
            if (cmd.kind === 'new') state.made[madeHere(cmd.id)] = { id: already, at: now() };
            outcome = 'done';
          } else {
            state.doing[cmd.id] = { at: now() };
            save();
            try {
              const out = await apply(resolved);
              if (cmd.kind === 'new' && typeof out?.id === 'string') state.made[madeHere(cmd.id)] = { id: out.id, at: now() };
              outcome = 'done';
            } catch (err) {
              outcome = `refused: ${String(err?.message || err).slice(0, 200)}`;
            }
          }
        }
        // Remembered here before the cloud is told, so a failed mark never
        // means a second reply.
        state.done[cmd.id] = outcome;
        delete state.doing[cmd.id];
        for (const [k, v] of Object.entries(state.made)) if (!(now() - (v?.at ?? 0) < MADE_KEPT_MS)) delete state.made[k];
        save();
      }
      still();
      await backend.markPhoneCommand(cmd.id, outcome, owner);
      delete state.done[cmd.id];
      save();
      taken += 1;
    }
    return taken;
  }

  return {
    device,
    /** The uploads going on behind the passes; a test waits on them. */
    filesSettled: () => uploads?.kick() ?? Promise.resolve(),
    async syncOnce() {
      try {
        const taken = await takeCommands();
        const sent = await publish();
        if (taken || sent) log(`phone: took ${taken}, sent ${sent}`);
        return { taken, sent };
      } catch (err) {
        if (err instanceof SignedOut) return { taken: 0, sent: 0, stopped: true };
        throw err;
      }
    },
  };
}

// THIS COMPUTER'S ID ONLINE: this installation's own random id, kept in the
// app's own folder and never in the store, joined with which store it runs.
// A store copied to another computer, or restored there, is another device
// (Codex's second review, finding 7); two stores on one computer are two.
export function phoneDevice(appDataDir, storeRoot) {
  const file = path.join(appDataDir, 'phone-install-id');
  let id = null;
  try { id = fs.readFileSync(file, 'utf8').trim(); } catch { /* first time */ }
  if (!/^[0-9a-f]{32}$/.test(id ?? '')) {
    id = crypto.randomBytes(16).toString('hex');
    fs.mkdirSync(appDataDir, { recursive: true });
    fs.writeFileSync(file, id, { mode: 0o600 });
  }
  return crypto.createHash('sha256').update(`${id}\0${path.resolve(storeRoot)}`).digest('hex').slice(0, 12);
}

// A COMMAND, DONE BY THE HANDLER THE WINDOW USES FOR THE SAME THING
// (main/ipc.mjs), reached the way the phone link reaches them: the Map
// main/main.mjs files every channel in. A handler that answers `ok: false`
// turned it down, and that is what the phone is told.
const ROUTES = {
  reply: (c) => ['zero:answer', { product: c.project, id: c.item, answer: c.payload.text, fromPhone: c.id }],
  close: (c) => ['zero:answer', { product: c.project, id: c.item, status: 'done' }],
  snooze: (c) => ['zero:snooze', { product: c.project, id: c.item, snoozedUntil: c.payload.until }],
  new: (c) => ['zero:compose', { product: c.project, title: c.payload.title ?? '', body: c.payload.body ?? '', fromPhone: c.id }],
};
export function applyThrough(channels) {
  return async (cmd) => {
    const [channel, args] = ROUTES[cmd.kind]?.({ ...cmd, payload: cmd.payload || {} }) ?? [];
    const fn = channel && channels.get(channel);
    if (!fn) throw new Error('this computer cannot do that yet');
    const out = await fn({ sender: null }, args);
    if (out && out.ok === false) throw new Error(out.error || 'the app turned it down');
    return out;
  };
}

function readState(file) {
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    const made = {};
    for (const [k, v] of Object.entries(s.made || {})) made[k] = typeof v === 'string' ? { id: v, at: Date.now() } : v;
    return { device: typeof s.device === 'string' && /^[0-9a-f]{12}$/.test(s.device) ? s.device : null, forDevice: s.forDevice ?? null, sent: s.sent || {}, failed: s.failed || {}, done: s.done || {}, doing: s.doing || {}, made, uploaded: s.uploaded && typeof s.uploaded === 'object' ? s.uploaded : {} };
  } catch {
    return { device: null, forDevice: null, sent: {}, failed: {}, done: {}, doing: {}, made: {}, uploaded: {} };
  }
}

function writeState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(tmp, file);
}
