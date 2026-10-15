// HOW PEOPLE ACTUALLY SET UP CLAUDE CODE, AS HOMES THE REAL CLAUDE CODE RUNS IN.
//
// machines.mjs asks whether the app FINDS Claude Code and Codex on a Mac unlike
// this one. This file asks the next question, the one most bug reports were
// really about: once found, does a whole task run, answer, write to the store
// and remember the thread, when the person's own Claude Code is configured the
// way theirs is? Their hooks, their connected tools, their permission mode,
// their API key in a settings file, a second login, transcripts turned off.
//
// Each setup is a home folder laid out for real: Claude Code's own installer
// layout pointing at the real binary on this Mac, the person's settings, and
// the project's committed .claude files. The app is the browser copy
// (live.mjs up --setup <name>), so every part of Agentbox is real; the only
// stand-in is the model (stub-claude-server.mjs), which is why it is free.
//
// To add one: an entry in SETUPS with
//   why     the bug class, in a sentence, and where it came from if it did
//   login   the folders that hold a login (default ['.claude'])
//   settings(ctx)  the person's ~/.claude/settings.json (the model's address is added on top)
//   userJson       extra keys for ~/.claude.json (user-scope MCP servers live there)
//   home           { 'relative/path': contents } anything else in their home
//   repo           { 'relative/path': contents } committed in the project
//   expect  what a person on that setup needs, NOT what the code does today:
//           answers, store (the worker's note reaches the thread), memory (a
//           reply remembers the first turn), billing ('subscription' unless the
//           person really meant otherwise)
//   known   { <expectation>: 'why it fails today, and the thread it is filed on' },
//           or { all: ... } when the setup cannot run a task at all
//   check(home) extra claims about this setup: [{ ok, sentence, evidence }]
//
// A bug report that turns out to be about someone's Claude Code or Codex setup
// should become a setup here before it is fixed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const { stubClaudeSettings } = await import(path.join(REPO, 'scripts/lib/claude-stub-model.mjs'));

const HOOK_LOG = '.hook-ran.log';
/** A hook command that leaves a mark in the home, so a check knows the person's hook really ran. */
const mark = (home, event) => `echo ${event} >> '${path.join(home, HOOK_LOG)}'`;
const hooksRan = (home) => { try { return fs.readFileSync(path.join(home, HOOK_LOG), 'utf8').split('\n').filter(Boolean); } catch { return []; } };

const NORMAL = { answers: true, store: true, memory: true, billing: 'subscription' };

export const SETUPS = [
  {
    name: 'plain',
    why: 'the installer\'s layout and nothing else: the baseline every other setup is read against',
    expect: NORMAL,
  },
  {
    name: 'two-logins',
    why: 'two subscriptions in ~/.claude and ~/.claude-second: a reply has to go back to the login whose folder holds the session (12 past bugs were accounts and logins)',
    login: ['.claude', '.claude-second'],
    expect: NORMAL,
  },
  {
    name: 'own-hooks',
    why: 'people run hooks on every event (formatters, loggers, notifiers, context injectors); a worker inherits all of them',
    settings: ({ home }) => ({
      hooks: Object.fromEntries(['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'Notification', 'SessionEnd']
        .map((ev) => [ev, [{ matcher: '*', hooks: [{ type: 'command', command: ev === 'UserPromptSubmit' || ev === 'SessionStart'
          // A hook that prints is added to the conversation: a lot of it, as a context injector does.
          ? `${mark(home, ev)}; printf 'Project rules from my hook: %.0s' $(seq 1 200)`
          : mark(home, ev) }] }]])),
    }),
    expect: NORMAL,
    check: (home) => {
      const ran = new Set(hooksRan(home));
      const want = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'Stop'];
      return [{ ok: want.every((e) => ran.has(e)), sentence: 'the person\'s own hooks really ran in the worker', evidence: [...ran].join(' ') || 'none ran' }];
    },
  },
  {
    name: 'broken-hooks',
    why: 'a hook whose script was moved, one that exits 1, and one that times out: Claude Code keeps going, and so must the task',
    settings: () => ({
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: '/nonexistent/hook.sh' }] }],
        UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'echo "lint failed" >&2; exit 1' }] }],
        PostToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'sleep 30', timeout: 2 }] }],
      },
    }),
    expect: NORMAL,
  },
  {
    name: 'own-mcp-servers',
    why: 'connected tools of their own: one whose command is gone, one already called "agentbox" (the name the app gives its store), and a project .mcp.json with every project server switched on',
    userJson: () => ({
      mcpServers: {
        'gone-server': { type: 'stdio', command: '/nonexistent/mcp-server', args: [] },
        agentbox: { type: 'stdio', command: '/nonexistent/old-agentbox-mcp', args: [] },
      },
    }),
    settings: () => ({ enableAllProjectMcpServers: true }),
    repo: { '.mcp.json': `${JSON.stringify({ mcpServers: { 'project-tool': { command: 'node', args: ['-e', 'setTimeout(()=>{},60000)'] } } }, null, 1)}\n` },
    expect: NORMAL,
  },
  {
    name: 'plan-mode-by-default',
    why: 'defaultMode "plan" in their settings, which some people set so Claude Code never edits without asking',
    settings: () => ({ permissions: { defaultMode: 'plan' } }),
    expect: NORMAL,
  },
  {
    name: 'strict-permissions',
    why: 'a tight allow-and-deny list of their own, with every MCP tool and the web denied',
    settings: () => ({ permissions: { allow: ['Read', 'Grep', 'Glob'], deny: ['WebFetch', 'WebSearch', 'Bash(curl:*)', 'mcp__gone-server'] } }),
    expect: NORMAL,
  },
  {
    name: 'api-key-in-settings',
    why: 'an API key left in ~/.claude/settings.json from an old project: Claude Code uses it, so a worker would bill that key instead of the person\'s plan',
    settings: () => ({ env: { ANTHROPIC_API_KEY: 'sk-ant-api03-verify-not-a-real-key' } }),
    expect: NORMAL,
    // Claude Code reads this one out of the settings file itself, past the
    // environment scrub. Found by this setup on its first run and fixed by the
    // blank in every worker's --settings (NO_METERED_KEY, main/harnesses/claude.mjs).
  },
  {
    name: 'api-key-in-project',
    why: 'the same key committed in the project\'s .claude/settings.json, which a teammate never chose (an open problem found in past tasks)',
    repo: { '.claude/settings.json': `${JSON.stringify({ env: { ANTHROPIC_API_KEY: 'sk-ant-api03-verify-not-a-real-key' } }, null, 1)}\n` },
    expect: NORMAL,
  },
  // NOT A SETUP: a settings file Claude Code rejects. Measured 2026-10-15 on
  // 2.1.301, `cleanupPeriodDays: 0` fails validation and Claude Code drops the
  // whole file, which here takes the stand-in model's address with it, so the
  // run reads as "could not sign in". On a real Mac the login is in the
  // keychain and the task would run with the person's settings silently off.
  // The stand-in cannot tell those apart, so it is left out rather than faked.
  {
    name: 'heavy-instructions',
    why: 'a long personal CLAUDE.md, an output style, a status line and a model of their own',
    settings: () => ({ outputStyle: 'Explanatory', model: 'opus', statusLine: { type: 'command', command: 'echo my-status' }, includeCoAuthoredBy: false }),
    home: { '.claude/CLAUDE.md': `# My rules\n\n${'- Always explain your reasoning in detail before acting.\n'.repeat(2000)}` },
    repo: { 'CLAUDE.md': '# Project rules\n\nRun the tests before you answer.\n' },
    expect: NORMAL,
  },
  {
    name: 'config-dir-from-zshrc',
    why: 'CLAUDE_CONFIG_DIR exported in .zshrc, so the only login is in ~/.config/claude and there is no ~/.claude at all',
    login: ['.config/claude'],
    home: { '.zshrc': 'export CLAUDE_CONFIG_DIR="$HOME/.config/claude"\n' },
    expect: NORMAL,
    // Found by this setup on its first run: workers ran on an empty ~/.claude.
    // Fixed in main/account-discovery.mjs (effectiveProfiles reads the shell's folder).
  },
];

/** The fake accounts each login holds, so main/account-discovery.mjs sees two subscriptions, not one. */
const account = (i) => ({ oauthAccount: { emailAddress: `setup-${i}@verify.invalid`, accountUuid: `verify-setup-account-${i}` } });

/**
 * LAY A PERSON'S HOME OUT. `claude` is the real binary on this Mac; it is
 * linked in where Claude Code's own installer puts it, so the app finds it
 * the way it would on their Mac. `url` is the stand-in model. Returns the
 * login folders, absolute.
 */
export function layHome(setup, { home, url, claude, version = 'verify' }) {
  const write = (rel, text) => { const f = path.join(home, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
  const ctx = { home };
  // The installer: ~/.local/bin/claude -> ~/.local/share/claude/versions/<v>.
  const store = path.join(home, '.local', 'share', 'claude', 'versions');
  fs.mkdirSync(store, { recursive: true });
  fs.mkdirSync(path.join(home, '.local', 'bin'), { recursive: true });
  fs.symlinkSync(claude, path.join(store, version));
  fs.symlinkSync(path.join(store, version), path.join(home, '.local', 'bin', 'claude'));

  const logins = (setup.login ?? ['.claude']).map((d) => path.join(home, d));
  const own = setup.settings?.(ctx) ?? {};
  const userJson = setup.userJson?.(ctx) ?? {};
  logins.forEach((dir, i) => {
    fs.mkdirSync(dir, { recursive: true });
    const settings = { ...own, env: { ...(own.env ?? {}), ANTHROPIC_BASE_URL: url, ...stubClaudeSettings(url).env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' } };
    fs.writeFileSync(path.join(dir, 'settings.json'), `${JSON.stringify(settings, null, 1)}\n`);
    const json = { ...account(i + 1), hasCompletedOnboarding: true, ...userJson };
    fs.writeFileSync(path.join(dir, '.claude.json'), `${JSON.stringify(json, null, 1)}\n`);
    // With no CLAUDE_CONFIG_DIR, Claude Code reads ~/.claude.json beside the folder.
    if (dir === path.join(home, '.claude')) fs.writeFileSync(path.join(home, '.claude.json'), `${JSON.stringify(json, null, 1)}\n`);
  });
  for (const [rel, text] of Object.entries(setup.home ?? {})) write(rel, text);
  return logins;
}

/** The project's committed files for this setup, written before the seed commit. */
export function layRepo(setup, repo) {
  for (const [rel, text] of Object.entries(setup.repo ?? {})) {
    const f = path.join(repo, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
  }
}

export const setupNamed = (name) => SETUPS.find((s) => s.name === name) ?? null;
