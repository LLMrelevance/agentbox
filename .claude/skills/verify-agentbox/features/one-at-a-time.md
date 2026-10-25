# One thing at a time

The person answers Needs you as a queue: each thread opens on its own page, the
answer moves them to the next, and the last answer lands them on the empty inbox.

## Sub-features

- `way-in` Space on Needs you, or the One at a time button beside search, opens the top thread.
- `page` the short title in the top bar, the place in the queue and two arrows beside the menu; Context and your last message on top; the newest answer under its headline; the choices at the foot, apart from the reply box.
- `moves-on` a pick, a typed reply or E moves to the next thread, and the answer reaches that thread's agent.
- `walks` J and K, and the arrows, step through the queue without answering.
- `earlier` Show N earlier messages opens the whole conversation in place, the agent's steps included.
- `leaves` esc goes back to Needs you; the last answer lands on the empty inbox.
- `files` a page or a note the answer names is read in place under it (the Mac app only: the browser copy gives a page no address to frame).

## How to get to it (user POV)

- On Needs you, press Space, or click One at a time.
- Enter on a row still opens the whole thread page, as before.

## Driving it with live.mjs

Preconditions: a clean `live.mjs doctor` on a fresh copy (`down`, then `up`), so Needs you holds only the drive's threads.

- **Run it.** `live.mjs drive one-at-a-time`. It files four threads, has the stand-in answer each with choices, then holds replies for two minutes so the queue can be emptied.
- **Checks.** Every sub-feature above but `files`, on the screen and in the ledger: the pick, the typed reply and the close are on their threads, and a pick starts the stand-in again.
- **Proof.** `01-needs-you.png` to `06-empty.png`, `report.json`.

## Gotchas

- The first E on a thread whose agent is waiting says so once and needs a second E (renderer/src/stopped-agent.ts). The drive presses it again when it sees the warning.
- A number pressed the moment the app moves you waits about a second (renderer/src/pick-settles.ts), so the drive waits before each pick.
