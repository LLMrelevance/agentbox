#!/usr/bin/env node
// A REAL AGENTBOX, UNDER /tmp, THAT A VERIFYING AGENT CAN DRIVE AND THROW AWAY.
//
//   node .claude/skills/verify-agentbox/scripts/live.mjs up [--real-claude]
//   node .claude/skills/verify-agentbox/scripts/live.mjs doctor
//   node .claude/skills/verify-agentbox/scripts/live.mjs drive <name> [--out <dir>]
//   node .claude/skills/verify-agentbox/scripts/live.mjs down
//   node .claude/skills/verify-agentbox/scripts/live.mjs drives      (list them)
//
// WHAT IT RUNS. `bin/agentbox.mjs`, the browser copy of the app: the same
// store, supervisor, IPC handlers and renderer as the desktop, with no
// Electron. It is the only way to have a second Agentbox on this Mac that
// cannot touch the one somebody is using: its own store, its own port, its
// own account, under one folder that `down` deletes.
//
// WHO ANSWERS. By default the worker is scripts/lib/stub-claude-worker.mjs,
// which is not Claude Code and says so: everything on Agentbox's side of the
// spawn is real and nothing is billed. `--real-claude` leaves `claudeBin`
// unset, so the app finds Claude Code exactly as a new user's copy would, and
// spawns it for real on this person's subscription. It writes a session into
// ~/.claude like any run, so use it for the pre-deploy proof, not for every
// iteration.
//
// One instance per checkout, so two agents verifying two branches on one Mac
// do not drive each other's. Evidence goes to /tmp/agentbox-verify/runs and
// survives `down`.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(here, '../../../..');
export const ROOT = '/tmp/agentbox-verify';
export const RUNS = path.join(ROOT, 'runs');
const { FRESH_USER_ENV } = await import(path.join(REPO, 'shared', 'fresh-user-home.mjs'));
const KEY = crypto.createHash('sha1').update(REPO).digest('hex').slice(0, 8);
export const INSTANCE = path.join(ROOT, 'instances', KEY);
const STATE = path.join(INSTANCE, 'instance.json');
export const STUB = path.join(REPO, 'scripts', 'lib', 'stub-claude-worker.mjs');
export const PRODUCT = { slug: 'sandbox', name: 'Sandbox' };
const ACCOUNT = 'verify-account';

const say = (s = '') => console.log(s);
const stop = (s, code = 1) => { console.error(`live: ${s}`); process.exit(code); };

export function readState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return null; }
}
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const commandOf = (pid) => { try { return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).trim(); } catch { return ''; } };

/** Newest mtime under a folder, for "is the built screen older than its source?". */
function newest(dir) {
  let best = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    best = Math.max(best, e.isDirectory() ? newest(p) : fs.statSync(p).mtimeMs);
  }
  return best;
}
export function screenIsStale() {
  const built = path.join(REPO, 'renderer', 'dist', 'index.html');
  if (!fs.existsSync(built)) return 'not built';
  return newest(path.join(REPO, 'renderer', 'src')) > fs.statSync(built).mtimeMs ? 'older than renderer/src' : null;
}

/**
 * THE ENVIRONMENT THE COPY STARTS WITH. This script is usually run by an agent
 * that is itself an Agentbox worker, so it inherits ZERO_ITEM, STORE_* and the
 * rest of a worker's identity. Passed through, the copy's own workers would
 * write to the founder's real row. Everything that names a store, an item, an
 * account or a billing route is taken out; the app adds back what it means to.
 */
export function cleanEnv(base = process.env) {
  const out = {};
  for (const [k, v] of Object.entries(base)) {
    if (/^(ZERO_|STORE_|AGENTBOX_|ASTRAL_|ANTHROPIC_|CLAUDE_CODE_|OPENAI_|CODEX_)/.test(k)) continue;
    if (['CLAUDECODE', 'CLAUDE_PID', 'CLAUDE_EFFORT', 'MCP_CONNECTION_NONBLOCKING'].includes(k)) continue;
    out[k] = v;
  }
  return out;
}

async function up(args) {
  const state = readState();
  if (state && alive(state.pid)) { say(`already up: ${state.url}`); return; }
  if (state) fs.rmSync(INSTANCE, { recursive: true, force: true });

  const stale = screenIsStale();
  if (stale) {
    say(`the built screen is ${stale}; building it (npx vite build renderer)`);
    const b = spawnSync('npx', ['vite', 'build', 'renderer', '--logLevel', 'warn'], { cwd: REPO, stdio: 'inherit' });
    if (b.status !== 0) stop('the screen did not build, so there is nothing to drive.');
  }

  const real = args.includes('--real-claude');
  const data = path.join(INSTANCE, 'data');
  const storeRoot = path.join(INSTANCE, 'store');
  const accountRoot = path.join(storeRoot, 'accounts', ACCOUNT);
  const repo = path.join(INSTANCE, 'repos', PRODUCT.slug);
  const receipts = path.join(INSTANCE, 'receipts');
  for (const d of [data, path.join(accountRoot, PRODUCT.slug), repo, receipts]) fs.mkdirSync(d, { recursive: true });

  // A project with a real git repo behind it, so a worker has somewhere to stand
  // and the first-run walk (which a store with no projects gets) is skipped.
  fs.writeFileSync(path.join(repo, 'README.md'), '# Sandbox\n\nA throwaway project for verifying Agentbox.\n');
  const git = (...a) => execFileSync('git', a, { cwd: repo, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  git('add', '-A');
  git('-c', 'user.email=verify@agentbox.invalid', '-c', 'user.name=verify', 'commit', '-qm', 'seed');
  fs.writeFileSync(path.join(accountRoot, PRODUCT.slug, 'project.json'), `${JSON.stringify({
    schemaVersion: 2, id: PRODUCT.slug, name: PRODUCT.name, repoPath: repo, oneLiner: 'a throwaway project for verification',
  }, null, 1)}\n`);

  const plan = path.join(INSTANCE, 'stub-plan.json');
  fs.writeFileSync(plan, `${JSON.stringify({ say: 'The verify stand-in ran and answered.', receipts }, null, 1)}\n`);
  fs.writeFileSync(path.join(data, 'zero.config.json'), `${JSON.stringify({
    storeRoot,
    accountId: ACCOUNT,
    ...(real ? {} : { claudeBin: STUB }),
    // A first launch writes this itself; set here so the copy is the same on
    // every run and Codex may be picked from the composer.
    engineChoice: '2026-01-01T00:00:00.000Z',
    maxConcurrentSessions: 2,
  }, null, 2)}\n`);

  const log = path.join(INSTANCE, 'app.log');
  const fd = fs.openSync(log, 'a');
  const child = spawn(process.execPath, [path.join(REPO, 'bin', 'agentbox.mjs'), '--dir', data, '--no-open'], {
    cwd: REPO,
    detached: true,
    stdio: ['ignore', fd, fd],
    // The fresh-user flag is the app's own word for "this copy is nobody": no
    // team cloud even on a Mac that has a team key (so no sign-in screen and
    // nothing written to the shared project), and any counts go under the one
    // id that names itself as not a person (shared/fresh-user-home.mjs).
    env: { ...cleanEnv(), STUB_CLAUDE_PLAN: plan, [FRESH_USER_ENV]: '1' },
  });
  child.unref();

  const deadline = Date.now() + 30_000;
  let url = null;
  while (!url && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
    url = fs.readFileSync(log, 'utf8').match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/)?.[0] ?? null;
    if (!alive(child.pid)) break;
  }
  if (!url) {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
    stop(`the copy never printed its address. Its log:\n${fs.readFileSync(log, 'utf8').slice(-3000)}`);
  }
  const next = { pid: child.pid, url, repoRoot: REPO, instance: INSTANCE, data, storeRoot, accountRoot, repo, receipts, plan, log, engine: real ? 'real-claude' : 'stub', startedAt: new Date().toISOString() };
  fs.writeFileSync(STATE, `${JSON.stringify(next, null, 1)}\n`);
  say(`up: ${url}`);
  say(`worker: ${real ? 'the Claude Code this Mac has (billed to its subscription)' : 'the stand-in (scripts/lib/stub-claude-worker.mjs)'}`);
  say(`store: ${storeRoot}`);
  say('next: live.mjs doctor');
}

/** Is this instance worth driving? Read-only. Returns the list of what is wrong. */
export async function doctor({ quiet = false } = {}) {
  const wrong = [];
  const ok = (s) => { if (!quiet) say(`  ok    ${s}`); };
  const bad = (s) => { wrong.push(s); if (!quiet) say(`  WRONG ${s}`); };
  const state = readState();
  if (!state) { bad('no instance for this checkout. Run: live.mjs up'); return wrong; }
  if (alive(state.pid)) ok(`process ${state.pid} is running`); else bad(`process ${state.pid} is gone. Run: live.mjs down, then up`);
  const cmd = commandOf(state.pid);
  if (cmd.includes('bin/agentbox.mjs') && cmd.includes(state.data)) ok('it is our copy (bin/agentbox.mjs on our data folder)');
  else if (alive(state.pid)) bad(`pid ${state.pid} is something else now: ${cmd}`);
  try {
    const res = await fetch(state.url);
    const body = await res.text();
    if (res.ok && body.includes('<div id="root"')) ok(`the address answers with the screen (${new URL(state.url).host})`);
    else bad(`the address answered ${res.status} without the screen`);
  } catch (err) { bad(`the address does not answer: ${err.message}`); }
  const stale = screenIsStale();
  if (stale) bad(`the built screen is ${stale}, so a drive would test old code. Run: live.mjs down, then up`);
  else ok('the built screen is newer than its source');
  if (state.engine === 'stub') {
    try { fs.accessSync(STUB, fs.constants.X_OK); ok('the stand-in worker is executable'); } catch { bad(`the stand-in worker is not executable: ${STUB}`); }
  } else {
    ok('worker: the Claude Code this Mac has');
  }
  const log = fs.existsSync(state.log) ? fs.readFileSync(state.log, 'utf8') : '';
  const errors = log.split('\n').filter((l) => /\b(Error|TypeError|ReferenceError|Unhandled)\b/.test(l));
  if (errors.length) bad(`the copy's log has ${errors.length} error line(s); first: ${errors[0].slice(0, 200)}`);
  else ok('the copy\'s log has no errors');
  return wrong;
}

async function down() {
  const state = readState();
  if (!state) { say('nothing to take down for this checkout.'); fs.rmSync(INSTANCE, { recursive: true, force: true }); return; }
  // Only what we started: the process group `up` made, then anything still
  // running out of this instance's folder (a worker the group missed).
  if (alive(state.pid) && commandOf(state.pid).includes(state.data)) {
    try { process.kill(-state.pid, 'SIGTERM'); } catch { /* gone */ }
    const deadline = Date.now() + 5000;
    while (alive(state.pid) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
    try { process.kill(-state.pid, 'SIGKILL'); } catch { /* gone */ }
  }
  const strays = execFileSync('ps', ['-Ao', 'pid=,command='], { encoding: 'utf8' }).split('\n')
    .map((l) => l.trim().match(/^(\d+)\s+(.*)$/)).filter((m) => m && m[2].includes(INSTANCE) && Number(m[1]) !== process.pid);
  for (const m of strays) { try { process.kill(Number(m[1]), 'SIGKILL'); } catch { /* gone */ } }
  fs.rmSync(INSTANCE, { recursive: true, force: true });
  say(`down: stopped the copy${strays.length ? ` and ${strays.length} stray process(es)` : ''}, removed ${INSTANCE}. Evidence in ${RUNS} is kept.`);
}

async function drive(args) {
  const { DRIVES } = await import('./drives.mjs');
  const name = args.find((a) => !a.startsWith('--'));
  if (!name || !DRIVES[name]) stop(`which drive? ${Object.keys(DRIVES).join(', ')}`, 2);
  const wrong = await doctor({ quiet: true });
  if (wrong.length) stop(`the instance is not worth driving:\n  ${wrong.join('\n  ')}`);
  const at = args.indexOf('--out');
  const out = at >= 0 ? path.resolve(args[at + 1]) : path.join(RUNS, `${new Date().toISOString().replace(/[:.]/g, '-')}-${name}`);
  fs.mkdirSync(out, { recursive: true });
  const { openTab } = await import('./cdp.mjs');
  const state = readState();
  const tab = await openTab(state.url);
  const claims = [];
  // `known` names the thread a product gap is filed on. The claim still runs
  // and still prints; a failure reads KNOWN instead of FAIL, so the drive stays
  // usable as a gate while the gap waits on its own fix, and a pass says the
  // marker can come off.
  const claim = (ok, sentence, evidence = '', { known = null } = {}) => {
    claims.push({ ok: !!ok, sentence, evidence, known });
    const mark = ok ? 'PASS' : known ? 'KNOWN' : 'FAIL';
    say(`  ${mark.padEnd(5)} ${sentence}${evidence ? `  (${evidence})` : ''}${!ok && known ? `  [filed: ${known}]` : ''}${ok && known ? `  [holds now: take the known marker for ${known} off]` : ''}`);
    return !!ok;
  };
  let shot = 0;
  const capture = async (label) => tab.capture(path.join(out, `${String(++shot).padStart(2, '0')}-${label}.png`));
  say(`drive ${name}: ${DRIVES[name].what}`);
  try {
    await tab.goto(state.url);
    await DRIVES[name].run({ tab, state, claim, capture, out });
  } catch (err) {
    claim(false, `the drive finished without throwing`, String(err?.message ?? err).split('\n')[0]);
    await capture('when-it-failed').catch(() => {});
  } finally {
    claim(tab.errors.length === 0, 'the page threw no errors', tab.errors.slice(0, 3).join(' | '));
    tab.close();
  }
  fs.writeFileSync(path.join(out, 'report.json'), `${JSON.stringify({ drive: name, at: new Date().toISOString(), engine: state.engine, claims, errors: tab.errors }, null, 1)}\n`);
  const failed = claims.filter((c) => !c.ok && !c.known).length;
  const known = claims.filter((c) => !c.ok && c.known).length;
  say(`\n${claims.length - failed - known}/${claims.length} claims held${known ? `, ${known} known gap(s)` : ''}. Evidence: ${out}`);
  if (failed) say('After a failed drive: live.mjs doctor before the next one.');
  process.exit(failed ? 1 : 0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [verb, ...args] = process.argv.slice(2);
  if (verb === 'up') await up(args);
  else if (verb === 'doctor') { const w = await doctor(); process.exit(w.length ? 1 : 0); }
  else if (verb === 'drive') await drive(args);
  else if (verb === 'down') await down();
  else if (verb === 'drives') { const { DRIVES } = await import('./drives.mjs'); for (const [k, d] of Object.entries(DRIVES)) say(`${k.padEnd(20)} ${d.what}`); }
  else stop('usage: live.mjs up [--real-claude] | doctor | drive <name> [--out dir] | down | drives', 2);
}
