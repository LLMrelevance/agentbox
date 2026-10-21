// A LONG CLOUD THREAD SENDS ONLY THE NEW END OF ITS CONVERSATION, BOTH WAYS.
//
// A one-line reply on a long thread took 7 minutes in the cloud and 17
// seconds of that was the agent (2026-10-21). Its log said "299 s packing and
// sending here": before every reply the Mac uploaded the thread's whole
// Claude Code transcript, 430 MB, and after it the cloud zipped the whole
// folder and the Mac downloaded it again, another 83 s before the answer
// showed. Across 95 cloud starts on that Mac, 25 spent a minute or more
// sending, and every one of the slowest was a thread with a transcript of
// hundreds of MB. Compressing it only takes it to 61%.
//
// A transcript only ever grows, so it now goes up in pieces named from what
// they hold, and a piece the bucket already has is not sent again: a reply
// sends the last piece and what is new. The cloud sends back only the lines
// it added, and the Mac adds them to its own copy. Driven for real on one
// machine: the real sandbox server, a stand-in S3 that counts what was put,
// and the stand-in Claude Code.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createSandbox } from '../cloud/sandbox/server.mjs';
import { cloudRun, transcriptFolderName, IMPORT_FAILED } from '../main/cloud/run.mjs';
import { readMarker } from '../main/cloud/marker.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const FAKE_CLAUDE = here('./fixtures/cloud/fake-claude.mjs');
const FAKE_STORE = here('./fixtures/cloud/fake-store-server.mjs');
const STUB = here('../cloud/sandbox/mcp-stub.mjs');
const LOGIN = { engine: 'claude', id: 'L1', key: 'logins/claude/L1.json' };
const TAKES_PARTS = ['offline', 'setup', 'kept', 'base', 'parts'];
const OLD_IMAGE = ['offline', 'setup', 'kept', 'base'];
const PART = 64 * 1024;
const SESSION = 'long-thread-0001';

let tmp; let sandbox; let sandboxUrl; let s3; let s3Url; let objects; let puts; let cloudPuts; let mac; let heard;
const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();

beforeEach(async () => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloudtail-')));
  objects = new Map();
  puts = [];
  cloudPuts = [];
  s3 = http.createServer((req, res) => {
    const k = decodeURIComponent(req.url.slice(1).split('?')[0]);
    if (req.method === 'GET') { const b = objects.get(k); res.writeHead(b ? 200 : 404); return res.end(b); }
    const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => {
      const body = Buffer.concat(chunks);
      objects.set(k, body);
      cloudPuts.push({ key: k, size: body.length });
      res.writeHead(200); res.end();
    });
  });
  await new Promise((r) => s3.listen(0, '127.0.0.1', r));
  s3Url = `http://127.0.0.1:${s3.address().port}`;
  sandbox = createSandbox({ workRoot: path.join(tmp, 'vm-work'), pathRoot: path.join(tmp, 'vm'), bridgeSocket: path.join(tmp, 'bridge.sock') });
  objects.set(LOGIN.key, Buffer.from(JSON.stringify({ engine: 'claude', token: 'tok-123-cloud-signin-only' })));
  const addr = await sandbox.listen(0, '127.0.0.1');
  sandboxUrl = `http://127.0.0.1:${addr.port}`;

  mac = path.join(tmp, 'mac', 'repo');
  fs.mkdirSync(mac, { recursive: true });
  git(mac, 'init', '-q', '-b', 'main');
  git(mac, 'config', 'user.email', 'dev@example.com');
  git(mac, 'config', 'user.name', 'Dev');
  fs.writeFileSync(path.join(mac, 'a.txt'), 'one\n');
  git(mac, 'add', '.');
  git(mac, 'commit', '-q', '-m', 'first');
  git(mac, 'update-ref', 'refs/remotes/origin/main', 'main');
  git(mac, 'checkout', '-q', '-b', 'agentbox/w-1');
  heard = [];
});

afterEach(async () => {
  await sandbox?.close();
  s3.closeAllConnections();
  await new Promise((r) => s3.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
});

const transport = {
  async invoke(sessionId, payload) {
    const res = await fetch(`${sandboxUrl}/invocations`, { method: 'POST', body: JSON.stringify(payload), headers: { 'content-type': 'application/json' } });
    return res.json();
  },
  async stop() {},
};
const storage = {
  async put(k, body) { puts.push({ key: k, size: Buffer.byteLength(body) }); objects.set(k, Buffer.from(body)); },
  async get(k) { return objects.get(k) ?? null; },
  async exists(k) { return objects.has(k); },
  async getUrl(k) { return `${s3Url}/${encodeURIComponent(k)}`; },
  async putUrl(k) { return `${s3Url}/${encodeURIComponent(k)}`; },
};

const configDir = () => path.join(tmp, 'mac', 'claude-home');
const projects = () => path.join(configDir(), 'projects', transcriptFolderName(mac));
const transcript = (id = SESSION) => path.join(projects(), `${id}.jsonl`);
// Where the cloud machine kept it (its paths sit under `vm`).
const inTheCloud = (p) => path.join(tmp, 'vm', p);
const freshMachine = () => fs.rmSync(path.join(tmp, 'vm'), { recursive: true, force: true });
// The line the stand-in Claude Code adds to its transcript for a message.
const lineFor = (message) => `${JSON.stringify({ type: 'user', text: message })}\n`;

// A transcript of `bytes`, in lines that do not compress to nothing.
function writeTranscript(bytes) {
  fs.mkdirSync(projects(), { recursive: true });
  let text = '';
  while (text.length < bytes) text += `${JSON.stringify({ type: 'assistant', text: crypto.randomBytes(300).toString('base64') })}\n`;
  text = `${text.slice(0, bytes - 1)}\n`;
  fs.writeFileSync(transcript(), text);
  return Buffer.from(text);
}

// An image from before parts refuses a start that carries them.
const oldImage = {
  ...transport,
  async invoke(sessionId, payload) {
    if (payload.action === 'start' && (payload.files || []).some((f) => f.parts)) return { ok: false, error: 'bad-start', message: 'every file needs an absolute path and a url' };
    return transport.invoke(sessionId, payload);
  },
};

function launch({ message = 'please do it', caps = TAKES_PARTS, resume = SESSION, onOut = () => {}, refuseParts = false } = {}) {
  fs.mkdirSync(configDir(), { recursive: true });
  const mcpFile = path.join(tmp, 'mac', 'mcp.json');
  fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: { agentbox: { command: process.execPath, args: [FAKE_STORE], env: { FAKE_STORE_LOG: path.join(tmp, 'store.log') } } } }));
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  let out = ''; let err = '';
  stdout.on('data', (d) => { out += d; onOut(out); if (out.includes('"type":"result"')) stdin.end(); });
  stderr.on('data', (d) => { err += d; });
  const done = cloudRun({
    argv: [FAKE_CLAUDE, '-p', '--output-format', 'stream-json', '--mcp-config', mcpFile, ...(resume ? ['--resume', resume] : [])],
    env: { ...process.env, ZERO_ITEM: 'w-1', ZERO_PRODUCT: 'p', CLAUDE_CONFIG_DIR: configDir(), AGENTBOX_HOME: path.join(tmp, 'mac') },
    cwd: mac, transport: refuseParts ? oldImage : transport, storage, login: LOGIN,
    stdin, stdout, stderr, remoteCommand: process.execPath, stubPath: STUB, pollWaitMs: 200, resultsWaitMs: 8000, watchParent: false, signals: new EventEmitter(),
    homeDir: path.join(tmp, 'home'),
    imageCaps: caps,
    onCaps: (c) => heard.push(c),
    partBytes: PART,
  });
  stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: message } }) + '\n');
  return { done, err: () => err };
}

const partPuts = () => puts.filter((p) => /^runs\/cache\/\d+\/part-[0-9a-f]{64}$/.test(p.key));
// Files sent whole; the tools' settings go this way too, and are small.
const wholePuts = () => puts.filter((p) => /^runs\/[0-9a-f-]{36}\/files\/\d+$/.test(p.key) && p.size > 5000);
const sum = (list) => list.reduce((n, p) => n + p.size, 0);
// What the cloud sent home of the conversation's folder.
const broughtHome = () => cloudPuts.filter((p) => /\/projects\.tgz$/.test(p.key));
const leftovers = () => fs.readdirSync(projects()).filter((n) => n !== `${SESSION}.jsonl`);

describe('a reply on a long conversation, to an image that takes parts', () => {
  it('sends it once, then only its new end, and only the new end comes home', async () => {
    const before = writeTranscript(1_000_000);

    const first = launch({ message: 'first reply' });
    expect(await first.done, first.err()).toBe(0);
    // All of it went up once, in pieces, and nothing went up whole.
    expect(wholePuts()).toHaveLength(0);
    expect(partPuts().length).toBe(Math.ceil(before.length / PART));
    expect(sum(partPuts())).toBe(before.length);
    // The cloud resumed exactly the Mac's conversation.
    const afterFirst = Buffer.concat([before, Buffer.from(lineFor('first reply'))]);
    expect(fs.readFileSync(inTheCloud(transcript())).equals(afterFirst)).toBe(true);
    // Only what the cloud added came home, and the Mac's copy is the cloud's.
    expect(broughtHome()).toHaveLength(1);
    expect(broughtHome()[0].size).toBeLessThan(before.length / 20);
    expect(fs.readFileSync(transcript()).equals(afterFirst)).toBe(true);
    expect(leftovers()).toEqual([]);

    // The next reply, on a new machine: only the last piece and the new line.
    puts.length = 0;
    freshMachine();
    const second = launch({ message: 'second reply' });
    expect(await second.done, second.err()).toBe(0);
    expect(wholePuts()).toHaveLength(0);
    expect(partPuts()).toHaveLength(1);
    expect(sum(partPuts())).toBeLessThanOrEqual(PART);
    const afterSecond = Buffer.concat([afterFirst, Buffer.from(lineFor('second reply'))]);
    expect(fs.readFileSync(inTheCloud(transcript())).equals(afterSecond)).toBe(true);
    expect(fs.readFileSync(transcript()).equals(afterSecond)).toBe(true);
    expect(leftovers()).toEqual([]);
  });

  it('sends nothing it sent before when the conversation is a whole number of pieces long', async () => {
    const before = writeTranscript(4 * PART);
    const first = launch({ message: 'first reply' });
    expect(await first.done, first.err()).toBe(0);
    expect(partPuts()).toHaveLength(4);

    puts.length = 0;
    freshMachine();
    const second = launch({ message: 'second reply' });
    expect(await second.done, second.err()).toBe(0);
    // The four whole pieces are in the bucket; only the line past them goes.
    expect(partPuts()).toHaveLength(1);
    expect(sum(partPuts())).toBe(Buffer.byteLength(lineFor('first reply')));
    expect(fs.readFileSync(transcript()).equals(Buffer.concat([before, Buffer.from(lineFor('first reply') + lineFor('second reply'))]))).toBe(true);
  });

  it('keeps a conversation that changed on this Mac while the run was away, and adds the run\'s new end to it', async () => {
    writeTranscript(300_000);
    let changed = null;
    const run = launch({
      message: 'a reply',
      onOut: (out) => {
        if (changed || !out.includes('"type":"assistant"')) return;
        const now = fs.readFileSync(transcript());
        now.write('{"type":"changed-here"}', 0);
        fs.writeFileSync(transcript(), now);
        changed = now;
      },
    });
    expect(await run.done, run.err()).toBe(0);
    expect(changed).not.toBe(null);
    expect(fs.readFileSync(transcript()).equals(Buffer.concat([changed, Buffer.from(lineFor('a reply'))]))).toBe(true);
    expect(run.err()).toMatch(/changed on this Mac/);
    expect(leftovers()).toEqual([]);
  });

  it('brings a new conversation, with nothing to resume, home whole', async () => {
    const run = launch({ message: 'a new thread', resume: null });
    expect(await run.done, run.err()).toBe(0);
    expect(partPuts()).toHaveLength(0);
    expect(fs.readFileSync(path.join(projects(), 'cloud-session-0001.jsonl'), 'utf8')).toBe(lineFor('a new thread'));
  });
});

describe('a reply on a long conversation, to an image that has not said it takes parts', () => {
  it('sends it whole and brings it home whole, as before', async () => {
    const before = writeTranscript(300_000);
    const run = launch({ message: 'a reply', caps: OLD_IMAGE });
    expect(await run.done, run.err()).toBe(0);
    expect(partPuts()).toHaveLength(0);
    expect(wholePuts().map((p) => p.size)).toContain(before.length);
    expect(broughtHome()[0].size).toBeGreaterThan(before.length / 2);
    expect(fs.readFileSync(transcript()).equals(Buffer.concat([before, Buffer.from(lineFor('a reply'))]))).toBe(true);
  });

  it('learns from the start\'s answer that this image takes parts', async () => {
    writeTranscript(10_000);
    const run = launch({ caps: OLD_IMAGE });
    expect(await run.done, run.err()).toBe(0);
    expect(heard).toEqual([expect.arrayContaining(['parts'])]);
  });

  it('loses no reply when the Mac was wrongly sure, and sends it whole next time', async () => {
    const before = writeTranscript(10_000);
    const refused = launch({ caps: ['parts'], refuseParts: true });
    expect(await refused.done).toBe(IMPORT_FAILED);
    expect(heard).toEqual([[]]);
    expect(readMarker(mac)).toBe(null);

    const again = launch({ message: 'a reply', caps: heard.at(-1), refuseParts: true });
    expect(await again.done, again.err()).toBe(0);
    expect(fs.readFileSync(transcript()).equals(Buffer.concat([before, Buffer.from(lineFor('a reply'))]))).toBe(true);
  });
});

describe('the cloud machine', () => {
  const startWith = (file) => transport.invoke('s1', { action: 'start', runId: 'r1', cwd: path.join(tmp, 'work'), plain: true, argv: [process.execPath, '-e', '0'], files: [file] });
  const piece = (body) => {
    objects.set('p', Buffer.from(body));
    return { url: `${s3Url}/p`, size: Buffer.byteLength(body), sha256: crypto.createHash('sha256').update(body).digest('hex') };
  };
  const stateOf = async () => {
    for (let i = 0; i < 100; i += 1) {
      const s = await transport.invoke('s1', { action: 'status', runId: 'r1' });
      if (s.state !== 'preparing') return s.state;
      await new Promise((r) => setTimeout(r, 50));
    }
    return 'preparing';
  };

  it('refuses a file whose pieces are not well formed', async () => {
    const file = path.join(tmp, 'x.jsonl');
    expect(await startWith({ path: file, parts: [{ url: `${s3Url}/p`, size: 3, sha256: 'nope' }] })).toMatchObject({ ok: false, error: 'bad-start' });
    expect(await startWith({ path: file, parts: 'p' })).toMatchObject({ ok: false, error: 'bad-start' });
    expect(await startWith({ path: file })).toMatchObject({ ok: false, error: 'bad-start' });
  });

  it('does not start from a piece that is not what the Mac sent', async () => {
    const file = path.join(tmp, 'x.jsonl');
    const p = piece('the real line\n');
    objects.set('p', Buffer.from('another line\n'));
    expect(await startWith({ path: file, parts: [p] })).toMatchObject({ ok: true, caps: expect.arrayContaining(['parts']) });
    expect(await stateOf()).toBe('failed');
    expect(fs.existsSync(path.join(tmp, 'vm', file))).toBe(false);
  });

  it('lays an empty file from no pieces', async () => {
    const file = path.join(tmp, 'x.jsonl');
    expect(await startWith({ path: file, parts: [] })).toMatchObject({ ok: true });
    expect(await stateOf()).not.toBe('failed');
    expect(fs.readFileSync(path.join(tmp, 'vm', file), 'utf8')).toBe('');
  });
});
