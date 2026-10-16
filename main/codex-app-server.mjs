// The transport to `codex app-server`: one child process for many work items.
// It speaks newline-delimited JSON-RPC 2.0 over stdio, and when a turn needs an
// approval the server sends us a request with an id that we must answer.
//
// main/supervisor.mjs spawns the process and holds the client,
// main/codex-session.mjs wraps one thread of it per work item, and
// main/codex-approvals.mjs is the `onApproval` handler. This file does
// transport and routing only. The transport is injected so the tests run
// without `codex` installed.
//
// A request nobody answers parks a worker forever with nothing on its row. So
// deny is the default in every failure mode, and silence is not a refusal:
// - A card nobody answers denies itself after APPROVAL_TIMEOUT_MS, and a late
//   answer is dropped, because one request id cannot be answered twice.
// - A write that fails, at once or in its callback, is a broken connection.
//   Every waiter is settled and the child is killed.
// - A stdout line that will not parse may have been an approval request, so it
//   is fatal. Tracing goes to stderr, and blank lines are skipped.
//
// Protocol facts, measured on codex-cli 0.148.0:
// - The thread id is at `result.thread.id`; `result.threadId` is undefined.
// - Server request ids start at 0 and are a separate number space from ours,
//   so ids are tested with `!== undefined`.
// - `decline` is accepted even when `availableDecisions` does not list it,
//   which is what makes an unconditional refusal safe.
// - An error frame also refuses a command approval. That was measured for that
//   method only; other server requests get it because it is the one answer
//   valid for any result shape.
// - An open approval on one thread does not block the others, as long as the
//   read loop never awaits.
// - `thread/resume` fails on an ephemeral thread, so `ephemeral` defaults to
//   false.
// - `abort` is a word of the legacy `ReviewDecision`, not a v2 approval
//   decision.
// - `item/permissions/requestApproval` takes a granted profile, not a decision.
// - Any server request not in APPROVAL_SHAPE gets the error frame, because one
//   left open hangs whatever raised it.

import { StringDecoder } from 'node:string_decoder';
import { NAME, Name, nameSlug } from '../shared/product-name.mjs';

/**
 * How this client names itself to the server. It appears in `userAgent` and in
 * Codex's own session records, so it comes from shared/product-name.mjs rather
 * than being typed here.
 */
export const CLIENT_INFO = Object.freeze({ name: nameSlug, title: NAME, version: '1.0.0' });

/**
 * The scalar answers a v2 approval takes, from the CLI's schema dump. Command
 * approvals also take two amendment objects, which are standing policy changes
 * rather than an answer, so a handler returning one is refused. `abort` is a
 * legacy word and is not here.
 */
export const APPROVAL_DECISIONS = Object.freeze(['accept', 'acceptForSession', 'decline', 'cancel']);

/**
 * The actions an MCP elicitation takes. `McpServerElicitationRequestResponse`
 * has no `acceptForSession`.
 */
export const ELICITATION_ACTIONS = Object.freeze(['accept', 'decline', 'cancel']);

/**
 * The refusal. `decline` lets the agent carry on and try something else, while
 * `cancel` also interrupts the whole turn.
 */
export const REFUSAL_DECISION = 'decline';

/** How long a card waits for an answer. Matches main/approval-prompt-server.mjs. */
export const APPROVAL_TIMEOUT_MS = 15 * 60_000;

/**
 * The longest frame allowed before the connection is called corrupt. Large,
 * because `turn/diff/updated` carries the whole turn's diff. Bounded, because
 * an unterminated line would otherwise grow until the app dies. `read` checks
 * each complete line, and the data handler checks the unterminated rest.
 */
export const MAX_FRAME_LENGTH = 16 * 1024 * 1024;

/**
 * How long an ordinary request may go unanswered. A live server that accepts a
 * request and never answers would otherwise hold a work item forever, since the
 * pipe is not broken. `turn/start` resolves when the turn is accepted, so the
 * turn itself is not on this clock. A timeout rejects that one request and
 * leaves the connection up for the other threads.
 */
export const REQUEST_TIMEOUT_MS = 2 * 60_000;

/**
 * The server requests we answer, and the shape each answer takes.
 *
 * `mcpServer/elicitation/request` is how Codex asks whether an MCP tool call
 * may run (`_meta.codex_approval_kind: "mcp_tool_call"`), and every store tool
 * is one. Refused with the error frame, the call fails as "user rejected MCP
 * tool call", so it must reach the handler. Its answer is `{ action }`.
 */
const APPROVAL_SHAPE = new Map([
  ['item/commandExecution/requestApproval', 'decision'],
  ['item/fileChange/requestApproval', 'decision'],
  ['item/permissions/requestApproval', 'grant'],
  ['mcpServer/elicitation/request', 'elicitation'],
]);

const REFUSAL_ERROR = Object.freeze({
  code: -32001,
  message: `${Name} did not approve this request. Continue with what you are already allowed to do, and leave the rest for the founder to look at.`,
});

const plain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const only = (keys, allowed) => keys.every((k) => allowed.includes(k));

/**
 * One long-lived `codex app-server`.
 *
 * Give it either a `transport` (anything child-process-shaped: `stdin.write`,
 * `stdin.end`, `stdout.on('data')`, an optional `stderr`, `on('exit')`,
 * `on('error')`, `kill`) or a `spawn` function that returns one.
 *
 * `onNotification` gets every line for no watched thread, including the many
 * account and config notifications that carry no thread at all.
 */
export function createCodexAppServer({
  transport = null,
  spawn = null,
  clientInfo = CLIENT_INFO,
  onNotification = null,
  approvalTimeoutMs = APPROVAL_TIMEOUT_MS,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
  maxFrameLength = MAX_FRAME_LENGTH,
  stderrLimit = 64 * 1024,
} = {}) {
  const child = transport ?? spawn?.();
  if (!child) throw new Error('createCodexAppServer needs a transport or a spawn that makes one');

  const pending = new Map();    // OUR request id -> { resolve, reject, method, onResult }
  const threads = new Map();    // thread id -> handlers
  const openCards = new Map();  // THEIR request id -> the deadline timer
  const decoder = new StringDecoder('utf8');
  let nextId = 1;
  let buffer = '';
  let stderrText = '';
  let gone = null;              // null while live; the closing reason once not
  let drained = false;          // stdout has ended, so the diagnostics are complete
  let finished = false;

  /**
   * Put one message on the wire, or take the connection down. A pipe can fail
   * by throwing or in the write callback (or later with `error`). The callback
   * matters most: a refusal that never arrived looks the same as no answer. A
   * `false` return is only backpressure, not a failure.
   */
  function write(msg) {
    if (gone) return false;
    let text;
    try {
      text = JSON.stringify(msg) + '\n';
    } catch (err) {
      fail('write', { error: err });
      return false;
    }
    try {
      child.stdin.write(text, (err) => { if (err) fail('write', { error: err }); });
    } catch (err) {
      fail('write', { error: err });
      return false;
    }
    return !gone;
  }

  function send(method, params, onResult) {
    if (gone) return Promise.reject(new Error(`${method}: codex app-server is no longer running (${gone.reason})`));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      // Armed before the write. See REQUEST_TIMEOUT_MS.
      const timer = setTimeout(() => {
        if (!pending.delete(id)) return;
        reject(new Error(`${method}: codex app-server accepted this request and never answered it (${Math.round(requestTimeoutMs / 1000)}s)`));
      }, requestTimeoutMs);
      timer?.unref?.();
      pending.set(id, { resolve, reject, method, onResult, timer });
      if (!write({ jsonrpc: '2.0', id, method, params })) {
        clearTimeout(timer);
        pending.delete(id);
        reject(new Error(`${method}: ${cause()}`));
      }
    });
  }

  const notify = (method) => write({ jsonrpc: '2.0', method });

  // A StringDecoder, because a chunk can end in the middle of a UTF-8 sequence.
  child.stdout.on('data', (chunk) => {
    if (gone) return;
    buffer += typeof chunk === 'string' ? chunk : decoder.write(chunk);
    let at;
    while (!gone && (at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at);
      buffer = buffer.slice(at + 1);
      read(line);
    }
    if (!gone && buffer.length > maxFrameLength) {
      fail('protocol', { note: `a frame passed ${maxFrameLength} characters with no end to it` });
    }
  });

  // The child's tracing. Its last lines usually say why something failed, so
  // the tail is kept for cause reports. It is not protocol and is never parsed.
  child.stderr?.on('data', (chunk) => {
    stderrText += typeof chunk === 'string' ? chunk : chunk.toString();
    if (stderrText.length > stderrLimit) stderrText = stderrText.slice(-stderrLimit);
  });

  child.on('error', (err) => fail('error', { error: err }));
  child.on('exit', (code, signal) => fail('exit', { code: code ?? null, signal: signal ?? null }));
  child.stdin?.on?.('error', (err) => fail('error', { error: err }));
  child.stdout.on?.('error', (err) => fail('error', { error: err }));
  child.stderr?.on?.('error', () => { /* tracing, not protocol */ });
  for (const event of ['end', 'close']) child.stdout.on?.(event, () => { drained = true; if (gone) finish(); });

  function read(line) {
    // The data handler's check only sees an unterminated line. See
    // MAX_FRAME_LENGTH.
    if (line.length > maxFrameLength) {
      return fail('protocol', { note: `a frame of ${line.length} characters passed the ${maxFrameLength} this connection allows` });
    }
    const text = line.trim();
    if (!text) return;                       // framing, not content

    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return fail('protocol', { note: 'a line on stdout could not be read as JSON, and it may have been an approval request' });
    }
    if (!plain(msg)) {
      return fail('protocol', { note: 'a line on stdout could not be read as a message, and it may have been an approval request' });
    }

    // `!== undefined`, because the server's ids start at zero.
    if (msg.id !== undefined && msg.method !== undefined) return serverRequest(msg);
    if (msg.id !== undefined) return response(msg);
    if (typeof msg.method === 'string') return notification(msg);
    fail('protocol', { note: 'a message on stdout was neither a request, a response nor a notification' });
  }

  function response(msg) {
    const waiting = pending.get(msg.id);
    if (!waiting) return;
    pending.delete(msg.id);
    clearTimeout(waiting.timer);
    if (msg.error) {
      waiting.reject(new Error(`codex app-server refused ${waiting.method}: ${msg.error.message ?? JSON.stringify(msg.error)}`));
      return;
    }
    // `onResult` runs before the next line is read. Registering a thread off
    // the resolved promise would miss notifications sent right behind the
    // response, such as the thread's first event.
    try { waiting.onResult?.(msg.result); } catch { /* the caller's bookkeeping, not ours */ }
    waiting.resolve(msg.result);
  }

  function notification(msg) {
    const id = threadOf(msg.params);
    const handlers = id === null ? null : threads.get(id);
    if (handlers?.onNotification) call(() => handlers.onNotification(msg.method, msg.params));
    else call(() => onNotification?.(msg.method, msg.params));
  }

  /**
   * Answer a server request. Never awaits the handler, because one card may
   * wait fifteen minutes and every thread reads through this loop.
   */
  function serverRequest(msg) {
    // Two open requests on one id cannot both be answered, so treat it like an
    // unreadable frame and end the connection.
    if (openCards.has(msg.id)) {
      return fail('protocol', { note: `codex app-server raised a second request on id ${msg.id} while the first was still open, and one answer cannot settle two` });
    }
    const shape = APPROVAL_SHAPE.get(msg.method);
    if (!shape) return write({ jsonrpc: '2.0', id: msg.id, error: { ...REFUSAL_ERROR } });

    const id = threadOf(msg.params);
    const handler = id === null ? null : threads.get(id)?.onApproval;
    // Nobody to ask, so refuse now rather than at the deadline.
    if (typeof handler !== 'function') return write({ jsonrpc: '2.0', id: msg.id, ...refusal(shape) });

    openCard(msg.id, shape);
    Promise.resolve()
      .then(() => handler(msg.method, msg.params))
      .then((answered) => answerCard(msg.id, translate(shape, answered) ?? refusal(shape)))
      .catch(() => answerCard(msg.id, refusal(shape)));
  }

  /** Start the card's deadline. Expiry denies once and closes the card. */
  function openCard(id, shape) {
    const timer = setTimeout(() => {
      if (openCards.delete(id)) write({ jsonrpc: '2.0', id, ...refusal(shape) });
    }, approvalTimeoutMs);
    timer?.unref?.();
    openCards.set(id, timer);
  }

  /**
   * The only answer a card gets. A card already denied by its deadline, or on a
   * dead connection, is closed, so a late answer is dropped.
   */
  function answerCard(id, body) {
    if (!openCards.has(id)) return;
    clearTimeout(openCards.get(id));
    openCards.delete(id);
    write({ jsonrpc: '2.0', id, ...body });
  }

  // Refuse in the method's own vocabulary where it has one. A declined
  // elicitation leaves the turn running; the error frame is a protocol failure.
  const refusal = (shape) => {
    if (shape === 'decision') return { result: { decision: REFUSAL_DECISION } };
    if (shape === 'elicitation') return { result: { action: REFUSAL_DECISION } };
    return { error: { ...REFUSAL_ERROR } };
  };

  /**
   * The handler's answer in the shape the method takes, or null, which means
   * refuse. An elicitation has no `acceptForSession`, so that word is refused
   * rather than turned into a yes. `content` is never sent, because Agentbox
   * only answers elicitations that ask for no input.
   */
  function translate(shape, answered) {
    if (shape === 'decision') {
      return APPROVAL_DECISIONS.includes(answered) ? { result: { decision: answered } } : null;
    }
    if (shape === 'elicitation') {
      return ELICITATION_ACTIONS.includes(answered) ? { result: { action: answered } } : null;
    }
    const grant = grantFrom(answered);
    return grant ? { result: grant } : null;
  }

  /**
   * A permissions grant, checked field by field and built fresh. This answer
   * widens a sandbox, so nothing the handler returned is sent by reference: a
   * getter or `toJSON` could give JSON.stringify a different value from the one
   * checked. Any unknown key is a refusal, and inherited properties do not
   * count. The `entries` form of the filesystem profile is refused because its
   * shape is unmeasured.
   */
  function grantFrom(answered) {
    if (!plain(answered)) return null;
    const top = Object.keys(answered);
    if (!top.includes('permissions') || !only(top, ['permissions', 'scope', 'strictAutoReview'])) return null;

    const profile = answered.permissions;
    if (!plain(profile)) return null;
    const areas = Object.keys(profile);
    if (!areas.length || !only(areas, ['fileSystem', 'network'])) return null;

    const permissions = {};
    if (areas.includes('fileSystem')) {
      const asked = profile.fileSystem;
      if (!plain(asked)) return null;
      const keys = Object.keys(asked);
      if (!keys.length || !only(keys, ['read', 'write', 'globScanMaxDepth'])) return null;
      const fileSystem = {};
      for (const list of ['read', 'write']) {
        if (!keys.includes(list)) continue;
        const paths = asked[list];
        if (!Array.isArray(paths) || !paths.length) return null;
        if (!paths.every((p) => typeof p === 'string' && p.length > 0)) return null;
        fileSystem[list] = [...paths];
      }
      if (keys.includes('globScanMaxDepth')) {
        const depth = asked.globScanMaxDepth;
        if (!Number.isInteger(depth) || depth < 1) return null;
        fileSystem.globScanMaxDepth = depth;
      }
      permissions.fileSystem = fileSystem;
    }
    if (areas.includes('network')) {
      const asked = profile.network;
      if (!plain(asked)) return null;
      const keys = Object.keys(asked);
      if (keys.length !== 1 || keys[0] !== 'enabled' || typeof asked.enabled !== 'boolean') return null;
      permissions.network = { enabled: asked.enabled };
    }

    const grant = { permissions };
    // Default to `turn`, the narrower scope.
    if (top.includes('scope')) {
      if (answered.scope !== 'turn' && answered.scope !== 'session') return null;
      grant.scope = answered.scope;
    } else {
      grant.scope = 'turn';
    }
    if (top.includes('strictAutoReview')) {
      if (typeof answered.strictAutoReview !== 'boolean') return null;
      grant.strictAutoReview = answered.strictAutoReview;
    }
    return grant;
  }

  // Most lines carry `params.threadId`, but `thread/started` has
  // `params.thread.id`.
  function threadOf(params) {
    if (!plain(params)) return null;
    if (typeof params.threadId === 'string') return params.threadId;
    if (typeof params.thread?.id === 'string') return params.thread.id;
    return null;
  }

  // A listener that throws must not stop the read loop for every other thread.
  function call(fn) {
    try { fn(); } catch { /* the caller's problem, and not worth the fleet */ }
  }

  /** Why this connection ended, in a sentence that names something actionable. */
  function cause() {
    const tail = stderrText.trim().split('\n').slice(-3).join(' ').trim();
    const said = tail ? `: ${tail}` : '';
    if (!gone) return `the connection to codex app-server failed on write${said}`;
    switch (gone.reason) {
      case 'write': return `the connection to codex app-server failed on write (${gone.error?.message ?? 'no detail'})${said}`;
      case 'protocol': return `the connection to codex app-server is corrupt, ${gone.note}${said}`;
      case 'error': return `codex app-server failed to run (${gone.error?.message ?? 'no detail'})${said}`;
      case 'closed': return `codex app-server was closed by ${NAME} (${gone.note})${said}`;
      default: return `codex app-server exited (code ${gone.code}, signal ${gone.signal})${said}`;
    }
  }

  /**
   * The connection is over. It is marked at once, so no further request or late
   * approval is written, and finished once stdout drains, because `exit` often
   * arrives before the last of the tracing that explains it.
   */
  function fail(reason, detail = {}) {
    if (gone) return;
    gone = { reason, code: null, signal: null, error: null, note: null, ...detail, stderr: stderrText };
    if (reason !== 'exit') stop();
    if (drained) finish();
    else if (typeof setImmediate === 'function') setImmediate(finish);
    else finish();
  }

  function stop() {
    try { child.stdin.end(); } catch { /* already gone */ }
    try { child.kill(); } catch { /* already gone */ }
  }

  /**
   * Settles everything once. Pending requests reject, watched threads get
   * `onClosed`, and every timer and registration is dropped, so no work item is
   * left waiting and nothing keeps the client alive.
   */
  function finish() {
    if (finished) return;
    finished = true;
    gone.stderr = stderrText;
    const why = cause();

    for (const timer of openCards.values()) clearTimeout(timer);
    openCards.clear();

    for (const [id, waiting] of pending) {
      pending.delete(id);
      clearTimeout(waiting.timer);
      waiting.reject(Object.assign(new Error(`${waiting.method}: ${why}`), { cause: gone }));
    }
    const listening = [...threads.values()];
    threads.clear();
    for (const handlers of listening) call(() => handlers.onClosed?.(gone));
  }

  const watch = (threadId, handlers = {}) => { threads.set(threadId, handlers); return threadId; };

  return {
    /** Any client request, for the ones with no wrapper (`config/read`). */
    request: (method, params) => send(method, params),

    /**
     * The handshake: `initialize`, then the `initialized` notification once the
     * server answers. The protocol wants it before any other call, though 0.148
     * does not enforce that. Sent from the response hook, so it cannot overtake
     * the response and is not sent if the server refuses.
     */
    initialize: () => send('initialize', { clientInfo }, () => notify('initialized')),

    /**
     * Start a thread and watch it from the instant the server names it.
     *
     * `ephemeral` defaults to false so the thread leaves a rollout on disk and
     * a later `thread/resume` can find it; pass true only for work that will
     * never be continued.
     */
    startThread: (params = {}, handlers = {}) => send(
      'thread/start',
      { ephemeral: false, ...params },
      (result) => { const id = result?.thread?.id; if (typeof id === 'string') watch(id, handlers); },
    ).then((result) => ({ threadId: result?.thread?.id ?? null, thread: result?.thread ?? null, result })),

    /**
     * Continue a known thread. The watch goes on before the request, so no
     * event of the resumed thread arrives unowned, and comes off if the server
     * refuses the resume.
     */
    resumeThread: (params = {}, handlers = {}) => {
      const id = typeof params.threadId === 'string' ? params.threadId : null;
      if (id) watch(id, handlers);
      return send('thread/resume', params).catch((err) => {
        if (id && threads.get(id) === handlers) threads.delete(id);
        throw err;
      });
    },

    startTurn: (threadId, params = {}) => send('turn/start', { threadId, ...params }),

    /** Both ids: a turn is not identified by either one alone. */
    interruptTurn: (threadId, turnId) => send('turn/interrupt', { threadId, turnId }),
    steerTurn: (threadId, expectedTurnId, text) => send('turn/steer', {threadId, expectedTurnId, input:[{type:'text',text}]}),

    watch,
    unwatch: (threadId) => threads.delete(threadId),

    /** Stop on purpose. Same settling as a crash, so callers have one ending. */
    close: (note = 'no reason given') => fail('closed', { note }),

    isClosed: () => gone !== null,
    /** The tracing tail, for a cause report. Never protocol. */
    stderr: () => stderrText,
    stats: () => ({ pending: pending.size, threads: threads.size, approvals: openCards.size }),
  };
}
