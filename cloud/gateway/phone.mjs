// THE PHONE'S REPLIES, CARRIED ON IN THE CLOUD WITH THE COMPUTER SHUT
// (docs/cloud/PHONE-PLAN.md step 2; the kit is shared/cloud-kit.mjs).
//
// Every minute: a reply no computer has claimed for a minute is claimed as
// `cloud:<run id>` and started from the kit its computer left, through the
// gateway's own start (the plan, the ledger, the sign-in by name). The run
// keeps its input open: each minute its new output is read without counting
// as the computer (`peek`), each finished turn goes into the phone's copy of
// the thread with one alert, and the next reply on that thread goes to the
// same run. Twenty minutes after its last answer with nothing new its input is
// closed, it ends, and the thread waits for its computer to bring it home
// before the cloud starts it again. A run the computer has joined is the
// computer's.
//
// What the server keeps is in its ledger (`ledger/phone/`), which its role
// may read and write; a run's files and the kit are read through the signer's
// links (`runFiles`), as the role itself never reads `runs/`.
import crypto from 'node:crypto';
import {
  CLOUD_TAKES_AFTER_MS, CLOUD_TAKES_UNTIL_MS, answersIn, checkKit, cloudClaim, cloudSessionId, cloudUserLine,
  kitKey, replyPrompt, resultsInLines, runKey, serverRunKey, startPayload,
} from '../../shared/cloud-kit.mjs';
import { withCloudTurn } from '../../shared/phone-snapshot.mjs';
import { phoneBanner } from '../../shared/notify-rules.mjs';
import { handsBack, HAND_BACK } from '../../shared/cloud-hand-back.mjs';
import { LOGIN_NAME } from '../../shared/cloud-login-name.mjs';

export const PHONE_TRIES = 3;
// A start the cloud refused is tried again no sooner than this.
const TRY_AGAIN_MS = 5 * 60_000;
// A run's end is looked for by the sweep once its notice may have been missed.
const END_LOOK_AFTER_MS = 2 * 60_000;
// The links a run is started with outlive its 8 hours.
const LINK_SECONDS = 12 * 60 * 60;
const PER_SWEEP = 50;
// A run whose last answer is this old, with no new reply, has its input closed.
export const IDLE_CLOSE_MS = 20 * 60_000;
// An ended run its computer never brought home is let go after this.
const NOT_HOME_KEPT_MS = 7 * 24 * 60 * 60_000;
const PAGE_BYTES = 1_000_000;
const PAGES_PER_SWEEP = 20;
// Most of one output line kept between sweeps; a longer one is no answer.
const PARTIAL_MAX = 2 * 1024 * 1024;
const DB_MS = 10_000;
export const ANSWERED_OUTCOME = 'Answered in Agentbox Cloud';
export const NO_ANSWER = 'The run in Agentbox Cloud ended without an answer.';
const PERSON = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// A file the phone sent rides in her words as a link; the computer saves it.
const PHONE_FILE = /\]\(phone-files\//;

const iso = (t) => new Date(t).toISOString();

/** The database, as the service role, with a deadline on every call. */
export function supabaseRest({ url, serviceKey, fetchImpl = fetch, timeoutMs = DB_MS }) {
  const base = `${String(url).replace(/\/+$/, '')}/rest/v1`;
  const q = (v) => encodeURIComponent(v);
  async function call(method, path, { body, prefer } = {}) {
    const headers = { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json', ...(prefer ? { prefer } : {}) };
    const res = await fetchImpl(`${base}/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    const text = await res.text();
    if (!res.ok) throw new Error(`the database answered ${res.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  }
  const thread = (owner, device, project, item) => `owner=eq.${q(owner)}&device=eq.${q(device)}&project=eq.${q(project)}&item=eq.${q(item)}`;
  return {
    waitingReplies: ({ after, before, limit }) => call('GET', `phone_commands?select=id,owner,device,project,item,kind,payload,created_at&kind=eq.reply&taken_at=is.null&claimed_at=is.null&created_at=gt.${q(iso(after))}&created_at=lt.${q(iso(before))}&order=created_at.asc&limit=${limit}`),
    async claim(id, by, at) {
      const rows = await call('PATCH', `phone_commands?id=eq.${q(id)}&claimed_at=is.null&taken_at=is.null`, { body: { claimed_at: at, claimed_by: by }, prefer: 'return=representation' });
      return Array.isArray(rows) && rows.length === 1;
    },
    giveBack: (id, by) => call('PATCH', `phone_commands?id=eq.${q(id)}&claimed_by=eq.${q(by)}&taken_at=is.null`, { body: { claimed_at: null, claimed_by: null } }),
    taken: (id, outcome, at) => call('PATCH', `phone_commands?id=eq.${q(id)}&taken_at=is.null`, { body: { taken_at: at, outcome } }),
    async thread(owner, device, project, item) {
      const rows = await call('GET', `phone_threads?select=snapshot&${thread(owner, device, project, item)}`);
      return Array.isArray(rows) && rows[0] ? rows[0] : null;
    },
    writeThread: (owner, device, project, item, snapshot) => call('PATCH', `phone_threads?${thread(owner, device, project, item)}`, { body: { snapshot, updated_at: iso(Date.now()) } }),
    pushDevices: (owner) => call('GET', `push_devices?select=token&owner=eq.${q(owner)}`),
    dropPushDevice: (owner, token) => call('DELETE', `push_devices?owner=eq.${q(owner)}&token=eq.${q(token)}`),
  };
}

/**
 * The phone's half of the server. `start(person, sessionId, payload)` and
 * `input(...)` are the gateway's own invoke; `room(person)` says whether a
 * run could start now, without taking a place.
 */
export function createPhoneCarry({ db, runFiles, links, objects, start, input, stop, room, scopedKey, now, log, sendPush }) {
  const said = new Set();
  const once = (kind, line) => { if (!said.has(kind)) log(line); said.add(kind); };
  const tryKey = (person, id) => `ledger/phone/tries/${person}/${id}.json`;
  const openKey = (person, runId) => `ledger/phone/open/${person}/${runId}.json`;
  const endedKey = (person, runId) => `ledger/phone/ended/${person}/${runId}.json`;
  const readJson = async (key) => { const o = await objects.get(key); return o ? JSON.parse(o.body) : null; };
  const readFile = async (key) => { try { return await runFiles.get(key); } catch (err) { once(`read:${err?.message}`, `phone: could not read ${key}: ${err?.message || err}`); return null; } };
  const threadOf = (r) => `${r.owner}|${r.device}|${r.project}|${r.item}`;
  const save = (rec) => objects.put(openKey(rec.owner, rec.runId), JSON.stringify(rec));
  // The computer writes this when it joins a run the server started.
  const joined = async (rec) => !!(await readFile(scopedKey(rec.owner, serverRunKey(rec.runId).replace(/\.json$/, '.joined.json'))));
  const stdinOf = (frame, text, note) => Buffer.from(cloudUserLine(replyPrompt(frame, text), { note, uuid: crypto.randomUUID() })).toString('base64');

  async function kitOf(person, cmd) {
    const text = await readFile(scopedKey(person, kitKey(cmd.device, cmd.project, cmd.item)));
    if (!text) return null;
    let kit;
    try { kit = JSON.parse(text); } catch { once('kit-json', 'phone: a kit that is not JSON was left to its computer'); return null; }
    const elsewhere = (kit?.device && kit.device !== cmd.device) || (kit?.project && kit.project !== cmd.project) || (kit?.item && kit.item !== cmd.item);
    const problem = checkKit(kit, { now: now() }) || (elsewhere ? 'a kit for another thread' : null);
    if (problem) { once(`kit:${problem}`, `phone: a kit was left to its computer: ${problem}`); return null; }
    return kit;
  }

  async function failed(person, cmd, tries, why) {
    const n = (tries?.n ?? 0) + 1;
    await objects.put(tryKey(person, cmd.id), JSON.stringify({ n, at: now(), why }));
    once(`start:${why}`, `phone: a reply could not start in the cloud (${why}); its claim was given back`);
    if (n >= PHONE_TRIES) log(`phone: reply ${cmd.id} was tried ${n} times and is left to the computer`);
  }

  // Sequenced input to a run, asked again if its answer was lost: the sandbox
  // takes the same number once.
  async function send(rec, payload) {
    for (let i = 0; i < 3; i += 1) {
      try { if ((await input(rec.owner, rec.sessionId, { runId: rec.runId, ...payload }))?.ok) return true; } catch { /* asked again */ }
    }
    return false;
  }

  // What she sees for a turn: the agent's answer, or why there is none.
  const answerText = (a) => {
    if (!a || a.isError || !a.text.trim()) return NO_ANSWER;
    if (handsBack(a.text)) {
      const what = a.text.split('\n').find((l) => l.trimStart().startsWith(HAND_BACK)).trim().slice(HAND_BACK.length).trim();
      return `This needs your computer${what ? ` (${what})` : ''}. It carries on there when your computer is back.`;
    }
    return a.text;
  };

  async function alert(rec, title) {
    let phones;
    try { phones = await db.pushDevices(rec.owner); } catch (err) { once('push-read', `phone: could not read the phones to alert: ${err?.message || err}`); return; }
    if (!phones?.length) return;
    const say = phoneBanner([{ kind: 'item', title }]);
    const messages = phones.map((p) => ({ to: p.token, title: say.title, body: say.body, sound: 'default', priority: 'high', channelId: 'default', data: { product: `${rec.project}@${rec.device}`, id: rec.item } }));
    let tickets;
    try { tickets = await sendPush(messages); } catch (err) { once('push-send', `phone: could not send an alert: ${err?.message || err}`); return; }
    for (const [i, t] of (tickets ?? []).entries()) {
      if (t?.status === 'ok') continue;
      const why = t?.details?.error ?? t?.message ?? 'no answer';
      if (why === 'DeviceNotRegistered') await db.dropPushDevice(rec.owner, messages[i].to).catch((err) => once('push-drop', `phone: could not forget a phone: ${err?.message || err}`));
      else once(`push:${why}`, `phone: Expo did not take an alert: ${why}`);
    }
  }

  // One finished turn: into the phone's copy, the command taken, one alert.
  async function relayTurn(rec, answer) {
    const turn = rec.turns[rec.relayed];
    if (!turn) return;
    const row = await db.thread(rec.owner, rec.device, rec.project, rec.item);
    const next = row ? withCloudTurn(row.snapshot, { reply: turn.reply, answer, repliedAt: Date.parse(turn.repliedAt) || rec.startedAt, answeredAt: now() }) : null;
    if (next) await db.writeThread(rec.owner, rec.device, rec.project, rec.item, next);
    else once('no-thread', 'phone: a cloud run answered for a thread the phone no longer has');
    await db.taken(turn.command, ANSWERED_OUTCOME, iso(now()));
    turn.answered = true;
    rec.relayed += 1;
    rec.lastTurnEndedAt = now();
    await save(rec);
    await alert(rec, row?.snapshot?.item?.title ?? '');
  }

  // The run's new output, read without counting as the computer, and every
  // turn it finished since the last look.
  async function relay(rec) {
    for (let p = 0; p < PAGES_PER_SWEEP; p += 1) {
      let page;
      try { page = await input(rec.owner, rec.sessionId, { action: 'events', runId: rec.runId, since: rec.cursor, peek: true, maxBytes: PAGE_BYTES }); } catch (err) {
        once(`peek:${err?.message}`, `phone: could not read a cloud run's output: ${err?.message || err}`);
        return;
      }
      if (page?.relayed?.key) page = JSON.parse(await readFile(scopedKey(rec.owner, page.relayed.key)) || 'null');
      if (!page?.ok || !Array.isArray(page.events) || !page.events.length) return;
      let text = '';
      for (const e of page.events) if (e?.kind === 'stdout' && typeof e.data === 'string') text += Buffer.from(e.data, 'base64').toString('utf8');
      const lines = `${rec.partial ?? ''}${text}`.split('\n');
      rec.partial = lines.pop();
      if (rec.partial.length > PARTIAL_MAX) rec.partial = '';
      rec.cursor += page.events.length;
      const results = resultsInLines(lines);
      await save(rec);
      for (const r of results) await relayTurn(rec, answerText(r));
      if (!page.more) return;
    }
  }

  async function startRun(person, cmd, text, tries) {
    const kit = await kitOf(person, cmd);
    if (!kit) return null;
    const free = await room(person);
    if (!free.ok) { once(`room:${free.error}`, `phone: no room to start a reply in the cloud (${free.error})`); return null; }
    const runId = crypto.randomUUID();
    const claim = cloudClaim(runId);
    if (!(await db.claim(cmd.id, claim, iso(now())))) return null;
    const rec = {
      runId, sessionId: cloudSessionId(cmd.item, runId), owner: person, device: cmd.device, project: cmd.project, item: cmd.item,
      startedAt: now(), kitMadeAt: kit.madeAt, frame: kit.frame, state: 'open',
      turns: [{ command: cmd.id, reply: text, repliedAt: cmd.created_at }], sent: 0, relayed: 0, cursor: 0, partial: '',
    };
    const giveBack = async (why) => {
      try { await db.giveBack(cmd.id, claim); } catch (err) { log(`phone: could not give back the claim on ${cmd.id}: ${err?.message || err}`); }
      await failed(person, cmd, tries, why);
      return null;
    };
    let answer;
    try {
      const payload = await startPayload(kit, {
        runId,
        getUrl: (k) => links.get(scopedKey(person, k), LINK_SECONDS),
        putUrl: (k) => links.put(scopedKey(person, k), LINK_SECONDS),
        loginName: (k) => `${LOGIN_NAME}${k}`,
        kept: kit.kept ?? null,
        // Open for her next reply while the computer is away.
        endTurn: null,
      });
      answer = await start(person, rec.sessionId, payload);
    } catch (err) {
      return giveBack(err?.error || 'cloud');
    }
    if (!answer?.ok) return giveBack(answer?.error || 'no answer');
    if (!(await send(rec, { action: 'stdin', n: 1, data: stdinOf(kit.frame, text, kit.note ?? null) }))) {
      // A run with no reply would sit until its ceiling.
      await stop(person, rec.sessionId).catch(() => {});
      return giveBack('the reply did not reach the run');
    }
    rec.sent = 1;
    await save(rec);
    const forComputer = { runId, sessionId: rec.sessionId, command: cmd.id, device: cmd.device, project: cmd.project, item: cmd.item, reply: text, repliedAt: cmd.created_at, startedAt: rec.startedAt, kitMadeAt: kit.madeAt };
    try { await runFiles.put(scopedKey(person, serverRunKey(runId)), JSON.stringify(forComputer)); } catch (err) { once('record', `phone: could not leave the run's record for the computer: ${err?.message || err}`); }
    log(`phone: started reply ${cmd.id} in the cloud as ${runId}`);
    return rec;
  }

  // Her next reply on a thread whose run the server holds open.
  async function follow(rec, cmd, text, tries) {
    if (rec.state !== 'open') {
      once(`not-home:${rec.runId}`, `phone: a reply on a thread whose cloud run ended and has not come home to its computer is left to the computer (${rec.runId})`);
      return 'left';
    }
    if (rec.joined) {
      once(`joined:${rec.runId}`, `phone: a reply on a thread its computer has joined is left to the computer (${rec.runId})`);
      return 'left';
    }
    // Closing, or still on its last reply: the next look takes it.
    if (rec.closedAt || rec.relayed < rec.sent) return 'waits';
    const claim = cloudClaim(rec.runId);
    if (!(await db.claim(cmd.id, claim, iso(now())))) return 'computer';
    const n = rec.sent + 1;
    if (!(await send(rec, { action: 'stdin', n, data: stdinOf(rec.frame, text, null) }))) {
      try { await db.giveBack(cmd.id, claim); } catch (err) { log(`phone: could not give back the claim on ${cmd.id}: ${err?.message || err}`); }
      await failed(rec.owner, cmd, tries, 'the reply did not reach the run');
      return 'refused';
    }
    rec.sent = n;
    rec.turns.push({ command: cmd.id, reply: text, repliedAt: cmd.created_at });
    await save(rec);
    return 'sent';
  }

  async function consider(cmd, open) {
    const person = String(cmd.owner || '').toLowerCase();
    const text = cmd.payload?.text;
    if (!PERSON.test(person) || typeof text !== 'string' || !text.trim() || PHONE_FILE.test(text) || !cmd.item) return 'left';
    const tries = await readJson(tryKey(person, cmd.id));
    if (tries && (tries.n >= PHONE_TRIES || now() - tries.at < TRY_AGAIN_MS)) return 'left';
    const rec = open.get(threadOf({ owner: person, ...cmd }));
    if (rec) return follow(rec, cmd, text, tries);
    // A computer that is awake claims a reply within seconds.
    if (now() - Date.parse(cmd.created_at) < CLOUD_TAKES_AFTER_MS) return 'left';
    const made = await startRun(person, cmd, text, tries);
    if (!made) return 'left';
    open.set(threadOf(made), made);
    return 'started';
  }

  async function closeIfIdle(rec) {
    if (rec.state !== 'open' || rec.joined || rec.closedAt || rec.relayed < rec.sent || !rec.lastTurnEndedAt) return;
    if (now() - rec.lastTurnEndedAt < IDLE_CLOSE_MS) return;
    const n = rec.sent + 1;
    if (!(await send(rec, { action: 'stdin', n, end: true }))) { once(`close:${rec.runId}`, `phone: could not close cloud run ${rec.runId}; tried again next minute`); return; }
    rec.sent = n;
    rec.closedAt = now();
    await save(rec);
  }

  /** A run this server started has ended: what it said goes to the phone, once. */
  async function runEnded(person, runId) {
    const rec = normal(await readJson(openKey(person, runId)));
    if (!rec || rec.state !== 'open') return false;
    try { await objects.put(endedKey(person, runId), JSON.stringify({ at: now() }), { ifNoneMatch: '*' }); } catch (err) {
      if (err?.conflict) return false;
      throw err;
    }
    try {
      if (rec.joined || (await joined(rec))) {
        // Its computer brought it home and has the thread now.
        await objects.del(openKey(person, runId));
        return true;
      }
      const answers = answersIn(await readFile(scopedKey(person, runKey(runId, 'events.jsonl'))));
      while (rec.relayed < rec.turns.length) await relayTurn(rec, answerText(answers[rec.relayed]));
      rec.state = 'ended-not-home';
      rec.endedAt = now();
      await save(rec);
      return true;
    } catch (err) {
      // The sweep comes back to it.
      await objects.del(endedKey(person, runId)).catch(() => {});
      log(`phone: could not finish cloud run ${runId}: ${err?.message || err}`);
      return false;
    }
  }

  // A record from before runs took more than one reply.
  function normal(rec) {
    if (!rec) return null;
    return {
      state: 'open', sent: 1, relayed: 0, cursor: 0, partial: '',
      turns: rec.turns ?? [{ command: rec.command, reply: rec.reply, repliedAt: rec.repliedAt }],
      ...rec,
    };
  }

  async function sweep() {
    const t = now();
    const out = { looked: 0, started: 0, sent: 0, ended: 0 };
    // Every run the server holds, by thread: relayed, let go once home.
    const open = new Map();
    for (const key of await objects.list('ledger/phone/open/')) {
      const m = /^ledger\/phone\/open\/([0-9a-f-]{36})\/([^/]+)\.json$/.exec(key);
      if (!m) continue;
      try {
        const rec = normal(await readJson(key));
        if (!rec) continue;
        if (rec.state === 'ended-not-home') {
          if (await joined(rec)) { await objects.del(key); continue; }
          if (t - rec.endedAt > NOT_HOME_KEPT_MS) { await objects.del(key); log(`phone: cloud run ${rec.runId} never came home; the cloud may start its thread again`); continue; }
        } else if (!rec.joined && (await joined(rec))) {
          rec.joined = true;
          await save(rec);
        } else if (!rec.joined) {
          await relay(rec);
        }
        open.set(threadOf(rec), rec);
      } catch (err) {
        log(`phone: cloud run ${m[2]} was passed: ${err?.message || err}`);
      }
    }
    let rows = [];
    try { rows = await db.waitingReplies({ after: t - CLOUD_TAKES_UNTIL_MS, before: t, limit: PER_SWEEP }) ?? []; } catch (err) {
      once(`list:${err?.message}`, `phone: could not read the phones' replies: ${err?.message || err}`);
    }
    out.looked = rows.length;
    for (const cmd of rows) {
      try {
        const did = await consider(cmd, open);
        if (did === 'started') out.started += 1;
        if (did === 'sent') out.sent += 1;
      } catch (err) { log(`phone: reply ${cmd?.id} was passed: ${err?.message || err}`); }
    }
    for (const rec of new Set(open.values())) {
      try {
        await closeIfIdle(rec);
        // An end whose notice was missed.
        if (rec.state === 'open' && t - rec.startedAt >= END_LOOK_AFTER_MS && (await objects.head(`runs/u-${rec.owner}/${rec.runId}/done.json`).catch(() => null))) {
          if (await runEnded(rec.owner, rec.runId)) out.ended += 1;
        }
      } catch (err) { log(`phone: cloud run ${rec.runId} was passed: ${err?.message || err}`); }
    }
    return out;
  }

  return { sweep, runEnded };
}
