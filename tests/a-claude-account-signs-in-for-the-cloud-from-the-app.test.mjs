// A CLAUDE ACCOUNT SIGNS IN FOR THE CLOUD FROM THE APP, WITH NO TERMINAL.
//
// What broke: on 2026-10-14 the founder picked "Everything" and every thread
// still ran on her Mac. None of her three Claude accounts had a cloud sign-in,
// and the only way to make one was `node scripts/cloud-signin.mjs <folder>` in
// a terminal, three times. Her words: "Everything should work naturally in the
// app so if I have to run commands, it's kind of a point of failure."
// Measured by driving `claude setup-token` in a pseudo-terminal on her Mac
// (Claude Code 2.1.293): it opens a claude.com sign-in page whose callback is
// platform.claude.com's code page, so the person copies a code back, and the
// token arrives on stdout. Here: the same flow with a scripted terminal.

import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { createCloudSignIn } from '../main/cloud/signin-flow.mjs';

const URL_LINE = 'Browser didn\'t open? Use the url below to sign in (c to copy)\r\nhttps://claude.com/cai/oauth/authorize?code=true&client_id=x&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&scope=user%3Ainference&state=s\r\n';
const TOKEN = 'sk-ant-oat01-' + 'A'.repeat(40);

function fakeTerminal() {
  const t = new EventEmitter();
  t.written = [];
  t.killed = false;
  t.onData = (fn) => t.on('data', fn);
  t.onExit = (fn) => t.on('exit', fn);
  t.write = (s) => t.written.push(s);
  t.kill = () => { t.killed = true; t.emit('exit', { exitCode: 0 }); };
  return t;
}

const flow = ({ works = true } = {}) => {
  const term = fakeTerminal();
  const saved = [];
  const spawned = [];
  const changes = [];
  const f = createCloudSignIn({
    spawn: (bin, args, opts) => { spawned.push({ bin, args, env: opts.env }); return term; },
    claudeBin: '/bin/claude',
    verify: async (token) => works && token === TOKEN,
    save: (dir, token) => saved.push({ dir, token }),
    onChange: () => changes.push(f.status()),
    env: { PATH: '/bin', ANTHROPIC_API_KEY: 'nope', HOME: '/home/x' },
  });
  return { f, term, saved, spawned, changes };
};
const settle = () => new Promise((r) => setTimeout(r, 10));

describe('signing a Claude account in for the cloud', () => {
  it('runs Claude Code\'s own setup-token for that account, never with an API key', () => {
    const { f, spawned } = flow();
    f.start('/Users/x/.claude-2');
    expect(spawned).toHaveLength(1);
    expect(spawned[0].bin).toBe('/bin/claude');
    expect(spawned[0].args).toEqual(['setup-token']);
    expect(spawned[0].env.CLAUDE_CONFIG_DIR).toBe('/Users/x/.claude-2');
    expect(spawned[0].env.ANTHROPIC_API_KEY).toBeUndefined();
  });

  it('asks for the code once the sign-in page is open, and offers the page again', () => {
    const { f, term } = flow();
    f.start('/Users/x/.claude-2');
    expect(f.status()['/Users/x/.claude-2'].state).toBe('opening');
    term.emit('data', '\x1b[2mThis will guide you through long-lived (1-year) auth token setup\x1b[0m\r\n');
    term.emit('data', URL_LINE);
    const s = f.status()['/Users/x/.claude-2'];
    expect(s.state).toBe('needs-code');
    expect(s.url).toMatch(/^https:\/\/claude\.com\/cai\/oauth\/authorize\?/);
  });

  it('types the pasted code in, checks the token works, and saves it for that account only', async () => {
    const { f, term, saved } = flow();
    f.start('/Users/x/.claude-2');
    term.emit('data', URL_LINE);
    f.code('/Users/x/.claude-2', '  abc#123  ');
    expect(term.written).toEqual(['abc#123\r']);
    expect(f.status()['/Users/x/.claude-2'].state).toBe('checking');
    term.emit('data', `Your OAuth token (valid for 1 year):\r\n\r\n${TOKEN.slice(0, 20)}`);
    term.emit('data', `${TOKEN.slice(20)}\r\n\r\nStore this token securely.\r\n`);
    await settle();
    expect(saved).toEqual([{ dir: '/Users/x/.claude-2', token: TOKEN }]);
    expect(f.status()['/Users/x/.claude-2'].state).toBe('saved');
    expect(term.killed).toBe(true);
  });

  it('never puts the token in what the screen is told', async () => {
    const { f, term, changes } = flow();
    f.start('/Users/x/.claude-2');
    term.emit('data', URL_LINE);
    term.emit('data', `${TOKEN}\r\n`);
    await settle();
    expect(JSON.stringify(changes)).not.toContain('sk-ant-oat');
    expect(JSON.stringify(f.status())).not.toContain('sk-ant-oat');
  });

  it('saves nothing when Claude refuses the new sign-in, and says so', async () => {
    const { f, term, saved } = flow({ works: false });
    f.start('/Users/x/.claude-2');
    term.emit('data', `${TOKEN}\r\n`);
    await settle();
    expect(saved).toEqual([]);
    expect(f.status()['/Users/x/.claude-2']).toMatchObject({ state: 'failed' });
    expect(f.status()['/Users/x/.claude-2'].message).toMatch(/refused/);
  });

  it('says it failed when setup-token ends without a token', () => {
    const { f, term } = flow();
    f.start('/Users/x/.claude-2');
    term.emit('data', URL_LINE);
    term.emit('exit', { exitCode: 1 });
    expect(f.status()['/Users/x/.claude-2'].state).toBe('failed');
  });

  it('starts one sign-in per account at a time, and lets one be cancelled', () => {
    const { f, spawned, term } = flow();
    f.start('/Users/x/.claude-2');
    f.start('/Users/x/.claude-2');
    expect(spawned).toHaveLength(1);
    f.cancel('/Users/x/.claude-2');
    expect(term.killed).toBe(true);
    expect(f.status()['/Users/x/.claude-2']).toBeUndefined();
  });
});
