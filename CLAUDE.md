# agentbox: notes for agents working in this repo

agentbox is an inbox over a store on disk, on Linux and on macOS: work items
in, headless `claude -p` and Codex workers out, one per item. On Linux the
store is `$XDG_DATA_HOME/agentbox` (`~/.local/share/agentbox` when that
variable is unset), the shell is the one that exists, and the palette
chord is Ctrl+K. Installing a checkout on Linux puts `agentbox` on
`~/.local/bin` and writes the launcher entry at `$XDG_DATA_HOME/applications`
(`~/.local/share/applications` when unset). The entry runs `agentbox`, which
starts this checkout. The Mac app, the dmg, and the Darwin paths
stay. Read the code and git for the current state; this file only holds the
rules that are not obvious from them.

## Every change lands with tests, and you run all of them

- Write the test first and watch it fail, then fix.
- Cover the cases, not the case: the reported one, the boundary either side of
  it, and the case that must NOT match.
- Name the test file after the behaviour, as a sentence
  (`a-reply-moves-the-agent-row.test.mjs`), and open it with a comment saying
  what broke and how you measured it.
- Before you report, run the tests for what you changed: `npm run test:changed`
  (or `npm run test:changed <files>`). That is your own tests, every test that
  imports those files, and every test that reads one of them as text —
  `vitest related` alone misses that last kind, which is how three red tests
  once shipped and how a branch bounced five times. Do not run the whole suite
  by hand: several agents share one Mac, and the push hook and GitHub already
  do it (GitHub runs the whole suite on every push; the hook runs it when a
  change touches what every test depends on).

## Before you commit: trim comments, unslop, check the blast radius

The skills in `.claude/skills/` are for agents building this app, not part of
it. Three are habits on every change:

- `trim-comments` on the comments your change adds or edits. A comment keeps
  only the why the code cannot say. The story of the bug goes in the commit
  message and the test's opening comment. In 2026-10 the code was 43% comment
  lines, mostly dated incident stories; do not add more.
- `unslop` on what you write for a person: comments, commit messages, docs,
  CLAUDE.md, and your answer.
- `blast-radius` when a change touches `main/`, `shared/`, the store or how
  workers start.

`correct` (turn a repeated mistake into a check that fails) and `interrogate`
(Claude and Codex both review a diff) run when someone asks.

## NOTHING RETRIES FOR EVER, NOTHING WAITS FOR EVER, NOTHING FAILS IN SILENCE (2026-10-19)

One cloud thread's start died in under a second, every 15 seconds, 16,135
times over 30 hours, because its exit meant "try again, no attempt spent";
another run hung for good on an AWS call whose timeout only warned. Neither
said a word, and with the cloud on nothing else ran. Two tests now hold the
line, so build with them, not around them:

- Every run starts through `spawnWorker`, which asks `_heldFromStarting`, and
  every run's end is counted by `_noteHowTheRunStarted`: six starts in ten
  minutes that each ended before the agent began hold the thread and say so on
  its row (`tests/no-thread-is-started-over-and-over-without-a-word`). A new
  way to start or end a run goes through both.
- Every network call has a deadline that ends it
  (`tests/no-network-call-in-the-app-can-wait-forever`).

## SHIPPING IS ONE COMMAND: `npm run ship`

Several agents work this repository at once, so the order of operations is not
a matter of taste. Work on a branch `agentbox/<item id>` in a worktree, commit
there, and ship with `npm run ship`: it fetches, merges main if it moved, runs
the tests for what changed, and pushes, doing the whole lot again if somebody
pushed first. The pre-push hook still runs the suite and the public check; the
command is the order, not a way around the gates.

Local `main` only ever points at something that is on the public `main`. Moving
it onto a branch is refused (`scripts/hooks/reference-transaction`), because a
fast-forward writes no commit and so walked straight past the commit guards: on
2026-10-01 that left a commit living in the folder the app runs from and
nowhere else. That folder follows the public main on its own:
`git fetch origin && git merge --ff-only refs/remotes/origin/main`.

## WHO HAS TO LOOK BEFORE A CHANGE SHIPS (2026-10-17)

The person's time is the bottleneck, so `npm run ship` sets a risk tier from
the diff (`scripts/lib/risk-tier.mjs`): rules first, then the Decisions API for
what the rules leave open. The tier comes from the change, never from you.

- **low** ships on green tests alone: docs, tests, scripts, internal logic, a
  bug fix its test proves, a few words of copy that move nothing.
- **look** waits for the person to see it: anything on screen a designer could
  judge, including copy that wraps or changes a layout.
- **risky** waits for the person: the paths and lines listed in
  `risk-tier.mjs`, over 600 changed lines, or a classifier that was not sure.

Whether you ask before shipping is set by the person's own instructions, not
by this file. `scripts/risk-gate.json` says whether the gate holds anything
back: in `shadow` it only logs what it would have done (`npm run risk -- --log`);
in `live` it refuses look and risky without an approval.

- `npm run risk` previews the tier the rules give your branch.
- When the person says ship it, run `npm run ship:approved`, then add the
  label. The approval covers that commit; a new commit needs a new approval.
- If the gate holds a ship back, you are woken with its reasons: show the
  person and ask.
- "Undo it" is: revert your commits on your branch, merge origin/main, add
  `ship`.

## MAIN WAS REWRITTEN ON 2026-10-06

The public `main` was rewritten from its first commit to take two real account
ids out of a test, so every commit got a new id. A branch cut before that will
not merge ("refusing to merge unrelated histories"). Never force that merge with
`--allow-unrelated-histories`: it brings the ids back, and the public check
refuses any push that carries the old history. Carry your own commits across
instead, then ship as usual:
`git fetch origin && git rebase --onto refs/remotes/origin/main $(git merge-base HEAD 99b8b0e5b04fbbc976003851ebdbb7bb58c2bf89)`

## NO WORKER EVER DRIVES THE USER'S OWN BROWSER

Claude Code can attach a session to the browser a person is signed into with
`--chrome`. That flag must never appear in anything this app spawns, because
that browser is signed into every account its owner holds.
`tests/no-worker-drives-her-own-browser.test.mjs` fails if it ever does. A
browser an agent may drive has to carry nothing; the app's own pane on the
`persist:junk` partition is the only candidate. `--ide` is the user's to switch
on, never ours.

## Billing

Workers run on the user's own Claude or Codex subscription. Never pass an API
key into a worker's environment.

## A BUILD NEVER WRITES A TRACKED FILE (2026-10-07)

`npm run build` reads the installed Claude Code for the commands the reply box
offers and the models the picker draws. It used to write what it found over two
TRACKED files, and so every folder that had ever run the app reported itself
dirty for a version number and a date: `releaseTaskFolder` answered
"uncommitted" and never reclaimed a folder, `parkTaskFolder` committed nobody's
work, and a change card's diff carried two files nobody had touched.

The build now writes `shared/*.local.json`, which is gitignored. The committed
`shared/claude-*.generated.mjs` tables are still the floor, and `npm run
read:claude` is the one thing that updates them, so adopting a new reading is a
decision somebody makes rather than a side effect of a build. Every refusal is
unchanged: a build still stops, with the name in the error, when a command the
menu offers or an alias the picker offers has gone. If a build says the committed
table is behind, run `npm run read:claude` and commit the diff; do not reach for
the build.

## One-off harnesses go in `scripts/scratch/`

It is gitignored. A script that proves one change runs once; move it up into
`scripts/` only if something will run it again.

## Nothing personal is committed

This repository is public. Names of the people who use it, pasted
conversations, screenshots or recordings of real sessions, account ids, home
paths, keys and tokens stay out of it. Quoting feedback in a comment is fine
as long as it names nobody and carries nothing private. `scripts/check-before-public.mjs` runs before every push
to it and refuses one that carries any of them; `npm run check:public` audits
the whole tree.

## THE TEAM VERSION IS PART OF THIS REPOSITORY (2026-10-01)

The team version (shared projects, teammates, the Team page) used to live in a
separate private repository. It was merged in here with its history, so this
is the one app and the one source of truth. The plan is `docs/team/PLAN.md`.

- The team cloud's address and key, `cloud/team.config.json`, are never
  committed (it is ignored, and `tests/the-team-cloud-key-stays-out-of-the-repository`
  checks it). Machines that run the team version keep their own copy; without
  it the app is the single-person app. `cloud/team.config.example.json` shows
  the shape.
- A branch cut from the old private repository's history will not line up with
  this one: the merge rewrote those commits to take the key file out. Move it
  across with
  `git rebase --onto refs/remotes/origin/main $(git merge-base <branch> 5ff1b688195c90508ecb8abdc7355e028226e729) <branch>`,
  where that sha is the old team history's last commit.
- Keep team code in its own files (`main/team/`, `renderer/src/team/`,
  `shared/team-*.mjs`, `cloud/`, `tests/team-*.test.mjs`) where that is
  natural.
