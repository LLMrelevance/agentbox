// ONE CLOUD RUN, AS SEEN FROM THE MAC: A LOCAL PROCESS THAT COMPUTES ELSEWHERE.
//
// docs/cloud/PLAN.md. For a cloud run the supervisor spawns this in place of
// `claude`, with the same argv, env and cwd. To the supervisor it is a worker:
// what the agent prints arrives on stdout byte for byte, what the supervisor
// writes to stdin (the prompt, live replies, interrupts, the close at the end)
// reaches the agent in order, and it exits with the agent's exit code once the
// agent's work is back in the task folder.
//
// What it does in between:
//   1. Brings home any earlier cloud run in this folder that never came back
//      (an app that quit mid-run), before it does anything else.
//   2. Packs the task folder (its branch, main, and any uncommitted work) and
//      the files the agent will need at the same absolute paths: the settings
//      file without the Mac-only memory hooks, an MCP config whose servers are
//      the sandbox's stubs, the transcript a `--resume` needs, the account's
//      skills, commands and agents, and any file the prompt names.
//   3. Starts the sandbox, then pumps: events out (stdout, stderr, MCP lines),
//      input in (stdin, MCP replies), every input numbered so a resend after a
//      lost reply is applied once.
//   4. Runs the app's MCP servers HERE, from the original config, with the
//      worker's own environment, exactly as Claude Code would have, and joins
//      each to its stub in the sandbox. `look_at_page` is withheld: it would
//      look at this Mac's localhost, not the sandbox's.
//   5. When the sandbox reports its results uploaded, fetches them from S3 and
//      lays them into the folder: commits fast-forwarded, uncommitted work
//      reapplied, transcripts unpacked. Only then does the marker go.
//   6. On SIGTERM (Stop, archive, preemption, quit) it cancels the remote
//      command and still does 5, so the work and the transcript come home and
//      the app's ordinary resume can take it from there.
//
// Exit codes: the agent's own, when its work came home. 75 (EX_TEMPFAIL) when
// the agent may have finished but its work could not be brought back; the
// marker stays, so shipping and cleanup leave the folder alone, and the next
// run in this folder tries again.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { readMarker, writeMarker, clearMarker } from './marker.mjs';

export const IMPORT_FAILED = 75;
const STUB = '/opt/agentbox/mcp-stub.mjs';
const WITHHELD_TOOLS = new Set(['look_at_page']);
const MAX_ATTACHMENT = 25 * 1024 * 1024;
const RESULTS_WAIT_MS = 3 * 60_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Where Claude Code keeps a folder's transcripts: every character that is not
// a letter or a digit becomes '-'. The supervisor's transcriptFile reads the
// same rule.
export function transcriptFolderName(cwd) { return cwd.replace(/[^a-zA-Z0-9]/g, '-'); }

export function argValue(argv, flag) {
  const i = argv.indexOf(flag);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
}

function git(cwd, args, opts = {}) {
  return execFileSync('git', args, { cwd, encoding: opts.buffer ? undefined : 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 512 * 1024 * 1024, ...opts });
}
const gitOk = (cwd, args) => { try { git(cwd, args); return true; } catch { return false; } };

// Commit what the folder holds that is not committed, onto its own ref,
// without touching the branch, the index or the files.
function snapshotUncommitted(cwd, ref) {
  if (!git(cwd, ['status', '--porcelain', '--untracked-files=all']).trim()) return false;
  const index = path.join(os.tmpdir(), `agentbox-cloud-index-${process.pid}-${crypto.randomUUID()}`);
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    git(cwd, ['read-tree', 'HEAD'], { env });
    git(cwd, ['add', '-A'], { env });
    const tree = git(cwd, ['write-tree'], { env }).trim();
    const commit = git(cwd, ['-c', 'user.name=Agentbox', '-c', 'user.email=agentbox@localhost', 'commit-tree', tree, '-p', 'HEAD', '-m', 'Uncommitted work sent to a cloud run'], { env }).trim();
    git(cwd, ['update-ref', ref, commit]);
    return true;
  } finally {
    fs.rmSync(index, { force: true });
  }
}

/* ------------------------------ the launch ------------------------------- */

// The settings file the supervisor wrote, minus anything that runs a program
// on THIS Mac: the memory gate's hooks call a local script over a local socket.
export function settingsForTheCloud(text) {
  let s;
  try { s = JSON.parse(text); } catch { return text; }
  delete s.hooks;
  return JSON.stringify(s, null, 2);
}

export function mcpConfigForTheCloud(config, stubPath = STUB) {
  const servers = {};
  for (const name of Object.keys(config?.mcpServers || {})) servers[name] = { command: 'node', args: [stubPath, name], env: {} };
  return { mcpServers: servers };
}

// Absolute paths a prompt names that are real files the sandbox cannot have:
// outside the task folder (which travels in the bundle), under one of the
// roots the agent is allowed to read, and not too big to send.
export function filesNamedIn(text, { cwd, roots }) {
  const found = new Set();
  for (const m of String(text || '').matchAll(/(\/(?:[^\s"'`<>()\[\]{},;]|\\ )+)/g)) {
    const p = m[1].replace(/[.:]+$/, '');
    if (p.startsWith(cwd + path.sep) || p === cwd) continue;
    if (!roots.some((r) => r && (p === r || p.startsWith(r + path.sep)))) continue;
    try {
      const st = fs.statSync(p);
      if (st.isFile() && st.size <= MAX_ATTACHMENT) found.add(p);
    } catch { /* not a file */ }
  }
  return [...found];
}

function tarOf(dir) {
  return execFileSync('tar', ['-czf', '-', '-C', dir, '-h', '.'], { maxBuffer: 512 * 1024 * 1024 });
}

/* -------------------------------- the run -------------------------------- */

export async function cloudRun({
  argv, env = process.env, cwd,
  transport, storage,
  claudeToken,
  stdin = process.stdin, stdout = process.stdout, stderr = process.stderr,
  remoteCommand = 'claude',
  homeDir = os.homedir(),
  pollWaitMs = 20_000,
  resultsWaitMs = RESULTS_WAIT_MS,
  watchParent = true,
  stubPath = STUB,
  signals = process,
}) {
  const say = (msg) => stderr.write(`agentbox cloud: ${msg}\n`);
  const configDir = env.CLAUDE_CONFIG_DIR || path.join(homeDir, '.claude');
  const projectsDir = path.join(configDir, 'projects', transcriptFolderName(cwd));

  // 1. An earlier run that never came home comes home first.
  const earlier = readMarker(cwd);
  if (earlier) {
    const back = await bringHome(earlier, { recovering: true });
    if (!back.ok) { say(`an earlier cloud run in this folder could not be brought back yet (${back.why}); not starting another`); return IMPORT_FAILED; }
  }

  const runId = crypto.randomUUID();
  const sessionId = `agentbox-${(env.ZERO_ITEM || 'run').replace(/[^a-zA-Z0-9-]/g, '')}-${runId}`;
  const key = (name) => `runs/${runId}/${name}`;

  // 2. The pack.
  const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  if (!branch || branch === 'HEAD') { say('the task folder is not on a branch'); return 1; }
  const startSha = git(cwd, ['rev-parse', 'HEAD']).trim();
  const outgoing = `refs/agentbox/outgoing/${runId}`;
  const hasOutgoing = snapshotUncommitted(cwd, outgoing);
  const refs = [`refs/heads/${branch}`];
  if (hasOutgoing) refs.push(outgoing);
  for (const r of ['refs/heads/main', 'refs/remotes/origin/main']) if (r !== `refs/heads/${branch}` && gitOk(cwd, ['rev-parse', '--verify', '-q', r])) refs.push(r);
  const bundleFile = path.join(os.tmpdir(), `agentbox-cloud-${runId}.bundle`);
  try {
    git(cwd, ['bundle', 'create', '-q', bundleFile, ...refs]);
    await storage.put(key('in.bundle'), fs.readFileSync(bundleFile));
  } finally {
    fs.rmSync(bundleFile, { force: true });
    if (hasOutgoing) gitOk(cwd, ['update-ref', '-d', outgoing]);
  }

  const files = [];
  let fileCount = 0;
  const sendFile = async (localPath, remotePath = localPath, body = null, untar = null) => {
    fileCount += 1;
    const k = key(`files/${fileCount}`);
    await storage.put(k, body ?? fs.readFileSync(localPath));
    return { path: remotePath, url: await storage.getUrl(k), ...(untar ? { untar } : {}) };
  };
  const settingsPath = argValue(argv, '--settings');
  if (settingsPath && fs.existsSync(settingsPath)) files.push(await sendFile(settingsPath, settingsPath, Buffer.from(settingsForTheCloud(fs.readFileSync(settingsPath, 'utf8')))));
  const mcpPath = argValue(argv, '--mcp-config');
  let mcpConfig = { mcpServers: {} };
  if (mcpPath && fs.existsSync(mcpPath)) {
    mcpConfig = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    files.push(await sendFile(mcpPath, mcpPath, Buffer.from(JSON.stringify(mcpConfigForTheCloud(mcpConfig, stubPath)))));
  }
  const resumeId = argValue(argv, '--resume');
  if (resumeId) {
    const t = path.join(projectsDir, `${resumeId}.jsonl`);
    if (fs.existsSync(t)) files.push(await sendFile(t));
    else say(`no transcript for ${resumeId} on this Mac; the cloud run starts without it`);
  }
  // The account's own skills, commands and agents, as real folders.
  const tooling = path.join(homeDir, '.claude');
  for (const sub of ['skills', 'commands', 'agents']) {
    const dir = fs.existsSync(path.join(configDir, sub)) ? path.join(configDir, sub) : path.join(tooling, sub);
    if (fs.existsSync(dir)) files.push(await sendFile(null, path.join(configDir, `.${sub}.tgz`), tarOf(dir), path.join(configDir, sub)));
  }
  const roots = [env.AGENTBOX_HOME, env.ZERO_STORE_ROOT, env.STORE_HOME].filter(Boolean).map((r) => path.resolve(r));
  const system = argValue(argv, '--append-system-prompt') || '';
  for (const f of filesNamedIn(system, { cwd, roots })) files.push(await sendFile(f));
  const sent = new Set(files.map((f) => f.path));

  const results = {
    bundleUrl: await storage.putUrl(key('out.bundle')),
    changesUrl: await storage.putUrl(key('changes.bundle')),
    eventsUrl: await storage.putUrl(key('events.jsonl')),
    doneUrl: await storage.putUrl(key('done.json')),
    bring: [{ dir: projectsDir, url: await storage.putUrl(key('projects.tgz')) }],
  };

  const remoteEnv = {
    CLAUDE_CONFIG_DIR: configDir,
    MCP_TOOL_TIMEOUT: String(8 * 60 * 60 * 1000),
    DISABLE_AUTOUPDATER: '1',
    ...(env.ZERO_PRODUCT ? { ZERO_PRODUCT: env.ZERO_PRODUCT } : {}),
    ...(env.ZERO_ITEM ? { ZERO_ITEM: env.ZERO_ITEM } : {}),
    ...gitIdentity(cwd),
    ...(claudeToken ? { CLAUDE_CODE_OAUTH_TOKEN: claudeToken } : {}),
  };

  writeMarker(cwd, { runId, sessionId, branch, startSha, pid: process.pid, state: 'starting' });

  // 3. Start. Starting the same run twice is answered "already", so a start
  // whose reply was lost is simply asked again.
  const bundleUrl = await storage.getUrl(key('in.bundle'));
  const started = await retry(() => transport.invoke(sessionId, {
    action: 'start', runId, cwd, branch, bundleUrl,
    argv: [remoteCommand, ...argv], env: remoteEnv, files,
    changesRef: hasOutgoing ? outgoing : undefined,
    results,
  }), { what: 'start the cloud run', forever: false });
  if (!started?.ok) {
    say(`the cloud run could not start: ${started?.error || 'no answer'} ${started?.message || ''}`.trim());
    clearMarker(cwd);
    return 1;
  }
  writeMarker(cwd, { runId, sessionId, branch, startSha, pid: process.pid, state: 'running' });

  // 4. The pump.
  let cursor = 0;
  let n = 0;
  let cancelled = false;
  let finished = null; // 'collected' | 'collect-failed' | 'failed' | 'lost'
  const servers = new Map(); // conn -> { proc, name, listIds }
  const outbox = [];
  let wake = null;
  const enqueue = (msg) => { outbox.push(msg); wake?.(); };

  const sender = (async () => {
    for (;;) {
      if (!outbox.length) {
        if (finished) return;
        await new Promise((r) => { wake = r; setTimeout(r, 1000); });
        wake = null;
        continue;
      }
      const msg = outbox.shift();
      if (msg.action === 'files') {
        // Files are uploaded first, then named, in their place in the line.
        const list = [];
        for (const f of msg.paths) if (!sent.has(f)) { list.push(await sendFile(f)); sent.add(f); }
        if (!list.length) continue;
        msg.files = list;
        delete msg.paths;
      }
      n += 1;
      const mine = n;
      const res = await retry(() => transport.invoke(sessionId, { ...msg, runId, n: mine }), { what: msg.action, forever: true, stop: () => finished });
      if (res && !res.ok && res.error === 'gap') { say(`input out of step with the sandbox (it expected ${res.expect}, this was ${mine})`); }
    }
  })();

  // Stdin: the supervisor's stream-json lines, in order, each preceded by the
  // files it names.
  let stdinBuf = '';
  stdin.on('data', (d) => {
    stdinBuf += d.toString('utf8');
    let i;
    while ((i = stdinBuf.indexOf('\n')) >= 0) {
      const line = stdinBuf.slice(0, i + 1);
      stdinBuf = stdinBuf.slice(i + 1);
      const named = filesNamedIn(line, { cwd, roots });
      if (named.length) enqueue({ action: 'files', paths: named });
      enqueue({ action: 'stdin', data: Buffer.from(line).toString('base64') });
    }
  });
  stdin.on('end', () => {
    if (stdinBuf) enqueue({ action: 'stdin', data: Buffer.from(stdinBuf).toString('base64') });
    enqueue({ action: 'stdin', end: true });
  });

  function openServer(conn, name) {
    const cfg = mcpConfig.mcpServers?.[name];
    if (!cfg) { enqueue({ action: 'mcp-close', conn }); return; }
    const proc = spawn(cfg.command, cfg.args || [], { cwd, env: { ...env, ...(cfg.env || {}) }, stdio: ['pipe', 'pipe', 'pipe'] });
    const s = { proc, name, listIds: new Set(), buf: '' };
    servers.set(conn, s);
    proc.stdout.on('data', (d) => {
      s.buf += d.toString('utf8');
      let i;
      while ((i = s.buf.indexOf('\n')) >= 0) {
        const line = s.buf.slice(0, i);
        s.buf = s.buf.slice(i + 1);
        enqueue({ action: 'mcp', conn, line: withholdFromList(line, s.listIds) });
      }
    });
    proc.stderr.on('data', (d) => stderr.write(d));
    proc.stdin.on('error', () => {});
    proc.on('exit', () => { if (servers.get(conn) === s) { servers.delete(conn); enqueue({ action: 'mcp-close', conn }); } });
  }

  function toServer(conn, line) {
    const s = servers.get(conn);
    if (!s) return;
    let msg = null;
    try { msg = JSON.parse(line); } catch { /* pass through as is */ }
    if (msg?.method === 'tools/list' && msg.id !== undefined) s.listIds.add(msg.id);
    if (msg?.method === 'tools/call' && WITHHELD_TOOLS.has(msg.params?.name)) {
      enqueue({ action: 'mcp', conn, line: JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { isError: true, content: [{ type: 'text', text: `${msg.params.name} is not available to a cloud run: it would look at the Mac's own pages, not the sandbox's.` }] } }) });
      return;
    }
    s.proc.stdin.write(line + '\n');
  }

  async function write(stream, buf) {
    if (!stream.write(buf)) await new Promise((r) => stream.once('drain', r));
  }

  async function absorb(e) {
    if (e.seq <= cursor) return;
    cursor = e.seq;
    if (e.kind === 'stdout') await write(stdout, Buffer.from(e.data, 'base64'));
    else if (e.kind === 'stderr') await write(stderr, Buffer.from(e.data, 'base64'));
    else if (e.kind === 'mcp-open') openServer(e.conn, e.server);
    else if (e.kind === 'mcp') toServer(e.conn, e.line);
    else if (e.kind === 'mcp-close') { const s = servers.get(e.conn); servers.delete(e.conn); s?.proc.stdin.end(); setTimeout(() => s?.proc.kill(), 2000); }
    else if (e.kind === 'error') say(e.message);
    else if (e.kind === 'state' && ['collected', 'collect-failed', 'failed'].includes(e.state)) finished = e.state;
  }

  const cancel = async (why) => {
    if (cancelled || finished) return;
    cancelled = true;
    say(`stopping the cloud run (${why})`);
    await retry(() => transport.invoke(sessionId, { action: 'signal', runId, signal: 'SIGTERM' }), { what: 'stop the cloud run', forever: false });
  };
  const onTerm = () => { cancel('asked to stop'); };
  signals.on('SIGTERM', onTerm);
  signals.on('SIGINT', onTerm);
  const parentWatch = watchParent ? setInterval(() => { if (process.ppid === 1) cancel('the app is gone'); }, 5000) : null;
  const cancelDeadline = () => cancelled && Date.now() - cancelledAt() > resultsWaitMs;
  let cancelledAtMs = null;
  const cancelledAt = () => (cancelledAtMs ??= Date.now());

  try {
    while (!finished) {
      if (cancelDeadline()) { finished = 'lost'; break; }
      const page = await retry(() => transport.invoke(sessionId, { action: 'events', runId, since: cursor, waitMs: pollWaitMs }), { what: 'read the cloud run', forever: true });
      if (page && !page.ok && page.error === 'no-run') { finished = 'lost'; break; }
      for (const e of page?.events || []) await absorb(e);
    }
  } finally {
    signals.off('SIGTERM', onTerm);
    signals.off('SIGINT', onTerm);
    if (parentWatch) clearInterval(parentWatch);
  }

  // A collect that failed in the sandbox is asked once more, with the same URLs.
  if (finished === 'collect-failed') {
    const again = await retry(() => transport.invoke(sessionId, { action: 'collect', runId, ...results }), { what: 'collect the results', forever: false });
    if (again?.ok) finished = 'collected';
  }
  await sender.catch(() => {});
  for (const s of servers.values()) { s.proc.stdin.end(); s.proc.kill(); }

  if (finished === 'failed') { clearMarker(cwd); return 1; }
  const back = await bringHome({ runId, sessionId, branch, startSha }, { cursor, write: (e) => absorb(e) });
  if (!back.ok) {
    say(`the cloud run's work could not be brought back (${back.why}); it is kept in the cloud for 7 days and the next run in this folder will try again`);
    writeMarker(cwd, { runId, sessionId, branch, startSha, pid: null, state: 'import-failed' });
    return IMPORT_FAILED;
  }
  return back.exitCode ?? 1;

  /* --------------------------- bringing it home -------------------------- */
  async function bringHome(rec, { recovering = false, cursor: from = 0, write: replay = null } = {}) {
    const k = (name) => `runs/${rec.runId}/${name}`;
    let done = await storage.get(k('done.json'));
    if (!done && recovering) {
      // Still running, or never asked to stop: ask it to stop, then wait for
      // it to upload what it has.
      if (rec.pid && rec.pid !== process.pid && alive(rec.pid)) return { ok: false, why: 'its own process is still bringing it back' };
      await retry(() => transport.invoke(rec.sessionId, { action: 'signal', runId: rec.runId, signal: 'SIGTERM' }), { what: 'stop the earlier run', forever: false });
      const until = Date.now() + resultsWaitMs;
      while (!done && Date.now() < until) { await sleep(3000); done = await storage.get(k('done.json')); }
      if (!done) {
        await transport.stop?.(rec.sessionId).catch(() => {});
        clearMarker(cwd);
        say('an earlier cloud run in this folder ended without its results; its work is lost');
        return { ok: true, exitCode: null };
      }
    }
    if (!done) return { ok: false, why: 'its results never arrived' };
    const record = JSON.parse(done.toString('utf8'));
    // Anything the stream never delivered (the session was gone before the
    // Mac could read it) is replayed from the copy in S3.
    if (replay) {
      const log = await storage.get(k('events.jsonl'));
      for (const l of (log ? log.toString('utf8').split('\n') : [])) {
        if (!l) continue;
        const e = JSON.parse(l);
        if (e.seq > from && (e.kind === 'stdout' || e.kind === 'stderr')) await replay(e);
      }
    }
    try {
      if (record.commits > 0) {
        const b = await storage.get(k('out.bundle'));
        if (!b) return { ok: false, why: 'the commits bundle is missing' };
        const f = path.join(os.tmpdir(), `agentbox-cloud-in-${rec.runId}.bundle`);
        fs.writeFileSync(f, b);
        try { git(cwd, ['fetch', '-q', f, `refs/heads/${rec.branch}:refs/agentbox/cloud/${rec.runId}`]); } finally { fs.rmSync(f, { force: true }); }
        const here = git(cwd, ['rev-parse', 'HEAD']).trim();
        if (here !== record.startSha && !gitOk(cwd, ['merge-base', '--is-ancestor', here, `refs/agentbox/cloud/${rec.runId}`])) {
          return { ok: false, why: `this folder moved on while the run was in the cloud; its commits are on refs/agentbox/cloud/${rec.runId}` };
        }
      }
      // The folder is put back exactly as the run left it: what it held when
      // the run began went up with it, so it is set aside on a ref first (never
      // lost), then the run's commits and uncommitted work are laid down.
      snapshotUncommitted(cwd, `refs/agentbox/before-cloud/${rec.runId}`);
      git(cwd, ['reset', '-q', '--hard', 'HEAD']);
      git(cwd, ['clean', '-q', '-fd']);
      if (record.commits > 0) git(cwd, ['merge', '-q', '--ff-only', `refs/agentbox/cloud/${rec.runId}`]);
      if (record.uncommitted) {
        const b = await storage.get(k('changes.bundle'));
        if (!b) return { ok: false, why: 'the uncommitted work is missing' };
        const f = path.join(os.tmpdir(), `agentbox-cloud-ch-${rec.runId}.bundle`);
        fs.writeFileSync(f, b);
        try { git(cwd, ['fetch', '-q', f, `refs/agentbox/changes:refs/agentbox/cloud-changes/${rec.runId}`]); } finally { fs.rmSync(f, { force: true }); }
        const patch = git(cwd, ['diff', '--binary', 'HEAD', `refs/agentbox/cloud-changes/${rec.runId}`], { buffer: true });
        if (patch.length) git(cwd, ['apply', '--whitespace=nowarn'], { input: patch });
        gitOk(cwd, ['update-ref', '-d', `refs/agentbox/cloud-changes/${rec.runId}`]);
      }
      if (record.commits > 0) gitOk(cwd, ['update-ref', '-d', `refs/agentbox/cloud/${rec.runId}`]);
      const tgz = await storage.get(k('projects.tgz'));
      if (tgz) {
        fs.mkdirSync(projectsDir, { recursive: true });
        execFileSync('tar', ['-xzf', '-', '-C', projectsDir], { input: tgz });
      }
    } catch (err) {
      return { ok: false, why: err.message.split('\n')[0] };
    }
    clearMarker(cwd);
    return { ok: true, exitCode: record.exitCode, record };
  }

  async function retry(fn, { what, forever = false, stop = () => false }) {
    let delay = 500;
    for (let i = 0; ; i += 1) {
      try { return await fn(); } catch (err) {
        if (stop()) return null;
        if (!forever && i >= 5) { say(`could not ${what}: ${err.message}`); return null; }
        if (i === 3) say(`still trying to ${what} (${err.message})`);
        await sleep(delay);
        delay = Math.min(delay * 2, 30_000);
      }
    }
  }
}

// Drop withheld tools from a server's answer to `tools/list`.
function withholdFromList(line, listIds) {
  let msg;
  try { msg = JSON.parse(line); } catch { return line; }
  if (msg?.id === undefined || !listIds.has(msg.id) || !Array.isArray(msg.result?.tools)) return line;
  listIds.delete(msg.id);
  msg.result.tools = msg.result.tools.filter((t) => !WITHHELD_TOOLS.has(t.name));
  return JSON.stringify(msg);
}

function gitIdentity(cwd) {
  const get = (k) => { try { return execFileSync('git', ['config', k], { cwd, encoding: 'utf8' }).trim(); } catch { return ''; } };
  const name = get('user.name'); const email = get('user.email');
  return {
    ...(name ? { GIT_AUTHOR_NAME: name, GIT_COMMITTER_NAME: name } : {}),
    ...(email ? { GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_EMAIL: email } : {}),
  };
}

function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
