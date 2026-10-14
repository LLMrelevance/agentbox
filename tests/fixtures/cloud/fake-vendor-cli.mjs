#!/usr/bin/env node
// A STAND-IN FOR `claude` AND `codex` IN THE CLOUD SANDBOX'S SIGN-IN TESTS.
//
// Installed as both names in a folder put first on the sandbox's PATH, as
// `node fake-vendor-cli.mjs <name> ...`. It does what each vendor's command
// does, as far as the sandbox can tell:
//   claude setup-token        prints the sign-in link, reads the code, prints
//                             a one-year token (the code "good#code" works)
//   claude -p ...             answers "ok" only on that token
//   codex login --device-auth prints the link and a one-time code, then
//                             writes CODEX_HOME/auth.json as if the person
//                             finished on OpenAI's page
//   codex exec ...            renews the login when it is over 8 days old
//   anything else             prints what a run would let slip: its token
//                             and its auth file, for the redaction tests
// FAKE_VENDOR_MODE in its environment changes one behaviour per test.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Imported by a test only for TOKEN: then it does nothing.
const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const name = direct ? process.argv[2] : null;
const args = process.argv.slice(3);
const mode = process.env.FAKE_VENDOR_MODE || '';
export const TOKEN = 'sk-ant-oat01-' + 'Q'.repeat(60); // public-check: allow (made up)

const jwt = (exp) => ['e30', Buffer.from(JSON.stringify({ exp })).toString('base64url'), 'sig'].join('.');

if (name === 'claude' && args[0] === 'setup-token') {
  process.stdout.write('\x1b[2mThis will guide you through long-lived (1-year) auth token setup\x1b[0m\r\n');
  process.stdout.write('Browser didn\'t open? Use the url below to sign in (c to copy)\r\n');
  process.stdout.write('https://claude.com/cai/oauth/authorize?code=true&client_id=x&response_type=code&state=s\r\n');
  process.stdout.write('Paste code here if prompted > ');
  let got = '';
  process.stdin.on('data', (d) => {
    got += d;
    if (!/[\r\n]/.test(got)) return;
    const code = got.trim();
    if (code !== 'good#code') { process.stdout.write('\r\nOAuth error: Invalid code\r\n'); process.exit(1); }
    // The token arrives in two pieces, as a terminal may deliver it.
    process.stdout.write(`\r\nYour OAuth token (valid for 1 year):\r\n\r\n${TOKEN.slice(0, 25)}`);
    setTimeout(() => {
      process.stdout.write(`${TOKEN.slice(25)}\r\n\r\nStore this token securely.\r\n`);
      // The real command waits for a key; the sandbox ends it.
      setInterval(() => {}, 1000);
    }, 50);
  });
} else if (name === 'claude' && args[0] === '-p') {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN === TOKEN && mode !== 'claude-refuses' && mode !== 'claude-offline') { process.stdout.write('ok\n'); process.exit(0); }
  process.stderr.write(mode === 'claude-offline' ? 'API Error: Connection error (ECONNRESET)\n' : 'Invalid bearer token\n');
  process.exit(1);
} else if (name === 'codex' && args[0] === 'login' && args.includes('--device-auth')) {
  process.stdout.write('Welcome to Codex\n\nFollow these steps to sign in with ChatGPT using device code authorization:\n\n');
  process.stdout.write('1. Open this link in your browser and sign in to your account\n   https://auth.openai.com/codex/device\n\n');
  if (mode === 'codex-split') {
    // The code arrives in two reads, its last letter a moment later.
    process.stdout.write('2. Enter this one-time code (expires in 15 minutes)\n   WY6D-YCCO');
    setTimeout(() => process.stdout.write('E\n\n'), 80);
  } else process.stdout.write('2. Enter this one-time code (expires in 15 minutes)\n   WY6D-YCCOE\n\n');
  setTimeout(() => {
    if (mode === 'codex-abandoned') process.exit(1);
    const home = process.env.CODEX_HOME;
    fs.writeFileSync(path.join(home, 'auth.json'), JSON.stringify({
      OPENAI_API_KEY: null,
      tokens: { id_token: jwt(9_999_999_999), access_token: jwt(Math.floor(Date.now() / 1000) + 240 * 3600), refresh_token: 'rt-real-refresh-token-0001', account_id: 'acct-1' },
      last_refresh: new Date().toISOString(),
    }));
    process.stdout.write('Successfully logged in\n');
    process.exit(0);
  }, 150);
} else if (name === 'codex' && args[0] === 'exec') {
  const file = path.join(process.env.CODEX_HOME, 'auth.json');
  const auth = JSON.parse(fs.readFileSync(file, 'utf8'));
  const old = Date.now() - Date.parse(auth.last_refresh) > 8 * 24 * 3600 * 1000;
  if (mode === 'codex-offline') { process.stderr.write('stream error: error sending request (connection reset)\n'); process.exit(1); }
  if (mode === 'codex-cannot-renew') { process.stderr.write('Your access token could not be refreshed: refresh_token_reused. Please log out and sign in again.\n'); process.exit(1); }
  if (old) {
    auth.tokens = { ...auth.tokens, access_token: jwt(Math.floor(Date.now() / 1000) + 240 * 3600 + 7), refresh_token: 'rt-real-refresh-token-0002' };
    auth.last_refresh = new Date().toISOString();
    fs.writeFileSync(file, JSON.stringify(auth));
  }
  process.stdout.write('ok\n');
} else if (direct && mode === 'write-token') {
  // A run that writes its login into the project, and commits it.
  fs.writeFileSync('debug.txt', `token=${process.env.CLAUDE_CODE_OAUTH_TOKEN}\n`);
  fs.writeFileSync('loose.txt', `also ${process.env.CLAUDE_CODE_OAUTH_TOKEN}\n`);
  if (process.env.FAKE_COMMIT) {
    const { execFileSync } = await import('node:child_process');
    execFileSync('git', ['add', 'debug.txt']);
    execFileSync('git', ['-c', 'user.name=A', '-c', 'user.email=a@example.com', 'commit', '-q', '-m', 'oops']);
  }
} else if (direct) {
  // A run: what an agent could print about its own sign-in.
  const home = process.env.CODEX_HOME;
  const auth = home && fs.existsSync(path.join(home, 'auth.json')) ? fs.readFileSync(path.join(home, 'auth.json'), 'utf8') : null;
  process.stdout.write(JSON.stringify({ token: process.env.CLAUDE_CODE_OAUTH_TOKEN || null, auth }) + '\n');
  // The same, split across two writes.
  const t = process.env.CLAUDE_CODE_OAUTH_TOKEN || '';
  process.stdout.write(`again ${t.slice(0, 30)}`);
  setTimeout(() => { process.stdout.write(`${t.slice(30)} done\n`); }, 60);
}
