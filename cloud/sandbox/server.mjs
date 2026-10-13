// THE SANDBOX'S ONE SERVER: A PLAIN REMOTE COMPUTER FOR ONE RUN.
//
// Cloud runs (docs/cloud/PLAN.md) put a thread's agent in an AWS AgentCore
// microVM. This is the only program of ours inside it. It knows nothing about
// Claude Code, Codex, the store or approvals: it is handed a git bundle, a
// folder path, a command and an environment, and it runs the command there.
// Everything the command prints is numbered and kept, so the Mac can read it
// over a connection that drops (the lid closes, a stream reaches AgentCore's
// 60-minute ceiling, the app restarts) and pick up from the last number it saw.
// The app's tools travel through it as raw lines (see "THE BRIDGE"), so a new
// harness or a new tool costs this file nothing.
//
// AgentCore's contract: HTTP on :8080, POST /invocations and GET /ping, an
// arm64 image. A session that answers "Healthy" for 15 minutes is reaped, so
// /ping says "HealthyBusy" from the moment a run starts until its results have
// been collected, however long ago the command itself exited.
//
// One run per microVM, which is what AgentCore gives a session anyway.

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFile } from 'node:child_process';

// How big one stdout event may be. AgentCore's response limit is 100 MB, so
// this only keeps a single event from being a large share of one poll.
const CHUNK = 48 * 1024;
// How many events one poll returns at most.
const PAGE = 2000;

export function createSandbox({
  workRoot = '/',
  bridgeSocket = path.join(process.env.TMPDIR || '/tmp', `agentbox-bridge-${process.pid}.sock`),
  baseEnv = pickBaseEnv(process.env),
  fetchImpl = globalThis.fetch,
  uploadRetryMs = 5_000,
} = {}) {
  let run = null;
  let bridge = null;
  let statusChangedAt = Math.floor(Date.now() / 1000);
  let lastPing = null;

  function emit(event) {
    const e = { seq: run.events.length + 1, at: Date.now(), ...event };
    run.events.push(e);
    const waiters = run.waiters.splice(0);
    for (const w of waiters) w();
    return e;
  }

  function setState(state) {
    run.state = state;
    emit({ kind: 'state', state });
  }

  function emitChunks(kind, buf) {
    for (let i = 0; i < buf.length; i += CHUNK) {
      emit({ kind, data: buf.subarray(i, i + CHUNK).toString('base64') });
    }
  }

  /* ------------------------------ THE BRIDGE ------------------------------ */
  // Each MCP server the harness is configured with is replaced, in here, by
  // cloud/sandbox/mcp-stub.mjs. A stub connects to this socket, names its
  // server, and from then on every line the harness writes to it becomes an
  // `mcp` event for the Mac, and every `mcp` action the Mac sends becomes a line
  // the stub writes back to the harness. The Mac runs the REAL server and feeds
  // it these lines, so the store and the approvals channel behave exactly as
  // they do for a local run.
  function openBridge() {
    if (bridge) return;
    try { fs.unlinkSync(bridgeSocket); } catch { /* not there */ }
    let next = 0;
    bridge = { conns: new Map(), server: null };
    bridge.server = net.createServer((sock) => {
      let conn = null;
      let buf = '';
      sock.setEncoding('utf8');
      sock.on('data', (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          if (conn === null) {
            let hello = null;
            try { hello = JSON.parse(line); } catch { /* not a hello */ }
            if (!hello?.server || !run) { sock.destroy(); return; }
            next += 1;
            conn = `c${next}`;
            bridge.conns.set(conn, sock);
            emit({ kind: 'mcp-open', conn, server: String(hello.server) });
            continue;
          }
          if (run) emit({ kind: 'mcp', conn, line });
        }
      });
      sock.on('close', () => {
        if (conn && bridge?.conns.get(conn) === sock) {
          bridge.conns.delete(conn);
          if (run) emit({ kind: 'mcp-close', conn });
        }
      });
      sock.on('error', () => {});
    });
    bridge.server.listen(bridgeSocket);
  }

  /* ------------------------------- THE RUN -------------------------------- */
  async function prepareAndSpawn(spec) {
    const { cwd, branch, bundleUrl, argv, env = {}, files = [], remote } = spec;
    try {
      const bundle = path.join(workRoot, '.agentbox', `${safe(run.id)}.bundle`);
      fs.mkdirSync(path.dirname(bundle), { recursive: true });
      await download(fetchImpl, bundleUrl, bundle);
      fs.mkdirSync(cwd, { recursive: true });
      await sh('git', ['init', '-q'], cwd);
      // Every ref the Mac packed lands where it was: the task branch, main, and
      // the remote-tracking main the brief merges from.
      // `--update-head-ok`: a fresh repository's HEAD already names a branch
      // (main, usually), and git refuses to fetch into the checked-out one.
      await sh('git', ['fetch', '-q', '--update-head-ok', bundle, '+refs/*:refs/*'], cwd);
      await sh('git', ['checkout', '-q', branch], cwd);
      if (remote) await sh('git', ['remote', 'add', 'origin', remote], cwd).catch(() => {});
      run.startSha = (await sh('git', ['rev-parse', 'HEAD'], cwd)).trim();
      run.lastCheckpoint = run.startSha;
      for (const f of files) {
        fs.mkdirSync(path.dirname(f.path), { recursive: true });
        await download(fetchImpl, f.url, f.path);
      }
      fs.rmSync(bundle, { force: true });
    } catch (err) {
      emit({ kind: 'error', message: `could not prepare the run: ${err.message}` });
      setState('failed');
      return;
    }
    openBridge();
    let child;
    try {
      child = spawn(argv[0], argv.slice(1), {
        cwd,
        env: { ...baseEnv, ...env, AGENTBOX_BRIDGE_SOCK: bridgeSocket },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      emit({ kind: 'error', message: `could not start the command: ${err.message}` });
      setState('failed');
      return;
    }
    run.child = child;
    child.stdout.on('data', (d) => emitChunks('stdout', d));
    child.stderr.on('data', (d) => emitChunks('stderr', d));
    child.stdin.on('error', () => {});
    // Anything the Mac wrote to stdin before the command existed goes in now,
    // in order.
    for (const p of run.pendingStdin.splice(0)) writeStdin(p);
    child.on('error', (err) => emit({ kind: 'error', message: `the command failed: ${err.message}` }));
    child.on('close', (code, signal) => {
      run.exitCode = code;
      emit({ kind: 'exit', code, signal });
      run.state = 'exited';
      run.child = null;
      // THE RESULTS LEAVE BY THEMSELVES. The Mac may be asleep, and AgentCore
      // ends a session after eight hours whatever we answer, so waiting for
      // the Mac to come and ask is how a finished run gets lost.
      if (run.spec.results) autoCollect(run.spec.results);
    });
    setState('running');
  }

  function writeStdin({ data, end }) {
    const child = run.child;
    if (!child) { run.pendingStdin.push({ data, end }); return; }
    if (data) child.stdin.write(Buffer.from(data, 'base64'));
    if (end) child.stdin.end();
  }

  /* ------------------------------ COLLECTING ------------------------------ */
  // The new commits on the task branch, as a bundle the Mac can fetch, and the
  // work that was never committed, as one commit on its own ref, so the Mac can
  // put the folder in exactly the state the agent left it.
  // Three tries on its own, a little apart. A manual `collect` from the Mac
  // (with fresh URLs, say) takes over from these rather than racing them.
  async function autoCollect(urls) {
    const mine = run;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (mine.manualCollect || mine.state === 'collected') return;
      const r = await collectAndFinish(urls);
      if (r.ok || mine.manualCollect) return;
      if (attempt < 3) await new Promise((res) => setTimeout(res, uploadRetryMs * attempt));
      else { mine.state = 'collect-failed'; emit({ kind: 'state', state: 'collect-failed', message: r.message }); }
    }
  }

  async function manualCollect(urls) {
    run.manualCollect = true;
    while (collecting) await collecting.catch(() => {});
    if (run.state === 'collected') return { ok: false, error: 'already-collected' };
    const r = await collectAndFinish(urls);
    if (!r.ok) { run.state = 'collect-failed'; emit({ kind: 'state', state: 'collect-failed', message: r.message }); }
    return r;
  }

  // Collect, then the event log, then `done.json` LAST: its presence in S3 is
  // the promise that everything before it is there too.
  let collecting = null;
  function collectAndFinish(urls) {
    if (collecting) return collecting;
    collecting = (async () => {
      try {
        const r = await collect(urls);
        if (urls.eventsUrl) await upload(fetchImpl, urls.eventsUrl, Buffer.from(run.events.map((e) => JSON.stringify(e)).join('\n') + '\n'));
        if (urls.doneUrl) await upload(fetchImpl, urls.doneUrl, Buffer.from(JSON.stringify({ ...r, runId: run.id, exitCode: run.exitCode, lastSeq: run.events.length })));
        run.state = 'collected';
        emit({ kind: 'state', state: 'collected' });
        return r;
      } catch (err) {
        return { ok: false, error: 'collect-failed', message: err.message };
      } finally {
        collecting = null;
      }
    })();
    return collecting;
  }

  async function collect({ bundleUrl, changesUrl, bring = [] }) {
    const cwd = run.spec.cwd;
    const branch = run.spec.branch;
    const tip = (await sh('git', ['rev-parse', `refs/heads/${branch}`], cwd)).trim();
    const commits = Number((await sh('git', ['rev-list', '--count', `${run.startSha}..${tip}`], cwd)).trim()) || 0;
    if (commits > 0) {
      const out = path.join(workRoot, '.agentbox', 'out.bundle');
      fs.mkdirSync(path.dirname(out), { recursive: true });
      await sh('git', ['bundle', 'create', '-q', out, `refs/heads/${branch}`, `^${run.startSha}`], cwd);
      await upload(fetchImpl, bundleUrl, fs.readFileSync(out));
      fs.rmSync(out, { force: true });
    }
    const dirty = (await sh('git', ['status', '--porcelain', '--untracked-files=all'], cwd)).trim().length > 0;
    let changesRef = null;
    if (dirty) {
      changesRef = 'refs/agentbox/changes';
      const index = path.join(workRoot, '.agentbox', 'changes.index');
      const env = { GIT_INDEX_FILE: index };
      fs.rmSync(index, { force: true });
      await sh('git', ['read-tree', 'HEAD'], cwd, env);
      await sh('git', ['add', '-A'], cwd, env);
      const tree = (await sh('git', ['write-tree'], cwd, env)).trim();
      const commit = (await sh('git', ['-c', 'user.name=Agentbox', '-c', 'user.email=agentbox@localhost', 'commit-tree', tree, '-p', 'HEAD', '-m', 'Uncommitted work from a cloud run'], cwd, env)).trim();
      fs.rmSync(index, { force: true });
      await sh('git', ['update-ref', changesRef, commit], cwd);
      const out = path.join(workRoot, '.agentbox', 'changes.bundle');
      await sh('git', ['bundle', 'create', '-q', out, changesRef, '^HEAD'], cwd);
      await upload(fetchImpl, changesUrl, fs.readFileSync(out));
      fs.rmSync(out, { force: true });
    }
    const brought = [];
    for (const b of bring) {
      if (!fs.existsSync(b.dir)) continue;
      const tarball = path.join(workRoot, '.agentbox', 'bring.tgz');
      await sh('tar', ['-czf', tarball, '-C', b.dir, '.'], cwd);
      await upload(fetchImpl, b.url, fs.readFileSync(tarball));
      fs.rmSync(tarball, { force: true });
      brought.push(b.dir);
    }
    return { ok: true, startSha: run.startSha, tip, commits, uncommitted: dirty, changesRef, brought };
  }

  async function checkpoint({ bundleUrl }) {
    const cwd = run.spec.cwd;
    const tip = (await sh('git', ['rev-parse', `refs/heads/${run.spec.branch}`], cwd)).trim();
    if (tip === run.lastCheckpoint) return { ok: true, changed: false, tip };
    const out = path.join(workRoot, '.agentbox', 'checkpoint.bundle');
    await sh('git', ['bundle', 'create', '-q', out, `refs/heads/${run.spec.branch}`, `^${run.startSha}`], cwd);
    await upload(fetchImpl, bundleUrl, fs.readFileSync(out));
    fs.rmSync(out, { force: true });
    run.lastCheckpoint = tip;
    return { ok: true, changed: true, tip };
  }

  /* ------------------------------- ACTIONS -------------------------------- */
  async function handle(req = {}) {
    const action = req.action;
    if (action === 'status') {
      if (!run) return { ok: true, state: 'none' };
      return { ok: true, runId: run.id, state: run.state, seq: run.events.length, exitCode: run.exitCode ?? null };
    }
    if (action === 'start') {
      if (run && run.id === req.runId) return { ok: true, already: true, state: run.state, seq: run.events.length };
      if (run && !['collected', 'failed'].includes(run.state)) return { ok: false, error: 'busy', runId: run.id };
      const problem = invalidStart(req);
      if (problem) return { ok: false, error: 'bad-start', message: problem };
      run = { id: req.runId, spec: req, state: 'preparing', events: [], waiters: [], pendingStdin: [], child: null, exitCode: null, startSha: null };
      statusChangedAt = Math.floor(Date.now() / 1000);
      emit({ kind: 'state', state: 'preparing' });
      prepareAndSpawn(req);
      return { ok: true, seq: run.events.length };
    }
    if (!run) return { ok: false, error: 'no-run' };
    if (req.runId && req.runId !== run.id) return { ok: false, error: 'no-run', runId: run.id };
    switch (action) {
      case 'events': {
        const since = Math.max(0, Number(req.since) || 0);
        const waitMs = Math.min(Math.max(0, Number(req.waitMs) || 0), 25_000);
        if (run.events.length <= since && waitMs > 0) {
          await new Promise((resolve) => {
            const t = setTimeout(resolve, waitMs);
            run.waiters.push(() => { clearTimeout(t); resolve(); });
          });
        }
        const events = run.events.slice(since, since + PAGE);
        return { ok: true, state: run.state, events, more: run.events.length > since + events.length };
      }
      case 'stdin':
        if (run.state === 'exited' || run.state === 'collected' || run.state === 'failed') return { ok: false, error: 'exited' };
        writeStdin(req);
        return { ok: true };
      case 'mcp': {
        const sock = bridge?.conns.get(req.conn);
        if (!sock) return { ok: false, error: 'no-conn' };
        sock.write(String(req.line) + '\n');
        return { ok: true };
      }
      case 'mcp-close': {
        bridge?.conns.get(req.conn)?.end();
        return { ok: true };
      }
      case 'signal':
        if (run.child) run.child.kill(req.signal || 'SIGTERM');
        return { ok: true, running: !!run.child };
      case 'checkpoint':
        if (run.state !== 'running' && run.state !== 'exited') return { ok: false, error: 'not-ready' };
        return checkpoint(req);
      case 'collect':
        if (run.state === 'collected') return { ok: false, error: 'already-collected' };
        if (run.state !== 'exited' && run.state !== 'collect-failed') return { ok: false, error: 'not-exited', state: run.state };
        return manualCollect(req);
      default:
        return { ok: false, error: 'unknown-action' };
    }
  }

  function ping() {
    const busy = !!run && !['collected', 'failed'].includes(run.state);
    const status = busy ? 'HealthyBusy' : 'Healthy';
    // AgentCore wants the time the status CHANGED, never the time of the ping:
    // a timestamp that moves on every ping keeps a session alive forever.
    if (status !== lastPing) { statusChangedAt = Math.floor(Date.now() / 1000); lastPing = status; }
    return { status, time_of_last_update: statusChangedAt };
  }

  let httpServer = null;
  function listen(port = 8080, host = '0.0.0.0') {
    httpServer = http.createServer(async (req, res) => {
      try {
        if (req.method === 'GET' && req.url.startsWith('/ping')) return json(res, 200, ping());
        if (req.method === 'POST' && req.url.startsWith('/invocations')) {
          const body = await readBody(req, 100 * 1024 * 1024);
          let parsed;
          try { parsed = JSON.parse(body || '{}'); } catch { return json(res, 400, { ok: false, error: 'bad-json' }); }
          return json(res, 200, await handle(parsed));
        }
        json(res, 404, { ok: false, error: 'not-found' });
      } catch (err) {
        json(res, 500, { ok: false, error: 'internal', message: err.message });
      }
    });
    return new Promise((resolve) => httpServer.listen(port, host, () => resolve(httpServer.address())));
  }

  async function close() {
    if (run?.child) run.child.kill('SIGKILL');
    if (run) for (const w of run.waiters.splice(0)) w();
    if (bridge) { for (const s of bridge.conns.values()) s.destroy(); bridge.server.close(); bridge = null; }
    try { fs.unlinkSync(bridgeSocket); } catch { /* gone */ }
    if (httpServer) await new Promise((r) => httpServer.close(r));
  }

  return { handle, ping, listen, close, bridgeSocket };
}

/* -------------------------------- helpers --------------------------------- */

function invalidStart(req) {
  if (!req.runId || typeof req.runId !== 'string') return 'runId is required';
  if (!req.cwd || !path.isAbsolute(req.cwd)) return 'cwd must be an absolute path';
  if (!req.branch) return 'branch is required';
  if (!req.bundleUrl) return 'bundleUrl is required';
  if (!Array.isArray(req.argv) || !req.argv.length) return 'argv is required';
  for (const f of req.files || []) if (!f?.url || !path.isAbsolute(f?.path || '')) return 'every file needs an absolute path and a url';
  return null;
}

// What the command may inherit from the sandbox itself: enough to find
// programs and a home, and nothing the image's own environment happens to hold.
export function pickBaseEnv(env) {
  const keep = ['PATH', 'HOME', 'LANG', 'LC_ALL', 'TZ', 'TMPDIR', 'SHELL', 'USER', 'NODE_EXTRA_CA_CERTS'];
  return Object.fromEntries(keep.filter((k) => env[k] !== undefined).map((k) => [k, env[k]]));
}

function safe(s) { return String(s).replace(/[^a-zA-Z0-9._-]/g, '_'); }

function sh(cmd, args, cwd, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, env: { ...process.env, ...extraEnv }, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`${cmd} ${args[0]}: ${String(stderr || err.message).trim().slice(0, 500)}`));
      resolve(stdout);
    });
  });
}

async function download(fetchImpl, url, file) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`fetch ${res.status} for ${redact(url)}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

async function upload(fetchImpl, url, body) {
  const res = await fetchImpl(url, { method: 'PUT', body });
  if (!res.ok) throw new Error(`upload ${res.status} for ${redact(url)}`);
}

// A presigned URL carries a signature in its query; it never goes in a message.
function redact(url) { return String(url).split('?')[0]; }

function readBody(req, max) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > max) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

// Started directly (the image's entrypoint), it serves AgentCore's port.
if (import.meta.url === `file://${process.argv[1]}`) {
  const sandbox = createSandbox({ workRoot: process.env.HOME || '/tmp', bridgeSocket: '/tmp/agentbox-bridge.sock' });
  sandbox.listen(Number(process.env.PORT) || 8080).then((a) => console.error(`agentbox sandbox listening on ${a.port}`));
}
