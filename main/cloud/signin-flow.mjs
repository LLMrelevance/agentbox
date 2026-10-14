// A CLAUDE ACCOUNT'S CLOUD SIGN-IN, FROM THE APP (tests/a-claude-account-signs-in-for-the-cloud-from-the-app).
//
// A cloud run uses that account's own subscription through a long-lived token
// from Claude Code's `claude setup-token` (docs/cloud/PLAN.md). That command
// is interactive: it opens a claude.com sign-in page, the page's callback is
// platform.claude.com's code page, the person copies a code back, and the
// token is printed. This drives it in a pseudo-terminal so the cloud menu can
// do the whole thing: open the page, take the pasted code, check the token
// really works, and keep it in the keychain (main/cloud/config.mjs). The
// token never reaches the screen or anything the screen is told.
import { tokenIn } from './redact.mjs';

const WHOLE_TOKEN = /(sk-ant-oat\d*-[A-Za-z0-9_-]+)\s/;
const SIGN_IN_URL = /https:\/\/claude\.com\/cai\/oauth\/authorize\?[^\s"']+/;
const plain = (s) => String(s).replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, '');

export function createCloudSignIn({ spawn, claudeBin = 'claude', verify, save, onChange = () => {}, env = process.env }) {
  const flows = new Map();

  const set = (dir, patch) => {
    const f = flows.get(dir);
    if (!f) return;
    Object.assign(f, patch);
    onChange();
  };

  function start(dir) {
    const live = flows.get(dir);
    if (live && !['saved', 'failed'].includes(live.state)) return;
    const childEnv = { ...env, CLAUDE_CONFIG_DIR: dir };
    // Never an API key: this sign-in is the subscription's, and nothing else.
    for (const k of Object.keys(childEnv)) if (/^ANTHROPIC_/.test(k)) delete childEnv[k];
    // Wide enough that neither the link nor the token is wrapped onto two lines.
    const term = spawn(claudeBin, ['setup-token'], { name: 'xterm-256color', cols: 4000, rows: 50, env: childEnv });
    const f = { state: 'opening', url: null, message: null, term, seen: '', done: false };
    flows.set(dir, f);
    onChange();
    term.onData((d) => {
      if (f.done) return;
      f.seen += plain(d);
      // A token is whole only once something follows it: one split across
      // two chunks must not be taken half-read.
      const token = tokenIn(f.seen.match(WHOLE_TOKEN)?.[1] ?? '');
      if (token) {
        f.done = true;
        f.seen = '';
        set(dir, { state: 'checking' });
        try { term.kill(); } catch { /* already gone */ }
        Promise.resolve(verify(token)).then((ok) => {
          if (!ok) { set(dir, { state: 'failed', message: 'Claude refused the new sign-in; nothing was saved.' }); return; }
          save(dir, token);
          set(dir, { state: 'saved', message: null });
        }, () => set(dir, { state: 'failed', message: 'The new sign-in could not be checked; nothing was saved.' }));
        return;
      }
      const url = f.seen.match(SIGN_IN_URL)?.[0];
      if (url && f.state === 'opening') set(dir, { state: 'needs-code', url });
    });
    term.onExit(() => {
      if (f.done || flows.get(dir) !== f) return;
      f.done = true;
      set(dir, { state: 'failed', message: 'The sign-in ended before Claude gave a token.' });
    });
  }

  function code(dir, text) {
    const f = flows.get(dir);
    const c = String(text || '').trim();
    if (!f || f.done || !c) return;
    f.term.write(`${c}\r`);
    set(dir, { state: 'checking' });
  }

  function cancel(dir) {
    const f = flows.get(dir);
    if (!f) return;
    f.done = true;
    flows.delete(dir);
    try { f.term.kill(); } catch { /* already gone */ }
    onChange();
  }

  // What the screen may know: never the terminal, never what it printed.
  function status() {
    const out = {};
    for (const [dir, f] of flows) out[dir] = { state: f.state, url: f.url, message: f.message };
    return out;
  }

  return { start, code, cancel, status };
}
