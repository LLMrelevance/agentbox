// THE PHONE'S REPLIES, CARRIED ON IN THE CLOUD WITH THE COMPUTER SHUT
// (docs/cloud/PHONE-PLAN.md step 2; the kit is shared/cloud-kit.mjs).
//
// Every minute: a reply no computer has claimed for a minute is claimed as
// `cloud:<run id>` and started from the kit its computer left, through the
// gateway's own start (the plan, the ledger, the sign-in by name). When the
// run's done.json lands, the agent's answer goes into the phone's copy of the
// thread, the command is marked taken, and one alert goes out. The computer,
// waking, finds the claim and brings the run home.
//
// What the server keeps is in its ledger (`ledger/phone/`), which its role
// may read and write; a run's files and the kit are read through the signer's
// links (`runFiles`), as the role itself never reads `runs/`.
import crypto from 'node:crypto';
import {
  CLOUD_TAKES_AFTER_MS, CLOUD_TAKES_UNTIL_MS, checkKit, cloudClaim, cloudSessionId, cloudUserLine,
  kitKey, lastAnswerIn, replyPrompt, runKey, serverRunKey, startPayload,
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

  async function consider(cmd) {
    const person = String(cmd.owner || '').toLowerCase();
    const text = cmd.payload?.text;
    if (!PERSON.test(person) || typeof text !== 'string' || !text.trim() || PHONE_FILE.test(text) || !cmd.item) return 'left';
    const tries = await readJson(tryKey(person, cmd.id));
    if (tries && (tries.n >= PHONE_TRIES || now() - tries.at < TRY_AGAIN_MS)) return 'left';
    const kit = await kitOf(person, cmd);
    if (!kit) return 'left';
    const free = await room(person);
    if (!free.ok) { once(`room:${free.error}`, `phone: no room to start a reply in the cloud (${free.error})`); return 'left'; }
    const runId = crypto.randomUUID();
    const claim = cloudClaim(runId);
    if (!(await db.claim(cmd.id, claim, iso(now())))) return 'computer';
    const sessionId = cloudSessionId(cmd.item, runId);
    const giveBack = async (why) => {
      try { await db.giveBack(cmd.id, claim); } catch (err) { log(`phone: could not give back the claim on ${cmd.id}: ${err?.message || err}`); }
      await failed(person, cmd, tries, why);
      return 'refused';
    };
    let answer;
    try {
      const payload = await startPayload(kit, {
        runId,
        getUrl: (k) => links.get(scopedKey(person, k), LINK_SECONDS),
        putUrl: (k) => links.put(scopedKey(person, k), LINK_SECONDS),
        loginName: (k) => `${LOGIN_NAME}${k}`,
        kept: kit.kept ?? null,
      });
      answer = await start(person, sessionId, payload);
    } catch (err) {
      return giveBack(err?.error || 'cloud');
    }
    if (!answer?.ok) return giveBack(answer?.error || 'no answer');
    const data = Buffer.from(cloudUserLine(replyPrompt(kit.frame, text), { note: kit.note ?? null, uuid: crypto.randomUUID() })).toString('base64');
    let heard = false;
    for (let i = 0; i < 3 && !heard; i += 1) {
      try { heard = !!(await input(person, sessionId, { action: 'stdin', runId, n: 1, data }))?.ok; } catch { /* asked again below */ }
    }
    if (!heard) {
      // A run with no reply would sit until its ceiling.
      await stop(person, sessionId).catch(() => {});
      return giveBack('the reply did not reach the run');
    }
    const rec = {
      runId, sessionId, command: cmd.id, owner: person, device: cmd.device, project: cmd.project, item: cmd.item,
      reply: text, repliedAt: cmd.created_at, startedAt: now(), kitMadeAt: kit.madeAt,
    };
    await objects.put(openKey(person, runId), JSON.stringify(rec));
    try { await runFiles.put(scopedKey(person, serverRunKey(runId)), JSON.stringify(rec)); } catch (err) { once('record', `phone: could not leave the run's record for the computer: ${err?.message || err}`); }
    log(`phone: started reply ${cmd.id} in the cloud as ${runId}`);
    return 'started';
  }

  // What she sees when an agent handed the thread back for its computer.
  const answerOf = (events) => {
    const a = lastAnswerIn(events);
    if (!a || a.isError || !a.text.trim()) return NO_ANSWER;
    if (handsBack(a.text)) {
      const what = a.text.split('\n').find((l) => l.trimStart().startsWith(HAND_BACK)).trim().slice(HAND_BACK.length).trim();
      return `This needs your computer${what ? ` (${what})` : ''}. It carries on there when your computer is back.`;
    }
    return a.text;
  };

  async function alert(person, rec, title) {
    let phones;
    try { phones = await db.pushDevices(person); } catch (err) { once('push-read', `phone: could not read the phones to alert: ${err?.message || err}`); return; }
    if (!phones?.length) return;
    const say = phoneBanner([{ kind: 'item', title }]);
    const messages = phones.map((p) => ({ to: p.token, title: say.title, body: say.body, sound: 'default', priority: 'high', channelId: 'default', data: { product: `${rec.project}@${rec.device}`, id: rec.item } }));
    let tickets;
    try { tickets = await sendPush(messages); } catch (err) { once('push-send', `phone: could not send an alert: ${err?.message || err}`); return; }
    for (const [i, t] of (tickets ?? []).entries()) {
      if (t?.status === 'ok') continue;
      const why = t?.details?.error ?? t?.message ?? 'no answer';
      if (why === 'DeviceNotRegistered') await db.dropPushDevice(person, messages[i].to).catch((err) => once('push-drop', `phone: could not forget a phone: ${err?.message || err}`));
      else once(`push:${why}`, `phone: Expo did not take an alert: ${why}`);
    }
  }

  /** A run this server started has ended: its answer goes to the phone, once. */
  async function runEnded(person, runId) {
    const rec = await readJson(openKey(person, runId));
    if (!rec) return false;
    try { await objects.put(endedKey(person, runId), JSON.stringify({ at: now() }), { ifNoneMatch: '*' }); } catch (err) {
      if (err?.conflict) return false;
      throw err;
    }
    try {
      const answer = answerOf(await readFile(scopedKey(person, runKey(runId, 'events.jsonl'))));
      const row = await db.thread(person, rec.device, rec.project, rec.item);
      const title = row?.snapshot?.item?.title ?? '';
      const next = row ? withCloudTurn(row.snapshot, { reply: rec.reply, answer, repliedAt: Date.parse(rec.repliedAt) || rec.startedAt, answeredAt: now() }) : null;
      if (next) await db.writeThread(person, rec.device, rec.project, rec.item, next);
      else once('no-thread', 'phone: a cloud run ended for a thread the phone no longer has');
      await db.taken(rec.command, ANSWERED_OUTCOME, iso(now()));
      await alert(person, rec, title);
      await objects.del(openKey(person, runId));
      return true;
    } catch (err) {
      // The sweep comes back to it.
      await objects.del(endedKey(person, runId)).catch(() => {});
      log(`phone: could not finish cloud run ${runId}: ${err?.message || err}`);
      return false;
    }
  }

  async function sweep() {
    const t = now();
    let rows = [];
    try { rows = await db.waitingReplies({ after: t - CLOUD_TAKES_UNTIL_MS, before: t - CLOUD_TAKES_AFTER_MS, limit: PER_SWEEP }) ?? []; } catch (err) {
      once(`list:${err?.message}`, `phone: could not read the phones' replies: ${err?.message || err}`);
    }
    const out = { looked: rows.length, started: 0, ended: 0 };
    for (const cmd of rows) {
      try { if ((await consider(cmd)) === 'started') out.started += 1; } catch (err) { log(`phone: reply ${cmd?.id} was passed: ${err?.message || err}`); }
    }
    // Ends whose notice was missed.
    for (const key of await objects.list('ledger/phone/open/')) {
      const m = /^ledger\/phone\/open\/([0-9a-f-]{36})\/([^/]+)\.json$/.exec(key);
      if (!m) continue;
      const rec = await readJson(key);
      if (!rec || t - rec.startedAt < END_LOOK_AFTER_MS) continue;
      if (!(await objects.head(`runs/u-${m[1]}/${m[2]}/done.json`).catch(() => null))) continue;
      if (await runEnded(m[1], m[2])) out.ended += 1;
    }
    return out;
  }

  return { sweep, runEnded };
}
