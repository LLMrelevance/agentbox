# Cloud runs: the build

Status: draft, 2026-10-13, under review. This file is the handoff between
sessions building it. Keep it current: tick what landed, say what is next.

## What it is

A thread can run in a cloud sandbox instead of on this Mac. Two reasons, in the
order they matter:

1. **Overflow.** A 16 GB Mac runs two agents at once (`maxConcurrentSessions`,
   with the memory gate on). Every thread past that waits. With cloud runs on,
   a thread that would wait runs in the cloud instead, so how many run at once
   stops being the bottleneck.
2. **The lid closes.** A run that is already in the cloud keeps going while the
   Mac sleeps. Its result lands when the Mac wakes. (Starting NEW runs while
   the Mac sleeps needs a scheduler in the cloud; that is phase 2, below.)

## Settled decisions (do not reopen)

- AWS Bedrock AgentCore Runtime, us-east-1, in the user's own AWS account, paid
  by AWS credits. One microVM per run (2 vCPU / 8 GB ceiling, 8 h max).
- The agents run on the user's own Claude / Codex subscription, never an API
  key and never Bedrock pay-per-token. Claude Code takes a long-lived token from
  `claude setup-token` (Anthropic's own sign-in) in `CLAUDE_CODE_OAUTH_TOKEN`.
- Presets per harness combination; the first is Claude Code + Codex + git + Node.
- The cloud side is a plain remote computer. It starts a command, streams its
  output, and carries the app's tools through. It never learns what a harness
  or a tool is, so the next harness costs the cloud side nothing.
- A budget alarm that counts spend before credits exists before anything is
  built (done by the step 1 spike, `agentcore-sandboxes`).

## How it works

### One idea: the cloud run is a local process that happens to compute elsewhere

The supervisor already knows how to start a worker, read its stream-json,
settle it when it exits, resume it, and ship its branch. None of that changes.
For a cloud run the supervisor spawns `main/cloud/run.mjs` in place of `claude`
(or `codex`), with the SAME argv, env and cwd. That proxy:

1. Packs the task folder: `git bundle` of the branch (55 MB / 1 s for this
   repo), plus the Claude transcript if the run resumes one.
2. Uploads the pack to S3 and calls `InvokeAgentRuntime` with
   `{action:"start"}` on a session id derived from the run id. The sandbox
   unpacks into the SAME absolute path as the local task folder, so paths in
   the brief, `--resume` and transcripts are identical on both sides.
3. Opens an event stream (`{action:"events", since}` over SSE, at most 60 min
   per stream, reopened from the last sequence number) and writes every stdout
   line of the remote harness to its own stdout, byte for byte. The
   supervisor's parser cannot tell it from a local child.
4. Bridges every MCP server named in `--mcp-config` (the store server and the
   approvals channel). Inside the sandbox each server is replaced by a stub
   that forwards raw JSON-RPC lines out as events; the proxy feeds them to the
   REAL server, started on this Mac exactly as today, and sends the replies
   back with `{action:"rpc"}`. Store writes go through the one write path on
   the Mac, with real epochs; approvals use the existing signed spool
   unchanged.
5. When the harness exits, asks the sandbox to bundle the new commits
   (`git bundle <branch> ^<start>`) and the transcript to S3, fetches them into
   the task folder (fast-forward only), then exits with the remote exit code.
   Ship then runs exactly as it does for a local run.

If the Mac sleeps, the proxy freezes with it; the sandbox keeps running
(`/ping` answers `HealthyBusy`) and any store call simply waits for the Mac.
On wake the proxy reopens the stream from its last sequence number.

If the app restarts, the supervisor kills the proxy (not the remote run). A
small state file per task (`<task folder>/.agentbox-cloud.json`, ignored)
names the live remote session, and a new proxy for the same item re-attaches
to it instead of starting a second run.

### The sandbox

`cloud/sandbox/`: an arm64 image (Node 22, git, Claude Code, Codex) with one
small Node server on :8080 (`/ping`, `/invocations`). It holds at most one run,
keeps that run's event log on disk so a stream can be replayed from any
sequence number, checkpoints the branch to S3 after each new commit, and
answers `Healthy` only once its results are collected, so an idle session is
reaped after 15 minutes but a working or uncollected one is not.

### AWS setup, once

`scripts/cloud-setup.mjs`, run with an admin sign-in (`aws login`), creates or
updates, idempotently: the S3 bucket (lifecycle: delete run objects after 7
days), the ECR repository, a CodeBuild project that builds the image in AWS (no
local Docker), the runtime's execution role (S3 on its own bucket, ECR pull,
logs), the AgentCore runtime, and a narrow IAM user for the app (invoke and
stop on that one runtime, read/write on that one bucket). The app keeps that
user's key in the macOS keychain, so the 12-hour `aws login` is never what the
app runs on. Everything it made is written to the app's data folder, never to
git (the account id must not be committed).

### Choosing where a thread runs

- `cloudRuns: true` in the config turns it on; off by default, and the app is
  exactly today's app when off.
- A thread runs locally while a local slot is free. Past `maxConcurrentSessions`
  it runs in the cloud, up to `maxCloudSessions` (default 10). Cloud runs do not
  pass through the memory gate; the proxy is a ~50 MB process.
- Personal products and anything that needs this Mac (a product with no repo,
  a `--chrome` style tool, a local-only MCP server) stay local.
- A thread started in the cloud resumes in the cloud only if its sandbox is
  still alive; otherwise the reply runs wherever a slot is, carrying the
  transcript across.

### What the user sees

One line in the thread's state: "Running in the cloud". Nothing else changes.
(Needs screenshots and divergent options before it is built.)

## Phases

1. Spike: AgentCore measured for real (budget, image size, start time, 1 GB
   storage, subscription sign-in, 2 CPU build speed). Running as w-bad6fbae78.
2. The sandbox image and server, with unit tests on the server's protocol.
3. `scripts/cloud-setup.mjs`, run once against the real account.
4. The proxy (`main/cloud/run.mjs`): pack, start, stream, MCP bridge, collect,
   re-attach. Tested against an in-process stand-in of the sandbox server.
5. The supervisor's choice of local or cloud, the config, the state line.
6. End to end: a real thread of this repo runs in the cloud, asks for an
   approval, writes to the store, commits, and ships; then the same with the
   lid shut halfway (simulated by suspending the proxy).
7. Phase 2, filed separately: new runs while the Mac sleeps (a scheduler in
   the cloud), replies from the phone, and a managed version for people who do
   not have an AWS account.

## Open questions for review

- Codex sign-in in the sandbox: `codex login --with-access-token` exists; does
  a token like that refresh without invalidating the Mac's own copy?
- Untracked files a task needs (gitignored config) do not travel in a bundle.
- `npm ci` on every run is slow; cache node_modules per lockfile hash in S3?
- The privacy and terms pages say Agentbox sends nothing and hosts nothing.
  Running a task in the user's own AWS account changes what leaves the Mac, so
  both pages need editing in the same change.
