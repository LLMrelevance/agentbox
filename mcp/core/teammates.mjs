// The store tools a teammate uses on its runs: talk in the team chat, pass work
// to a teammate, keep what it learns about the person, and set itself up.
//
// Which teammate the session is comes from the app, not the model: the run it
// was started for (`ZERO_ITEM`) carries `teammate:<id>`, so no argument names
// who is speaking and no session can speak as another teammate.
import { readWorkItem } from '../../main/store/work-items.mjs';
import { listProjects, legacyRoot } from '../../main/store/project.mjs';
import {
  teamDir, readTeammates, readChat, writeTeammate, writeChat, newMemoryId,
} from '../../main/store/teammates-files.mjs';
import { teammateIdOf, hopOf, mentionsIn, isWorks, letterFor, YOU } from '../../shared/teammates.mjs';
import { periodKey } from '../../shared/repeats.mjs';
import { resolveProduct, resolveAccount } from './account.mjs';

// A title or a choice is drawn as plain words, so markdown in one shows as stars.
const plain = (s) => String(s ?? '').replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim();

const NOT_A_TEAMMATE = 'this session is not a teammate\'s run, so it has no team chat to write to';

function projectOf(itemId, product) {
  if (product) return resolveProduct(product);
  for (const p of listProjects()) {
    try { if (readWorkItem(p.dir, itemId)) return p; } catch { /* a product with no ledger */ }
  }
  throw new Error(`no thread ${itemId} in any product`);
}

// `outsider` lets a thread that is no teammate's run in: it speaks for the
// person (`me` is null), which is what they asked it to do.
export function teammateContext({ env = process.env, now = Date.now(), outsider = false } = {}) {
  const itemId = String(env.ZERO_ITEM ?? '').trim();
  if (!itemId) throw new Error(NOT_A_TEAMMATE);
  const project = projectOf(itemId, String(env.ZERO_PRODUCT ?? '').trim() || null);
  const item = readWorkItem(project.dir, itemId, now);
  if (!item) throw new Error(`no thread ${itemId} in ${project.name}`);
  const tid = teammateIdOf(item);
  if (!tid && !outsider) throw new Error(NOT_A_TEAMMATE);
  const accountId = String(env.STORE_ACCOUNT_ID ?? '').trim() || resolveAccount().accountId;
  const dir = teamDir(legacyRoot(), accountId);
  const team = readTeammates(dir, now);
  if (!tid) return { dir, me: null, team, item, project, hop: 0, via: { via: item.id, viaProduct: project.id } };
  const me = team.find((t) => t.id === tid);
  if (!me) throw new Error(`the teammate behind ${itemId} is no longer on the team`);
  return { dir, me, team, item, project, hop: hopOf(item), via: {} };
}

function idsFor(names, team, me) {
  const list = (Array.isArray(names) ? names : [names]).map((n) => String(n ?? '').trim().replace(/^@/, '')).filter(Boolean);
  const out = [];
  for (const n of list) {
    const lower = n.toLowerCase();
    const t = team.find((x) => x.id === n || x.name.toLowerCase() === lower);
    if (!t) throw new Error(`no teammate called ${n}. The team: ${team.map((x) => x.name).join(', ')}`);
    if (t.id !== me?.id) out.push(t.id);
  }
  return out;
}

export function teamPost({ text, to = [], options } = {}, ctx = {}) {
  const { dir, me, team, hop, via } = teammateContext({ ...ctx, outsider: true });
  const words = String(text ?? '').trim();
  if (!words) throw new Error('nothing to post');
  const ids = new Set([...idsFor(to, team, me), ...mentionsIn(words, team).filter((x) => x !== me?.id)]);
  const opts = me && Array.isArray(options) ? options.map(plain).filter(Boolean).slice(0, 4) : null;
  const m = writeChat(dir, { kind: 'msg', from: me?.id ?? YOU, to: [...ids], text: words.slice(0, 4000), hop, ...via, ...(opts?.length ? { options: opts } : {}) }, ctx.now);
  return { posted: m.id, to: [...ids].map((x) => team.find((t) => t.id === x)?.name), note: ids.size ? 'The teammates named will wake to read it.' : 'Posted. Nobody was named, so nobody is woken by it.' };
}

export function teamPass({ to, title, details, project: named } = {}, ctx = {}) {
  const { dir, me, team, hop, via, project } = teammateContext({ ...ctx, outsider: true });
  // The work is done where it is named, or for a thread handing it on, in that
  // thread's project; otherwise in the receiver's own.
  const where = named ? resolveProduct(named).id : me ? null : project.id;
  const [target] = idsFor(to, team, me);
  if (!target) throw new Error('pass work to another teammate, not to yourself');
  const what = plain(title);
  if (!what) throw new Error('give the work a short title');
  const m = writeChat(dir, { kind: 'pass', from: me?.id ?? YOU, to: target, title: what.slice(0, 200), details: String(details ?? '').slice(0, 6000), hop, ...via, ...(where ? { product: where } : {}) }, ctx.now);
  return { passed: m.id, to: team.find((t) => t.id === target)?.name };
}

export function teamRemember({ text } = {}, ctx = {}) {
  const { dir, me, item } = teammateContext(ctx);
  const words = String(text ?? '').trim();
  if (!words) throw new Error('nothing to remember');
  if (me.memory.some((m) => m.text.toLowerCase() === words.toLowerCase())) return { remembered: false, note: 'already kept' };
  const now = ctx.now ?? Date.now();
  const mem = { id: newMemoryId(), text: words.slice(0, 300), from: `run ${item.id}`, at: now };
  writeTeammate(dir, me.id, { remember: mem }, now);
  writeChat(dir, { kind: 'act', from: me.id, verb: 'learned', text: mem.text, ref: mem.id }, now);
  return { remembered: true, id: mem.id };
}

const EVERY = ['day', 'weekday', 'week', 'never'];

export function teamSetup({ name, role, job, goal, counted, asksFirst, every, at, on, runsOn, ready } = {}, ctx = {}) {
  const { dir, me, team } = teammateContext(ctx);
  const now = ctx.now ?? Date.now();
  const patch = {};
  if (typeof name === 'string' && name.trim()) {
    const clean = name.trim().split(/\s+/)[0].slice(0, 20);
    if (team.some((t) => t.id !== me.id && t.name.toLowerCase() === clean.toLowerCase())) throw new Error(`${clean} is taken; pick another name`);
    patch.name = clean;
    patch.letter = letterFor(clean, team.filter((t) => t.id !== me.id));
  }
  for (const [k, v] of Object.entries({ role, job, goal, counted, asksFirst })) if (typeof v === 'string' && v.trim()) patch[k] = v.trim();
  if (every !== undefined) {
    if (!EVERY.includes(every)) throw new Error(`every is one of ${EVERY.join(', ')}`);
    if (every === 'never') patch.works = null;
    else {
      const works = { every, at: at ?? '09:00', ...(every === 'week' ? { on: Number.isInteger(on) ? on : 1 } : {}) };
      if (!isWorks(works)) throw new Error('at is HH:MM in 24 hours, and on is 0 (Sunday) to 6 for a weekly round');
      patch.works = works;
      patch.served = periodKey(works, now) ?? '';
    }
  }
  if (runsOn !== undefined) {
    if (runsOn !== 'claude' && runsOn !== 'codex') throw new Error('runsOn is claude or codex');
    patch.engine = runsOn;
  }
  if (ready === true) patch.status = 'active';
  writeTeammate(dir, me.id, patch, now);
  if (ready === true && me.status === 'draft') writeChat(dir, { kind: 'act', from: me.id, verb: 'started' }, now);
  const after = readTeammates(dir, now).find((t) => t.id === me.id);
  return { teammate: { name: after.name, role: after.role, job: after.job, goal: after.goal, counted: after.counted, asksFirst: after.asksFirst, works: after.works, runsOn: after.engine ?? 'your default', status: after.status } };
}

export function teamRoster(ctx = {}) {
  const { dir, me, team } = teammateContext({ ...ctx, outsider: true });
  const { messages } = readChat(dir);
  const nameOf = (id) => (id === YOU ? 'the person' : team.find((t) => t.id === id)?.name ?? 'a teammate');
  return {
    you: me?.name ?? null,
    team: team.map((t) => ({ name: t.name, role: t.role, job: t.job, paused: t.paused, status: t.status })),
    recent: messages.filter((m) => m.kind === 'msg' || m.kind === 'pass').slice(-20).map((m) => ({ from: nameOf(m.from), to: m.kind === 'pass' ? [nameOf(m.to)] : (m.to ?? []).map(nameOf), text: m.kind === 'pass' ? `passed: ${m.title}` : m.text, at: new Date(m.ts).toISOString() })),
  };
}
