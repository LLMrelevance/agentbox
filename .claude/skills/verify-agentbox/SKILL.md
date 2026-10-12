---
name: verify-agentbox
description: Prove an Agentbox change works the way a person meets it, before it ships. Runs the app's own tool-finding and worker setup on fake Macs unlike this one (other install methods, shells, PATHs), reads this Mac for real, and drives a throwaway copy of the app by keyboard in headless Chrome (inbox, new thread, reply). Use before shipping anything under main/, shared/, renderer/ or bin/, when a bug might depend on someone's machine, or when asked to verify, QA, or "check it really works".
---

# Verify Agentbox

The unit tests run on the Mac the code was written on, so they cannot see the
bugs that only exist on somebody else's: Codex installed with npm under a
lazy nvm, a bash user, a home folder with a space, `CODEX_HOME` set only in
`.zshrc`, an app opened from the Dock with launchd's four-folder PATH. Most of
what reached people was that kind. This skill is the check for it, plus a live
drive of the app itself.

Three layers, one command:

```sh
node .claude/skills/verify-agentbox/scripts/verify.mjs          # the layers this branch needs
node .claude/skills/verify-agentbox/scripts/verify.mjs --all    # every layer
```

| layer | what it proves | time |
|---|---|---|
| `this-machine` | what the app finds on THIS Mac, opened from the Dock, and that a worker can start it | ~2 s |
| `machines` | the same, through the app's own modules, on 17 fake Macs (`scripts/machines.mjs`) | ~35 s |
| `live` | a throwaway copy of the app, driven by keyboard: inbox, new thread, reply | ~40 s |

`verify.mjs` reads `git diff origin/main...HEAD` plus uncommitted files and
skips a layer a change cannot affect (docs, tests and scripts never get the
live drive). It prints what it ran and why, and exits 0 only when every layer
that ran held. Known gaps (below) print `KNOWN` and do not fail it.

Unit tests are not repeated here: `npm run test:changed`, `npm run ship`, the
push hook and CI already run them.

## Launch

The live layer runs `bin/agentbox.mjs`, the browser copy of the app: the same
store, supervisor, IPC handlers and renderer as the desktop, no Electron. It is
the only way to run a second Agentbox on a Mac without touching the one being
used.

```sh
L=.claude/skills/verify-agentbox/scripts/live.mjs
node $L up                 # stand-in worker, nothing billed
node $L up --real-claude   # the Claude Code this Mac has, on its subscription
```

`up` builds the screen if `renderer/dist` is older than `renderer/src`, makes
`/tmp/agentbox-verify/instances/<checkout hash>/` with its own store, a
`Sandbox` project backed by a real git repo, and a `zero.config.json`, then
starts the copy detached and waits for it to print its address. Ready means it
printed `up: http://127.0.0.1:<port>/?token=…`.

What makes it safe to run beside a real Agentbox, and why each is there:

- **Its own store, port and account** (`verify-account`), all under the
  instance folder.
- **The fresh-user flag** (`AGENTBOX_FRESH_USER=1`): no team cloud even on a
  Mac that has a team key, so no sign-in wall and nothing written to the shared
  project, and analytics go under the one id that names itself as not a person.
- **A clean environment.** Run from inside an Agentbox worker, this script
  inherits `ZERO_ITEM`, `STORE_*` and friends; passed through, the copy's own
  workers would write to the real thread. `cleanEnv` strips every `ZERO_`,
  `STORE_`, `AGENTBOX_`, `ASTRAL_`, `ANTHROPIC_`, `CLAUDE_CODE_`, `OPENAI_` and
  `CODEX_` variable.
- **One instance per checkout**, so two agents verifying two branches on one
  Mac never drive each other's copy.

The default worker is `scripts/lib/stub-claude-worker.mjs`: everything on
Agentbox's side of the spawn is real (argv, environment, worktree, store
writes, approvals channel) and the model is not. `--real-claude` lets the app
find Claude Code the way a new user's copy would and runs it for real; it
writes a session under the Claude config folder like any run, so use it for
the final pre-deploy proof, not every iteration.

## Doctor

```sh
node $L doctor
```

Read-only. Checks the process is up and is OUR copy (its command line names
our data folder), the address answers with the screen, the built screen is not
older than its source, the stand-in is executable, and the copy's log has no
errors. Run it before the first drive, and again after any drive that failed
or surprised you. `drive` refuses to start when doctor finds anything.

## Drive

```sh
node $L drives                 # list them
node $L drive inbox-opens
node $L drive new-thread
node $L drive reply            # needs an answered thread: run new-thread first
```

Each drive is in `scripts/drives.mjs` and maps to a file in `features/`. A
drive presses what a person presses, using the app's own shortcuts as handles
(N new thread, ⌘↵ send, R reply), because they survive a redesign that moves
every button. Then it checks two things: what is on screen, and what the app
wrote to disk (the ledger at
`<store>/projects/<project folder, non-alphanumerics as ->/work-items.jsonl`,
session logs beside it, and the stand-in's receipt of the exact argv and
environment it was handed).

To add a drive: add an entry to `DRIVES` in `scripts/drives.mjs` with `what`
and `run({ tab, state, claim, capture })`, add its feature file, and add it to
`DRIVE_ORDER` in `verify.mjs` if it belongs in the pre-deploy run. `tab` is
`scripts/cdp.mjs`: `press(key, mods)`, `type(text)`, `until(expr)`,
`evaluate(expr)`, `capture(file)`, `text()`.

## Machines

```sh
node .claude/skills/verify-agentbox/scripts/check-machines.mjs [shape ...] [--keep]
node .claude/skills/verify-agentbox/scripts/check-this-machine.mjs [--json]
```

`check-machines` lays each shape in `scripts/machines.mjs` out under a fake
HOME and a fake `/` (so this Mac's own `/opt/homebrew` cannot answer for a Mac
that has none), then runs the app's real `recoverShellPath`,
`readShellDataDirs`, `findClaudeBin`, `findCodexBin` and each harness's
`workerEnv`/`launchEnv`, and really spawns what it found with `--version`
under the worker's environment. A native install is a `/bin/sh` stub and an
npm install a `#!/usr/bin/env node` stub, which is the difference several
shapes exist to test.

To add a shape, add an entry to `SHAPES` with `why` (the bug class) and
`expect` (what a person on that Mac needs, not what the code happens to do).
A bug report that turns out to be about someone's machine should become a
shape before it is fixed.

`check-this-machine` is the one to ask teammates to run. It reads their real
Mac the same way, prints paths with `~`, writes nothing but its report, sends
nothing anywhere, and its output is safe to paste into a thread. It shows when
the app and their terminal disagree about which `claude` or `codex` they have.

## Evidence

Everything lands in `/tmp/agentbox-verify/runs/<timestamp>-<what>/`:
`machines.json`, `this-machine.json`, and per drive numbered screenshots
(1440×900 at 2×, dark) plus `report.json` with every claim, its evidence and
any page errors. `verify.mjs` puts all of a run's layers in one folder and
prints it. Cleanup never touches this folder.

Proof standards:

- Drive the real path (keys and clicks into the real bridge), never an
  internal setter or a test-only endpoint.
- Capture the action and the state it produced, not just the final screen.
- Check the side effect on disk next to what is visible.
- The stand-in is a stand-in. A claim about Claude Code's own behaviour (for
  example that a reply resumes the same session) needs `--real-claude`; the
  `reply` drive only checks memory in that mode.
- To show a picture to the person you work for, copy it into the product's
  docs folder under `designs/<task id>/`, not from `/tmp`.

## Cleanup

```sh
node $L down
```

Stops the process group `up` started, then kills anything still running out
of the instance folder (a worker the group missed), and deletes the instance
folder. It never kills by process name and never touches `runs/`. Headless
Chromes go through `scripts/lib/chrome-guard.mjs`, which cleans them on every
exit and reaps orphans from earlier runs. `verify.mjs` always runs `down`,
even when a drive fails.

## Known gaps

A claim or shape with `known` set is a product bug filed on its own thread.
It still runs; it prints `KNOWN`, does not fail the run, and prints a reminder
when it starts holding so the marker can come off.

- `new-thread`: a thread you type yourself says "An agent opened this" when
  nobody is signed in (w-f73f5e8e15).
- `claude-old-npm-under-nvm-lazy`: an npm Claude Code from before the native
  binary is a node script, and Claude workers get no node on PATH (Codex
  workers do) (w-c36e160ac1).

## Not covered yet

Listed so nobody reads a green run as proof of these:

- The Electron shell itself (dock, menus, notifications, auto-update). The
  live layer is the browser copy.
- Codex as the worker (`scripts/lib/codex-stub-model.mjs` can stand in for the
  model; no drive uses it yet).
- The team version signed in (needs a test account on the team cloud).
- Shipping (`ship` label to `npm run ship`), approvals cards, scheduling.
- Linux machines (`check-machines` is Mac shapes only; the app supports Linux).

## Keeping it honest

`.claude/skills/maintain-verify-agentbox/` is the upkeep pass: it re-reads
each feature from source, drives every feature live, and fixes the map and
harness when the app has moved. Run it after a change that moves a user path
(a shortcut, a screen, how a worker is spawned), and otherwise about weekly.

Adapted from Cursor's `create-verification-skill`
(https://github.com/cursor/plugins/tree/main/pstack/skills/create-verification-skill).
