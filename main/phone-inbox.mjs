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
// one's commands nor overwrites a project that happens to share a name.
//
// A COMMAND IS DONE ONCE (finding 3). Before it is done, that it is being done
// is written down here; if this computer stopped half way, the next pass looks
// for what the command does before doing it again: her reply in the thread,
// the thread she started. Closing and snoozing are the same twice over. Once
// done, the outcome is kept here before the cloud is told, so a mark that
// fails is retried and the command never runs twice. One that cannot be done
// is marked with why.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { threadSnapshot, threadsWorthCarrying, snapshotKey, checkCommand, madeHere, SNAPSHOT_LIMITS } from '../shared/phone-snapshot.mjs';

// A command made on the phone is dated by the database; the line it makes is
// dated by this computer. Clocks that far apart still find it.
const CLOCK_SLACK_MS = 10 * 60_000;
const MADE_KEPT = 500;

export function createPhoneInbox({
  backend,
  // The projects on her phone, read fresh each pass: [{ slug, name }].
  projects,
  listItems, // (slug) -> folded rows
  historyOf, // (slug, id) -> the thread's history lines (store.readHistory)
  apply, // async (command) -> the handler's answer; throws to refuse
  stateFile,
  home = os.homedir(),
  now = Date.now,
  log = () => {},
}) {
  const state = readState(stateFile);
  const save = () => writeState(stateFile, state);
  if (!state.device) { state.device = crypto.randomBytes(6).toString('hex'); save(); }
  const device = state.device;

  async function publish() {
    let sent = 0;
    const chosen = projects();
    const known = new Set(chosen.map((p) => p.slug));
    for (const p of chosen) {
      const key = `project:${p.slug}`;
      if (state.sent[key] !== p.name) { await backend.putPhoneProject({ device, project: p.slug, name: p.name }); state.sent[key] = p.name; save(); }
      const rows = threadsWorthCarrying(listItems(p.slug), { now: now() });
      const batch = [];
      const here = new Set();
      for (const item of rows) {
        here.add(item.id);
        const snap = threadSnapshot(item, historyOf(p.slug, item.id), SNAPSHOT_LIMITS, { home });
        const k = snapshotKey(snap);
        const sk = `${p.slug}:${item.id}`;
        if (state.sent[sk] === k) continue;
        batch.push({ item: item.id, snapshot: snap, key: k });
      }
      sent += await sendAll(p.slug, batch);
      // Threads no longer carried (archived long ago, or gone) leave the phone.
      const gone = Object.keys(state.sent).filter((k) => k.startsWith(`${p.slug}:`) && !here.has(k.slice(p.slug.length + 1)));
      if (gone.length) {
        await backend.dropPhoneThreads(device, p.slug, gone.map((k) => k.slice(p.slug.length + 1)));
        for (const k of gone) delete state.sent[k];
        save();
      }
    }
    // A project taken off her phone takes its threads with it.
    for (const k of Object.keys(state.sent).filter((k) => k.startsWith('project:') && !known.has(k.slice(8)))) {
      const slug = k.slice(8);
      await backend.dropPhoneProject(device, slug);
      for (const t of Object.keys(state.sent).filter((t) => t.startsWith(`${slug}:`))) delete state.sent[t];
      delete state.sent[k];
      save();
    }
    return sent;
  }

  // In one go when it can; one at a time when the cloud refuses the lot, so
  // a thread it will not take never holds up the others (finding 9). A
  // refused copy is remembered as sent, and goes again when it changes.
  async function sendAll(slug, batch) {
    if (!batch.length) return 0;
    const mark = (b) => { state.sent[`${slug}:${b.item}`] = b.key; };
    try {
      await backend.putPhoneThreads(device, slug, batch.map(({ item, snapshot }) => ({ item, snapshot })));
      batch.forEach(mark);
      save();
      return batch.length;
    } catch (err) {
      if (batch.length === 1) { log(`phone: could not send ${batch[0].item}: ${err?.message ?? err}`); mark(batch[0]); save(); return 0; }
      let n = 0;
      for (const b of batch) n += await sendAll(slug, [b]);
      return n;
    }
  }

  // What a command already did, if this computer did it before it stopped.
  function landed(cmd, item) {
    const since = (Date.parse(cmd.createdAt) || 0) - CLOCK_SLACK_MS;
    const p = cmd.payload || {};
    if (cmd.kind === 'reply') {
      return historyOf(cmd.project, item).some((l) => l?.source === 'founder' && l.patch?.answer === p.text && (l.ts ?? 0) >= since) ? item : null;
    }
    if (cmd.kind === 'new') {
      const title = String(p.title ?? '').trim();
      const body = String(p.body ?? '').trim();
      const made = listItems(cmd.project).find((i) => (i.createdAt ?? 0) >= since
        && String(i.body ?? '').trim() === body && (!title || String(i.title ?? '').trim() === title));
      return made?.id ?? null;
    }
    return null;
  }

  async function takeCommands() {
    const slugs = projects().map((p) => p.slug);
    const waiting = (await backend.waitingPhoneCommands(device)).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    let taken = 0;
    for (const cmd of waiting) {
      let outcome = state.done[cmd.id];
      if (!outcome) {
        // A reply to a thread started on the phone goes to the row it became.
        const item = cmd.item && state.made[cmd.item] ? state.made[cmd.item] : cmd.item;
        const resolved = { ...cmd, item };
        const why = checkCommand(resolved, { projects: slugs, hasItem: (project, id) => listItems(project).some((i) => i.id === id) });
        if (why) outcome = `refused: ${why}`;
        else {
          const already = state.doing[cmd.id] ? landed(resolved, item) : null;
          if (already) {
            if (cmd.kind === 'new') state.made[madeHere(cmd.id)] = already;
            outcome = 'done';
          } else {
            state.doing[cmd.id] = now();
            save();
            try {
              const out = await apply(resolved);
              if (cmd.kind === 'new' && typeof out?.id === 'string') state.made[madeHere(cmd.id)] = out.id;
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
        const made = Object.keys(state.made);
        if (made.length > MADE_KEPT) for (const k of made.slice(0, made.length - MADE_KEPT)) delete state.made[k];
        save();
      }
      await backend.markPhoneCommand(cmd.id, outcome);
      delete state.done[cmd.id];
      save();
      taken += 1;
    }
    return taken;
  }

  return {
    device,
    async syncOnce() {
      const taken = await takeCommands();
      const sent = await publish();
      if (taken || sent) log(`phone: took ${taken}, sent ${sent}`);
      return { taken, sent };
    },
  };
}

// A COMMAND, DONE BY THE HANDLER THE WINDOW USES FOR THE SAME THING
// (main/ipc.mjs), reached the way the phone link reaches them: the Map
// main/main.mjs files every channel in. A handler that answers `ok: false`
// turned it down, and that is what the phone is told.
const ROUTES = {
  reply: (c) => ['zero:answer', { product: c.project, id: c.item, answer: c.payload.text }],
  close: (c) => ['zero:answer', { product: c.project, id: c.item, status: 'done' }],
  snooze: (c) => ['zero:snooze', { product: c.project, id: c.item, snoozedUntil: c.payload.until }],
  new: (c) => ['zero:compose', { product: c.project, title: c.payload.title ?? '', body: c.payload.body ?? '' }],
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
    return { device: typeof s.device === 'string' && /^[0-9a-f]{12}$/.test(s.device) ? s.device : null, sent: s.sent || {}, done: s.done || {}, doing: s.doing || {}, made: s.made || {} };
  } catch {
    return { device: null, sent: {}, done: {}, doing: {}, made: {} };
  }
}

function writeState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(tmp, file);
}
