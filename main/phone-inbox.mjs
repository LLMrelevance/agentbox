// HER MAC'S SIDE OF THE PHONE WITH THE MAC SHUT (docs/cloud/PHONE-PLAN.md, step 1).
//
// For each project she put on her phone, this writes a readable copy of every
// thread worth carrying (shared/phone-snapshot.mjs) to her own rows in the
// cloud, and takes the commands her phone left while the Mac was away: a
// reply, a new thread, a snooze, a close. Each command goes through the very
// handler the window uses for the same thing, so a reply from the phone is a
// reply, with everything a reply does. Then it is marked taken, which is what
// turns "Waiting for your Mac" on her phone into done.
//
// Commands are taken in the order she made them. One that was done is
// remembered on this Mac before it is marked in the cloud, so a mark that
// fails is retried and the command is never done twice; one that cannot be
// done is marked with why.
import fs from 'node:fs';
import path from 'node:path';
import { threadSnapshot, threadsWorthCarrying, snapshotKey, checkCommand } from '../shared/phone-snapshot.mjs';

export function createPhoneInbox({
  backend,
  // The projects on her phone, read fresh each pass: [{ slug, name }].
  projects,
  listItems, // (slug) -> folded rows
  historyOf, // (slug, id) -> the thread's history lines (store.readHistory)
  apply, // async (command) -> void; throws to refuse
  stateFile,
  now = Date.now,
  log = () => {},
}) {
  const state = readState(stateFile);
  const save = () => writeState(stateFile, state);

  async function publish() {
    let sent = 0;
    const chosen = projects();
    const known = new Set(chosen.map((p) => p.slug));
    for (const p of chosen) {
      const key = `project:${p.slug}`;
      if (state.sent[key] !== p.name) { await backend.putPhoneProject({ project: p.slug, name: p.name }); state.sent[key] = p.name; }
      const rows = threadsWorthCarrying(listItems(p.slug), { now: now() });
      const batch = [];
      const here = new Set();
      for (const item of rows) {
        here.add(item.id);
        const snap = threadSnapshot(item, historyOf(p.slug, item.id));
        const k = snapshotKey(snap);
        const sk = `${p.slug}:${item.id}`;
        if (state.sent[sk] === k) continue;
        batch.push({ item: item.id, snapshot: snap, key: k });
      }
      if (batch.length) {
        await backend.putPhoneThreads(p.slug, batch.map(({ item, snapshot }) => ({ item, snapshot })));
        for (const b of batch) state.sent[`${p.slug}:${b.item}`] = b.key;
        sent += batch.length;
      }
      // Threads no longer carried (archived long ago, or gone) leave the phone.
      const gone = Object.keys(state.sent).filter((k) => k.startsWith(`${p.slug}:`) && !here.has(k.slice(p.slug.length + 1)));
      if (gone.length) {
        await backend.dropPhoneThreads(p.slug, gone.map((k) => k.slice(p.slug.length + 1)));
        for (const k of gone) delete state.sent[k];
      }
    }
    // A project taken off her phone takes its threads with it.
    for (const k of Object.keys(state.sent).filter((k) => k.startsWith('project:') && !known.has(k.slice(8)))) {
      const slug = k.slice(8);
      await backend.dropPhoneProject(slug);
      for (const t of Object.keys(state.sent).filter((t) => t.startsWith(`${slug}:`))) delete state.sent[t];
      delete state.sent[k];
    }
    if (sent) save();
    return sent;
  }

  async function takeCommands() {
    const slugs = projects().map((p) => p.slug);
    const waiting = (await backend.waitingPhoneCommands()).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    let taken = 0;
    for (const cmd of waiting) {
      let outcome = state.done[cmd.id];
      if (!outcome) {
        const why = checkCommand(cmd, { projects: slugs, hasItem: (project, id) => listItems(project).some((i) => i.id === id) });
        if (why) outcome = `refused: ${why}`;
        else {
          try { await apply(cmd); outcome = 'done'; } catch (err) { outcome = `refused: ${String(err?.message || err).slice(0, 200)}`; }
        }
        // Remembered here before the cloud is told, so a failed mark never
        // means a second reply.
        state.done[cmd.id] = outcome;
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
    if (!fn) throw new Error('this Mac cannot do that yet');
    const out = await fn({ sender: null }, args);
    if (out && out.ok === false) throw new Error(out.error || 'the app turned it down');
    return out;
  };
}

function readState(file) {
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { sent: s.sent || {}, done: s.done || {} };
  } catch {
    return { sent: {}, done: {} };
  }
}

function writeState(file, state) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, file);
}
