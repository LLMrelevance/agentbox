// A THREAD'S NEXT TURN, READY FOR THE CLOUD TO START WITH THE COMPUTER SHUT
// (docs/cloud/PHONE-PLAN.md step 2, docs/cloud/PLAN.md "Next" step 4).
//
// After each turn of a thread that is on the phone, the computer leaves a kit
// in the person's cloud storage: everything a cloud start needs (the folder's
// bundle, the files a run takes, the arguments, the sign-in by name) except
// the reply and the run's own links. A reply the computer has not claimed
// within CLOUD_TAKES_AFTER_MS is started from the kit by the cloud server
// (cloud/gateway/phone.mjs), which claims the command `cloud:<run id>`; the
// computer, waking, joins that run as it joins one it left going
// (main/cloud/run.mjs `joining`) and brings its work home.
//
// Shared by the computer (main/cloud/kit.mjs), the server and the phone, so
// all three agree on the names. Pure: no file, no network.

export const KIT_VERSION = 1;

// Where the reply goes in the turn's prompt. Characters no prompt carries, so
// it is found once or not at all.
export const REPLY_MARK = '⁣AGENTBOX-REPLY⁣';

// A computer that is awake claims a phone command within seconds; one left
// this long is the cloud's to start.
export const CLOUD_TAKES_AFTER_MS = 60_000;
// And one older than this is left to the computer: the phone said it long ago.
export const CLOUD_TAKES_UNTIL_MS = 24 * 60 * 60_000;
// Inside the bucket's seven-day expiry of `runs/`, with a day's room.
export const KIT_FRESH_MS = 6 * 24 * 60 * 60_000;
const KIT_BYTES = 2 * 1024 * 1024;

const CLAIM = /^cloud:([A-Za-z0-9._-]{1,120})$/;
export const cloudClaim = (runId) => `cloud:${runId}`;
export const runOfClaim = (claimedBy) => (typeof claimedBy === 'string' && CLAIM.test(claimedBy) ? claimedBy.match(CLAIM)[1] : null);

// The same name main/cloud/run.mjs gives a run it starts, so a computer
// joining a run the server started asks for it by the name it would have used.
export const cloudSessionId = (item, runId) => `agentbox-${String(item || 'run').replace(/[^a-zA-Z0-9-]/g, '')}-${runId}`;

const seg = (s) => String(s ?? '').replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_').slice(0, 120) || '_';
/** Where a thread's kit lives in the person's own storage. */
export const kitKey = (device, project, item) => `runs/kits/${seg(device)}/${seg(project)}/${seg(item)}.json`;
/** What the server keeps about a run it started, for the moment it ends. */
export const serverRunKey = (runId) => `runs/server/${seg(runId)}.json`;
/** The objects a run writes as it ends, named as main/cloud/run.mjs names them. */
export const runKey = (runId, name) => `runs/${runId}/${name}`;

/** The text either side of the reply, or null when the prompt has no one place for it. */
export function replyFrame(prompt) {
  const text = String(prompt ?? '');
  const at = text.indexOf(REPLY_MARK);
  if (at < 0 || text.indexOf(REPLY_MARK, at + 1) >= 0) return null;
  return { before: text.slice(0, at), after: text.slice(at + REPLY_MARK.length) };
}

export const replyPrompt = (frame, reply) => `${frame.before}${String(reply ?? '')}${frame.after}`;

// The first line on the agent's input, as the computer writes one
// (main/claude-input.mjs), with the cloud's note at its top the way
// main/cloud/run.mjs `claudeLineForTheCloud` puts it on a resumed run.
export function cloudUserLine(text, { note = null, uuid } = {}) {
  const content = note ? `${note}\n\n${text}` : String(text);
  return `${JSON.stringify({ type: 'user', uuid, message: { role: 'user', content }, parent_tool_use_id: null, session_id: '' })}\n`;
}

const isKey = (k) => typeof k === 'string' && /^runs\/[A-Za-z0-9._@+=/-]+$/.test(k) && !k.includes('..');
const isLoginKey = (k) => typeof k === 'string' && /^logins\/[A-Za-z0-9._@+=/-]+$/.test(k) && !k.includes('..');
const isPath = (p) => typeof p === 'string' && p.startsWith('/') && !p.includes('\0');
const strings = (a) => Array.isArray(a) && a.every((s) => typeof s === 'string');

/** Why a kit cannot be started from, or null. Read by the server before it trusts one. */
export function checkKit(kit, { now = Date.now() } = {}) {
  if (!kit || typeof kit !== 'object') return 'not a kit';
  if (kit.v !== KIT_VERSION) return 'another version of kit';
  if (kit.engine !== 'claude') return 'only Claude Code threads carry on in the cloud';
  if (!(now - Number(kit.madeAt) < KIT_FRESH_MS)) return 'the kit is too old';
  if (!isPath(kit.cwd)) return 'no folder';
  if (!strings(kit.argv) || !kit.argv.length) return 'no command';
  if (!kit.frame || typeof kit.frame.before !== 'string' || typeof kit.frame.after !== 'string') return 'no place for the reply';
  if (!kit.login || kit.login.engine !== 'claude' || !isLoginKey(kit.login.key)) return 'no sign-in';
  if (kit.env && (typeof kit.env !== 'object' || !Object.values(kit.env).every((v) => typeof v === 'string'))) return 'bad environment';
  if (!kit.plain && typeof kit.branch !== 'string') return 'no branch';
  if (kit.bundleKey !== undefined && kit.bundleKey !== null && !isKey(kit.bundleKey)) return 'bad bundle';
  if (kit.base && (!isKey(kit.base.key) || typeof kit.base.sha !== 'string')) return 'bad base';
  if (!kit.plain && !kit.bundleKey && !kit.base) return 'no copy of the folder';
  for (const f of kit.files ?? []) if (!isPath(f?.path) || !isKey(f.key) || (f.untar !== undefined && !isPath(f.untar))) return 'bad file';
  for (const f of kit.homeFiles ?? []) if (typeof f?.rel !== 'string' || f.rel.startsWith('/') || f.rel.includes('..') || !isKey(f.key)) return 'bad home file';
  for (const b of kit.bringDirs ?? []) if (typeof b?.name !== 'string' || !/^[a-z.]+$/.test(b.name) || !isPath(b.dir)) return 'bad folder to bring home';
  if (!kit.bringDirs?.length) return 'nothing to bring home';
  if (JSON.stringify(kit).length > KIT_BYTES) return 'the kit is too large';
  return null;
}

/**
 * The sandbox's `start` for a run from this kit (cloud/sandbox/server.mjs),
 * built as main/cloud/run.mjs builds one. `getUrl(key)` and `putUrl(key)` make
 * links; the sign-in goes by name (`loginName(key)`) for the server to swap.
 */
export async function startPayload(kit, { runId, getUrl, putUrl, loginName, offlineAfterMs = 90_000, kept = null }) {
  const results = {
    bundleUrl: await putUrl(runKey(runId, 'out.bundle')),
    changesUrl: await putUrl(runKey(runId, 'changes.bundle')),
    docsUrl: await putUrl(runKey(runId, 'docs.tgz')),
    eventsUrl: await putUrl(runKey(runId, 'events.jsonl')),
    doneUrl: await putUrl(runKey(runId, 'done.json')),
    bring: await Promise.all(kit.bringDirs.map(async (b) => ({ dir: b.dir, url: await putUrl(runKey(runId, b.name)) }))),
  };
  const files = await Promise.all((kit.files ?? []).map(async (f) => ({ path: f.path, url: await getUrl(f.key), ...(f.untar ? { untar: f.untar } : {}) })));
  const homeFiles = await Promise.all((kit.homeFiles ?? []).map(async (f) => ({ rel: f.rel, url: await getUrl(f.key) })));
  return {
    action: 'start', runId, cwd: kit.cwd, branch: kit.branch ?? null,
    ...(kit.bundleKey ? { bundleUrl: await getUrl(kit.bundleKey) } : {}),
    ...(kit.plain ? { plain: true } : {}),
    ...(kit.base ? { base: { url: await getUrl(kit.base.key), sha: kit.base.sha }, refs: kit.refs ?? null } : {}),
    argv: kit.argv, env: kit.env ?? {}, files,
    ...(kit.changesRef ? { changesRef: kit.changesRef } : {}),
    ...(kit.remote ? { remote: kit.remote } : {}),
    ...(kit.docs ? { docs: kit.docs } : {}),
    ...(homeFiles.length ? { homeFiles } : {}),
    login: { engine: kit.login.engine, id: kit.login.id ?? null, url: loginName(kit.login.key) },
    results,
    tails: true,
    offline: { afterMs: offlineAfterMs, endTurn: 'claude-stream-json', kept },
  };
}

// WHAT THE AGENT LAST SAID, off a run's event log (one JSON event a line, its
// output in base64): the text of Claude Code's last `result`, and whether it
// was an error. Null when the run never got that far.
export function lastAnswerIn(eventsText) {
  let out = '';
  for (const raw of String(eventsText ?? '').split('\n')) {
    if (!raw.trim()) continue;
    let e;
    try { e = JSON.parse(raw); } catch { continue; }
    if (e?.kind === 'stdout' && typeof e.data === 'string') out += Buffer.from(e.data, 'base64').toString('utf8');
  }
  let answer = null;
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg?.type === 'result') answer = { text: String(msg.result ?? ''), isError: msg.is_error === true };
  }
  return answer;
}
