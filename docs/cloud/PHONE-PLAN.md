# The phone with the Mac closed: the plan

Status: draft, 2026-10-14, revised after Codex's review (14 findings, below). Not built.

## What she asked for

"The feature we really, really want is to have your computer closed while you
access everything on mobile." And on 2026-10-14: "this doesn't need to apply
to everyone, you don't need to sign in or use cloud to use agentbox. in fact
cloud is the premium version (you have to pay). not sure if mobile use
requires payment tho."

So: opt-in. Agentbox with no account stays exactly what it is. Someone who
turns the cloud on gets an account, their inbox online, and a phone that works
with the Mac shut.

## What exists to build on (mapped 2026-10-14)

- **Accounts and a hosted database**, from the team version: Supabase (Postgres,
  Auth, Realtime), Google or email sign-in (main/team/sign-in.mjs, session.mjs),
  row-level security on every table, and a two-way sync of a project's ledger
  lines (`lines`, main/team/sync.mjs: push by byte offset, pull by `seq`, every
  5 s and on Realtime). A work item online is exactly its ledger lines, and the
  browser-safe `foldWorkItems` rebuilds rows from them anywhere.
- **The phone screen**: the app's own renderer with a phone layout
  (renderer/src/phone.css, browser-bridge.ts), today served BY the Mac over
  Wi-Fi, Tailscale or a Cloudflare relay (main/phone-link.mjs, relay/). Dead
  when the Mac sleeps (`MAC_AWAY`).
- **Cloud runs** (docs/cloud/PLAN.md): every run is proxied by a process on the
  Mac, which also serves the agent's store tools and approvals.

What is missing: a per-person (not per-team) online inbox; a phone that talks
to it instead of to the Mac; something in the cloud that acts on a reply while
the Mac is shut; the agent's own tools and approvals reachable from the cloud;
billing.

## The shape

The online inbox becomes the meeting point. The Mac, the cloud runs and the
phone all read and write the same ledger lines; none needs the others awake.

```
 phone  ─┐                       ┌─ the Mac (syncs, runs threads locally)
         ├──  online inbox  ─────┤
 cloud ──┘    (Supabase lines)   └─ the dispatcher (starts cloud runs)
```

## Phases, each one shippable (revised after Codex's review)

The team sync cannot simply be pointed at one person: it throws away your own
lines coming back from another device (finding 1), its `seq` cursor can skip a
line two writers commit out of order (2), the fold settles equal-time edits by
arrival order (3), and its security is built around teams (4). Phase 1
therefore does not sync ledgers both ways at all.

**1. Read and reply from the phone, Mac shut (the first slice).**
- One project at a time, chosen by her, and one Mac that runs it.
- The Mac PUBLISHES each thread's readable state (title, status, result,
  the conversation so far, attachments it names) to an owner-only table: a
  snapshot, written only by that Mac. The phone reads snapshots; it never
  folds raw ledger lines (finding 5).
- The phone WRITES only to a small command inbox: reply, start a thread,
  snooze, close, each with its own id. The Mac takes each command through the
  existing reply path, writes it into the ledger itself, and marks it taken.
  Until then the phone shows "Waiting for your Mac" on it (findings 6, 7).
- Separate personal tables with owner-only security, tested for owner,
  stranger, teammate and removed member (finding 4).
- Sign-in on the phone: the same Supabase account, through a browser sign-in
  of its own (not the desktop's loopback), and the app's sign-in is never a
  gate: "cloud available" and "signed in" are separate (finding 12).
- The phone screen is the renderer's components with a phone bridge that does
  only what is listed here (finding 13). No push yet (finding 14).
- What she gets: every result and conversation readable anywhere, and replies
  queued from bed. Work continues when the Mac wakes.

**2. Work continues with the Mac shut.**
- A cloud controller: an always-on service that owns a cloud run end to end
  (inputs, acknowledgements, the agent's tools, results), takes commands from
  the inbox, and survives its own restart (finding 8).
- Per-owner mapping to her runtime, her cloud accounts and her storage, with
  quotas; no AWS or vendor credential ever readable by a browser (finding 9).
- A durable checkpoint per thread (code, uncommitted work, transcript) kept
  as long as the thread lives, and the Mac importing it in order when it
  wakes (finding 10).
- Approvals as signed requests the phone answers, or only threads that need
  none run this way (finding 11).
- One executor per thread, then a server-side lease (finding 6).

**3. Push alerts and live progress.**
- Notify on a thread newly needing her, deduplicated, never for backfill
  (finding 14). Live progress lines like today's thread cards.

## Payment (decided 2026-10-14)

"I feel like phone access should be free for everyone. What we charge for is
using your agents in the cloud (ie., more slots or with computer closed)."
So step 1 and step 3 are free with a signed-in account; step 2's cloud work is
the paid cloud. All three steps are to be built.

## Risks

- Private projects' text moves to our database for those who opt in: the
  privacy and terms pages change in the same release; per-person encryption at
  rest is worth weighing (it would stop the dispatcher reading briefs).
- Two writers (Mac and phone) on one thread: the ledger is append-only and the
  fold already merges lines by time and source, as the team version does.
- The dispatcher and the Mac must not both start the same reply: a claim line,
  taken first-writer-wins in Postgres, decides.
- Supabase cost at scale; Realtime connection limits for many phones.
