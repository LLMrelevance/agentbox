// A REAL CLAUDE CODE RUNS ON OTHER PEOPLE'S SETUPS, WITHOUT A LOGIN AND WITHOUT A BILL.
//
// Why this exists (2026-10-15): a person who was sent Agentbox could not set it
// up at all, and that was the pattern, not the exception. Sorting the past
// bugs, about 40 came from how someone's Claude Code or Codex was set up
// (logins, their own settings, hooks and connected tools, versions, folders
// shared with other tools), and the fake Macs would have caught 9 of them,
// because they only ever asked "is it found, does `--version` run?". A real
// task needed a real login, and a real login is somebody's subscription.
//
// What changed: the real Claude Code, signed out, in a home of its own, runs
// whole tasks against a stand-in model on a loopback port
// (scripts/lib/claude-stub-model.mjs). Measured on this Mac with Claude Code
// 2.1.301: the browser copy, on that home, answered a task, its worker wrote
// to the thread through the app's store tools, and a reply resumed the session
// and remembered the first turn, in about 40 s, with nothing billed. setups.mjs
// lays out homes shaped like other people's, and check-setups.mjs runs each.
//
// Those runs need a Claude Code and a browser, so they are not in this suite.
// What is here is what they stand on: the model answering the way the drives
// read it, a key in someone's settings being told apart from ours, and each
// home being laid out the way it says.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defaultAnswer, authOf, createClaudeStubModel, STUB_TOKEN, stubClaudeSettings } from '../scripts/lib/claude-stub-model.mjs';
import { SETUPS, layHome, layRepo, setupNamed } from '../.claude/skills/verify-agentbox/scripts/setups.mjs';
import { layersFor } from '../.claude/skills/verify-agentbox/scripts/verify.mjs';

const user = (text) => ({ role: 'user', content: [{ type: 'text', text }] });
const said = (text) => ({ role: 'assistant', content: [{ type: 'text', text }] });

describe('the stand-in model answers the way the drives read an answer', () => {
  it('a task asking for one word gets that word, with the thread\'s token when it has one', () => {
    expect(defaultAnswer({ messages: [user('reply with exactly the word PINEAPPLE and nothing else.')] })).toBe('PINEAPPLE');
    expect(defaultAnswer({ messages: [user('Setup x: reply with exactly the word PINEAPPLE. [[tok:ab12]]')] })).toBe('PINEAPPLE [ab12]');
    expect(defaultAnswer({ messages: [user('say hello [[tok:zz]]')] })).toBe('The Claude stand-in model answered. [zz]');
  });

  it('a reply remembers the first turn only when the conversation it was sent carries it', () => {
    const resumed = { messages: [user('reply with exactly the word PINEAPPLE'), said('PINEAPPLE'), user('Which word did you just reply with? (k1)')] };
    expect(defaultAnswer(resumed)).toBe('PINEAPPLE');
    // A fresh session with only the question has nothing to remember, and must not guess.
    expect(defaultAnswer({ messages: [user('Which word did you just reply with? (k1)')] })).toBe('I do not know.');
  });

  it('what Claude Code adds to a user message is not what the person asked', () => {
    const body = { messages: [user('reply with exactly the word MANGO'), said('MANGO'), user('Which word did you just reply with?'), user('<system-reminder>reply with exactly the word WRONG</system-reminder>')] };
    expect(defaultAnswer(body)).toBe('MANGO');
  });
});

describe('a key somebody left in their settings is told apart from the stand-in token', () => {
  it('an x-api-key header is a key that would be billed', () => {
    expect(authOf({ 'x-api-key': 'sk-ant-whatever' })).toBe('api-key');
    expect(authOf({ 'x-api-key': 'sk-ant-whatever', authorization: `Bearer ${STUB_TOKEN}` })).toBe('api-key');
  });
  it('our token is ours, any other bearer is not, and nothing is nothing', () => {
    expect(authOf({ authorization: `Bearer ${STUB_TOKEN}` })).toBe('stub');
    expect(authOf({ authorization: 'Bearer some-oauth-token' })).toBe('bearer');
    expect(authOf({})).toBe('none');
  });
});

describe('the stand-in model speaks the Messages API', () => {
  let model;
  afterEach(async () => { await model?.close(); model = null; });
  const events = (text) => text.split('\n\n').filter(Boolean).map((f) => JSON.parse(f.split('\n').find((l) => l.startsWith('data: ')).slice(6)));

  it('streams a text answer as Claude Code reads one', async () => {
    model = createClaudeStubModel({ respond: () => 'PINEAPPLE' });
    const url = await model.listen();
    const res = await fetch(`${url}/v1/messages?beta=true`, { method: 'POST', headers: { authorization: `Bearer ${STUB_TOKEN}` }, body: JSON.stringify({ stream: true, messages: [] }) });
    const ev = events(await res.text());
    expect(ev.map((e) => e.type)).toEqual(['message_start', 'content_block_start', 'content_block_delta', 'content_block_stop', 'message_delta', 'message_stop']);
    expect(ev[2].delta).toEqual({ type: 'text_delta', text: 'PINEAPPLE' });
    expect(ev[4].delta.stop_reason).toBe('end_turn');
    expect(model.requests[0].auth).toBe('stub');
  });

  it('asks Claude Code to run a tool, and stops for its result', async () => {
    model = createClaudeStubModel({ respond: () => ({ toolUse: { name: 'mcp__agentbox__update_work_item', input: { id: 'w-1', note: 'hi' } } }) });
    const url = await model.listen();
    const ev = events(await (await fetch(`${url}/v1/messages`, { method: 'POST', body: JSON.stringify({ stream: true, messages: [] }) })).text());
    expect(ev[1].content_block).toMatchObject({ type: 'tool_use', name: 'mcp__agentbox__update_work_item' });
    expect(JSON.parse(ev[2].delta.partial_json)).toEqual({ id: 'w-1', note: 'hi' });
    expect(ev[4].delta.stop_reason).toBe('tool_use');
  });

  it('refuses when told to, and answers side requests without a turn', async () => {
    model = createClaudeStubModel({ respond: () => ({ status: 429, message: 'out of usage' }) });
    const url = await model.listen();
    expect((await fetch(`${url}/v1/messages`, { method: 'POST', body: '{}' })).status).toBe(429);
    expect(await (await fetch(`${url}/v1/messages/count_tokens`, { method: 'POST', body: '{}' })).json()).toEqual({ input_tokens: 1 });
  });
});

describe('each setup is laid out the way it says', () => {
  const homes = [];
  afterEach(() => { for (const h of homes.splice(0)) fs.rmSync(h, { recursive: true, force: true }); });
  const lay = (name) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-test-'));
    homes.push(home);
    const claude = path.join(home, 'real-claude');
    fs.writeFileSync(claude, '#!/bin/sh\necho 9.9.9\n', { mode: 0o755 });
    const logins = layHome(setupNamed(name), { home, url: 'http://127.0.0.1:1', claude, version: '9.9.9' });
    return { home, claude, logins, settings: (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8')) };
  };

  it('Claude Code sits where its installer puts it, and resolves to the real binary', () => {
    const { home, claude } = lay('plain');
    const link = path.join(home, '.local', 'bin', 'claude');
    expect(fs.readlinkSync(link)).toBe(path.join(home, '.local', 'share', 'claude', 'versions', '9.9.9'));
    expect(fs.realpathSync(link)).toBe(fs.realpathSync(claude));
  });

  it('every login points at the stand-in model, signed with the stand-in token, and keeps the person\'s own settings', () => {
    const { logins, settings } = lay('plan-mode-by-default');
    const s = settings(logins[0]);
    expect(s.env).toMatchObject({ ANTHROPIC_BASE_URL: 'http://127.0.0.1:1', ANTHROPIC_AUTH_TOKEN: STUB_TOKEN });
    expect(s.permissions.defaultMode).toBe('plan');
  });

  it('a key the person left in their settings stays there, because that is the setup under test', () => {
    const { logins, settings } = lay('api-key-in-settings');
    expect(settings(logins[0]).env.ANTHROPIC_API_KEY).toMatch(/^sk-ant-api03-verify/);
  });

  it('two logins are two subscriptions, not one counted twice', () => {
    const { logins } = lay('two-logins');
    expect(logins.map((d) => path.basename(d))).toEqual(['.claude', '.claude-second']);
    const ids = logins.map((d) => JSON.parse(fs.readFileSync(path.join(d, '.claude.json'), 'utf8')).oauthAccount.accountUuid);
    expect(new Set(ids).size).toBe(2);
  });

  it('a login moved by CLAUDE_CONFIG_DIR leaves no ~/.claude behind, and the shell says where it went', () => {
    const { home, logins } = lay('config-dir-from-zshrc');
    expect(logins).toEqual([path.join(home, '.config', 'claude')]);
    expect(fs.existsSync(path.join(home, '.claude'))).toBe(false);
    expect(fs.readFileSync(path.join(home, '.zshrc'), 'utf8')).toContain('CLAUDE_CONFIG_DIR');
  });

  it('connected tools of their own land in ~/.claude.json, beside the default folder, as Claude Code reads them', () => {
    const { home } = lay('own-mcp-servers');
    const json = JSON.parse(fs.readFileSync(path.join(home, '.claude.json'), 'utf8'));
    expect(Object.keys(json.mcpServers)).toEqual(['gone-server', 'agentbox']);
  });

  it('a project\'s committed files are written into the project', () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'setup-repo-'));
    homes.push(repo);
    layRepo(setupNamed('api-key-in-project'), repo);
    expect(JSON.parse(fs.readFileSync(path.join(repo, '.claude', 'settings.json'), 'utf8')).env.ANTHROPIC_API_KEY).toBeTruthy();
    layRepo(setupNamed('plain'), repo);
    expect(fs.readdirSync(repo)).toEqual(['.claude']);
  });

  it('every setup says why it exists and what a person on it needs, and a known gap names one of those needs', () => {
    expect(new Set(SETUPS.map((s) => s.name)).size).toBe(SETUPS.length);
    for (const s of SETUPS) {
      expect(s.why.split(/\s+/).length, s.name).toBeGreaterThan(6);
      expect(Object.keys(s.expect).sort(), s.name).toEqual(['answers', 'billing', 'memory', 'store']);
      for (const k of Object.keys(s.known ?? {})) expect(['answers', 'store', 'memory', 'billing', 'check', 'all'], `${s.name}.known.${k}`).toContain(k);
    }
  });

  it('the stand-in settings never carry a real key', () => {
    expect(Object.keys(stubClaudeSettings('http://x').env).filter((k) => /API_KEY/.test(k))).toEqual([]);
  });
});

describe('the setups run before a deploy', () => {
  const run = (files, opts) => layersFor(files, opts).setups;
  it('any change a person runs gets the setups', () => {
    expect(run(['main/supervisor.mjs']).run).toBe(true);
    expect(run(['scripts/lib/claude-stub-model.mjs']).run).toBe(true);
  });
  it('a docs change does not, and --quick or --no-setups drops them and says so', () => {
    expect(run(['docs/team/PLAN.md']).run).toBe(false);
    expect(run(['main/supervisor.mjs'], { quick: true })).toEqual({ run: false, why: '--quick' });
    expect(run(['main/supervisor.mjs'], { setups: false })).toEqual({ run: false, why: '--no-setups' });
  });
});
