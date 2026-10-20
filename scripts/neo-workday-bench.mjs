// Repeatable, silent workday drive through the built app and its real store.
// Run: node scripts/neo-workday-bench.mjs [--live] [--threads 48] [--screenshots <folder>]
// --live uses Decisions and the reply writer, never GPT-Live or a microphone.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { guard } from './lib/chrome-guard.mjs';
import { connect } from '../.claude/skills/verify-agentbox/scripts/cdp.mjs';
import { runDecision } from '../main/neo/decided.mjs';
import { decide, composeReply } from '../main/neo/decide.mjs';
import { readKey } from '../main/neo/live.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const live = process.argv.includes('--live');
const threadAt = process.argv.indexOf('--threads');
const threadCount = threadAt < 0 ? 24 : Number(process.argv[threadAt + 1]);
assert.ok(Number.isInteger(threadCount) && threadCount >= 24 && threadCount <= 96, 'Choose between 24 and 96 threads.');
const pictureAt = process.argv.indexOf('--screenshots');
const pictures = pictureAt < 0 ? null : path.resolve(process.argv[pictureAt + 1]);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-workday-'));
const began = Date.now();
const state = {};
let tab, cleanupChrome, server, booted;
let calls = 0, turns = 0, threads = 0;
const failures = [];

// No inherited task identity, cloud account, worker, or user home belongs here.
for (const k of Object.keys(process.env)) {
  if (/^(ZERO_|STORE_|AGENTBOX_|ASTRAL_|ANTHROPIC_|CLAUDE_CODE_|OPENAI_|CODEX_)/.test(k)) delete process.env[k];
}
process.env.AGENTBOX_HOME = path.join(temp, 'home');
process.env.AGENTBOX_FRESH_USER = '1';
process.env.ZERO_NO_SUPERVISOR = '1';

try {
  const key = live ? await readKey() : null;
  const getKey = async () => key;
  const { bootHeadless, createServer } = await import('../main/serve.mjs');
  const disk = await import('../main/store/work-items.mjs');
  const dataDir = path.join(temp, 'data');
  const storeRoot = path.join(temp, 'store');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'zero.config.json'), JSON.stringify({ storeRoot, accountId: 'neo-test', maxConcurrentSessions: 0, agentsAuto: false, engineChoice: '2026-01-01' }));
  for (const slug of ['sandbox', 'second']) {
    const dir = path.join(storeRoot, 'accounts', 'neo-test', slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'project.json'), JSON.stringify({ schemaVersion: 2, id: slug, name: slug === 'sandbox' ? 'Sandbox' : 'Second' }));
  }
  booted = await bootHeadless({ dataDir, userDir: dataDir, appDir: root });
  booted.supervisor.wake = () => {};
  booted.supervisor.tick = async () => {};
  const seeded = [];
  for (let i = 1; i <= threadCount; i++) {
    const product = i % 2 ? 'sandbox' : 'second';
    const row = booted.store.composeItem(product, { title: `Review daily task ${String(i).padStart(2, '0')}`, body: `Review the wording for daily task ${i}.` });
    disk.updateWorkItem(booted.store.productDir(product), row.id, {
      result: `**Keep this version or revise it?**\n\nThe wording for daily task ${i} is ready.\n\n## Options\n1. Keep this version (recommended)\n2. Revise the wording`,
      problem: `Review the wording for daily task ${i}.`,
      status: 'done',
    }, { source: 'agent' });
    seeded.push({ ...row, product });
  }
  const token = 'neo-test-local-only';
  server = createServer({ channels: booted.channels, listeners: booted.window.listeners, token });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const url = `http://127.0.0.1:${server.address().port}/?token=${token}`;
  const chrome = spawn(process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--mute-audio', '--deny-permission-prompts', '--remote-debugging-port=0',
    `--user-data-dir=${path.join(temp, 'chrome')}`, '--no-first-run', '--window-size=1440,900', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  cleanupChrome = guard(chrome, path.join(temp, 'chrome'));
  const wsUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Muted browser did not start.')), 20_000);
    let output = '';
    chrome.on('error', reject);
    chrome.stderr.on('data', (chunk) => { output += chunk; const match = output.match(/ws:\/\/\S+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
  });
  tab = await connect(wsUrl);
  await tab.call('Page.addScriptToEvaluateOnNewDocument', { source: `
    let zero;
    Object.defineProperty(window, 'zero', { configurable: true, get: () => zero, set: (bridge) => {
      zero = bridge;
      let act, seq = 0;
      const waiting = new Map();
      bridge.neoEnabled = async () => true;
      bridge.onNeoAct = (fn) => { act = fn; return () => { act = null; }; };
      bridge.neoActResult = (id, result) => { waiting.get(id)?.(result); waiting.delete(id); };
      window.neoTestAsk = (name, args = {}, heard = '') => new Promise((resolve, reject) => {
        if (!act) return reject(new Error('Neo listener is not mounted.'));
        const id = ++seq;
        const timer = setTimeout(() => { waiting.delete(id); reject(new Error('Neo action timed out: ' + name)); }, 15000);
        waiting.set(id, (result) => { clearTimeout(timer); resolve(result); });
        act({ id, name, args, heard });
      });
    }});
    localStorage.setItem('theme', 'dark');
    localStorage.setItem('zero.deliveredThrough', '1');
    navigator.mediaDevices.getUserMedia = async () => { throw new Error('Microphone disabled in this test.'); };
    HTMLMediaElement.prototype.play = async function () { this.muted = true; };
  ` });
  await tab.goto(url);
  await tab.until('!!window.neoTestAsk && !!document.querySelector(".list-pane")');
  const askMain = async (name, args = {}, heard = '') => {
    if (name === 'run_command' && !['reply', 'view-inbox', 'flip-view', 'settings'].includes(args.id)) return { ok: false, status: 'refused', said: 'Command excluded from the silent test.' };
    return tab.evaluate(`window.neoTestAsk(${JSON.stringify(name)}, ${JSON.stringify(args)}, ${JSON.stringify(heard)})`);
  };
  const screen = async () => (await askMain('neo_screen')).screen;
  const decideImpl = async (request) => {
    if (++calls > threadCount * 8 + 20) throw new Error('Live test request limit reached.');
    return decide({ ...request, getKey });
  };
  const turn = async (heard, choices = []) => {
    turns++;
    const queue = [...choices];
    const result = await runDecision({ heard, askMain, state,
      decideImpl: live ? decideImpl : async () => ({ choice: queue.shift() ?? 'none', confidence: 0.99 }),
      ...(live ? { compose: (request) => composeReply({ ...request, getKey }) } : {}),
    });
    console.log(`${turns}. ${heard} => ${result.choice ?? '?'}: ${result.say}`);
    return result;
  };
  const saved = (row) => booted.store.readItem(row.product, row.id);
  const waitSaved = async (row, predicate) => {
    const deadline = Date.now() + 12_000;
    while (Date.now() < deadline) { if (predicate(saved(row))) return; await tab.wait(150); }
    assert.ok(predicate(saved(row)), `Saved state did not match for ${row.title}`);
  };
  if (pictures) fs.mkdirSync(pictures, { recursive: true });
  const capture = async (name) => { if (pictures) await tab.capture(path.join(pictures, `${name}.png`)); };
  for (const [i, row] of seeded.entries()) {
    try {
      if ((await screen()).open?.id !== row.id) await turn(`Open the thread ${row.title}.`, [`open:${row.id}`]);
      assert.equal((await screen()).open?.id, row.id);
      if (i % 6 === 0) {
        await turn('What is this about?', ['summary']);
        assert.equal((await screen()).open?.id, row.id);
        if (pictures) await tab.capture(path.join(pictures, `thread-${String(i + 1).padStart(2, '0')}.png`));
      }
      if (i % 4 === 0) {
        await turn('Tell the agent: keep the wording concise.', ['reply']);
        if (i === 0) await capture('01-reply-sent');
        await waitSaved(row, (r) => /keep the wording concise/i.test(r.answer ?? ''));
      } else if (i % 4 === 1) {
        await turn('Go with option two.', ['pick:2']);
        if (i === 1) await capture('02-option-picked');
        await waitSaved(row, (r) => /Revise the wording/i.test(r.answer ?? ''));
      } else if (i % 4 === 2) {
        await turn('Put this off for ten minutes.', ['later']);
        if (i === 2) await capture('03-moved-to-later');
        await waitSaved(row, (r) => r.snoozedUntil > Date.now());
        await turn('Undo that.', ['undo']);
        if (i === 2) await capture('04-snooze-undone');
        await waitSaved(row, (r) => !r.snoozedUntil || r.snoozedUntil <= Date.now());
        await turn('Close this.', ['close']);
        if (i === 2) await capture('05-close-confirmation');
        if (state.pending) await turn('Yes, close it anyway.', ['yes']);
        if (i === 2) await capture('06-close-confirmed');
        await waitSaved(row, (r) => r.status === 'done' && r.wrote?.status?.source === 'founder');
      } else {
        await turn('Close this and go to the next thread.', ['close', 'next', 'a']);
        if (state.pending) await turn('Yes, close it anyway.', ['yes']);
        await waitSaved(row, (r) => r.status === 'done' && r.wrote?.status?.source === 'founder');
      }
      threads++;
      if (i % 6 === 5) {
        await tab.goto(url);
        await tab.until('!!window.neoTestAsk && !!document.querySelector(".list-pane")');
        assert.ok((await screen()).rows.length >= 0);
      }
    } catch (error) {
      failures.push(`${row.title}: ${error.message}`);
      console.error(`FAIL ${failures.at(-1)}`);
      if (pictures) await tab.capture(path.join(pictures, `failure-${i + 1}.png`));
    }
  }
  const beforeNew = new Set(booted.store.listItems().map((r) => r.id));
  await turn('Start a new task in Second: reconcile receipts.', ['new:second']);
  const made = booted.store.listItems().find((r) => !beforeNew.has(r.id));
  assert.ok(made, 'New task was not saved.');
  assert.equal(made.product, 'second');
  assert.match(`${made.title} ${made.body ?? ''}`, /reconcile receipts/i);
  await turn('Undo that.', ['undo']);
  await waitSaved(made, (r) => r.status === 'done' && r.wrote?.status?.source === 'founder');
  console.log(`Completed ${threads}/${threadCount} threads, ${turns} turns, ${calls} live decisions, ${Math.round((Date.now() - began) / 1000)} seconds.`);
  assert.equal(failures.length, 0, failures.join('\n'));
  assert.equal(tab.errors.filter((e) => /exception:/.test(e)).length, 0, tab.errors.join('\n'));
} finally {
  tab?.detach();
  cleanupChrome?.();
  server?.closeAllConnections();
  server?.close();
  booted?.supervisor.killAll();
  booted?.supervisor.stop();
  booted?.store.watchers.forEach((watcher) => watcher.close());
  fs.rmSync(temp, { recursive: true, force: true });
}
process.exit(0);
