// A COMMAND ITS OWN RECORD CALLS HEAVY IS NEVER LIGHT — w-0af52d5c86.
//
// WHAT BROKE. The row asked whether two heavy slots is too few on a 16 GB Mac,
// given eight agents queueing and commands refused after twenty minutes. The
// measurement said the slot count was close to beside the point: the commands
// that actually eat gigabytes were not going through the slots at all.
//
// Measured on the founder's 16 GB M4 on 2026-10-08, by replaying 9,104 real
// Bash commands from three days of transcripts through the real classifier
// loaded with that Mac's real learned history: of 322 commands whose OWN
// whole-command record had been measured heavy at least once, 66 (20.6%)
// classified LIGHT. Light needs no slot, is admitted even while pressure is
// `tight`, and is bounded only by `lightLane`, so eight of them could run at
// once. Eight test suites at about 1.2 GB each is a better account of the
// 10.6 GB swap storm of 2026-10-04 than two slots of 1.5 GB is.
//
// THE CASE, exactly as it stood:
//     command    npx vitest run tests/a-row-....test.mjs 2>&1 | tail -30
//     chain key  "npx vitest && tail"   record hmllllmmlm   last five lmmlm
//     segments   npx vitest=llllllllll   tail=llllllllll
//     verdict    light
// One run measured at or above 400 MB and three between 150 and 400 MB, and the
// gate called it light, because `classify` read the chain record only for an
// 'h' among the last FIVE while the segment records it then fell through to
// said light.
//
// WHY THOSE SEGMENT RECORDS SAID LIGHT. `record` files a chain's observation
// under the chain key and returns early unless it was light, so a segment or
// program record is fed a light-only sample of every chain it ever appears in.
// That early return is right on its own terms — `git status && npm test`
// measured heavy says nothing bad about `git status` — but agents here nearly
// always run tests as a chain, so `npx vitest` collected the light runs and
// never the heavy ones. That drift is its own row; this one stops the drift
// from deciding the verdict.
//
// WHAT THIS PINS: a command's own record outranks the records of its parts. If
// its own last ten runs include one measured heavy, it is heavy, whatever its
// parts look like.
//
// Chosen over three wider variants by measuring each on the same corpus. All of
// them closed all 66 escapes; this one moved the fewest commands out of light
// (66, or 0.7% of traffic) and left every command that must stay light alone.
//
// WHAT THIS DOES NOT SETTLE, from Codex's review of it. The key is coarser than
// the command — `program firstArg`, so a full suite and a single test file are
// both `npx vitest` — so an old heavy run holds back the cheap variants that
// share the key. On this Mac's own history that costs one key of the 86 the old
// rule had settled as light, and that one is `npm run`. And none of this says
// two slots is the right number: a transcript's only duration is waiting and
// running added together, so the row's real question needs the per-grant log
// that landed beside this, read while pressure is normal.

import { describe, it, expect } from 'vitest';
import { CommandHistory } from '../main/memory-gate-history.mjs';

/** A history whose records are exactly these letters. A key with a space is a
 *  command key (a chain key included); a bare word is a program record. */
function withRecords(records) {
  const h = new CommandHistory();
  for (const [key, obs] of Object.entries(records)) {
    (key.includes(' ') ? h.keys : h.programs).set(key, obs.split(''));
  }
  return h;
}

describe('a command its own record calls heavy is never light', () => {
  it('calls the measured test suite heavy, though both its parts are learned light', () => {
    // The case from the Mac, letter for letter.
    const h = withRecords({
      'npx vitest && tail': 'hmllllmmlm',
      'npx vitest': 'llllllllll',
      tail: 'llllllllll',
      npx: 'llllllllll',
    });
    expect(h.classify('npx vitest run tests/a-row.test.mjs 2>&1 | tail -30')).toBe('heavy');
  });

  it('reaches an h at the very oldest of the ten runs it keeps', () => {
    const h = withRecords({
      'npx vitest && tail': 'hlllllllll',
      'npx vitest': 'llllllllll',
      tail: 'llllllllll',
      npx: 'llllllllll',
    });
    expect(h.classify('npx vitest run tests/a-row.test.mjs 2>&1 | tail -30')).toBe('heavy');
  });

  it('keeps a command measured middling out of the light lane, without calling it heavy', () => {
    // THE RESIDUAL, caught on the live record while this was being written. By
    // then the suite's chain record had aged on to `mllllmmlmm`: the heavy run
    // had fallen off and four runs between 150 and 400 MB were left. An 'h'
    // rule alone called that light again, and light is the lane where eight run
    // at once — up to 3.2 GB of middling work with nothing holding it back.
    //
    // `unknown` is the honest strength of answer rather than `heavy`: it needs
    // a slot to start, and `_holdsSlot` gives the slot up after `specWindowMs`
    // once something has measured the run small, so a suite that turns out
    // cheap today stops blocking anyone within ten seconds.
    const h = withRecords({
      'npx vitest && tail': 'mllllmmlmm',
      'npx vitest': 'llllllllll',
      tail: 'llllllllll',
      npx: 'llllllllll',
    });
    expect(h.classify('npx vitest run tests/a-row.test.mjs 2>&1 | tail -30')).toBe('unknown');
  });

  it('reaches a single middling run at the oldest of the ten', () => {
    const h = withRecords({
      'npx vitest && tail': 'mlllllllll',
      'npx vitest': 'llllllllll',
      tail: 'llllllllll',
      npx: 'llllllllll',
    });
    expect(h.classify('npx vitest run tests/a-row.test.mjs 2>&1 | tail -30')).toBe('unknown');
  });

  it('lets a command go once the heavy run has fallen off the ten it keeps', () => {
    // THE BOUNDARY ON THE OTHER SIDE. The record holds ten observations, so ten
    // light runs since is the evidence that whatever it was has changed. This is
    // the same patience the rest of the file has, not an exception to it.
    const h = withRecords({
      'npx vitest && tail': 'llllllllll',
      'npx vitest': 'llllllllll',
      tail: 'llllllllll',
      npx: 'llllllllll',
    });
    expect(h.classify('npx vitest run tests/a-row.test.mjs 2>&1 | tail -30')).toBe('light');
  });

  it('does not let a heavy chain condemn a part of it on its own', () => {
    // THE RULE THIS MUST NOT BREAK. `git status && npm test` measured heavy says
    // nothing bad about `git status`, and the own-record rule is about the whole
    // command, not about lending its verdict to the pieces.
    const h = withRecords({
      'git status && npm test': 'hhhhhhhhhh',
      'git status': 'llllllllll',
      'npm test': 'llllllllll',
      git: 'llllllllll',
      npm: 'llllllllll',
    });
    expect(h.classify('git status && npm test')).toBe('heavy');
    expect(h.classify('git status')).toBe('light');
    expect(h.classify('git status --porcelain')).toBe('light');
  });

  it('leaves a command nothing has ever measured big alone', () => {
    // 84% of what agents run is light and must stay light: the gate is worth
    // nothing if ordinary reading and searching queues behind a build.
    const h = withRecords({
      'git fetch && tail && git branch && head': 'llllllllll',
      'git fetch': 'llllllllll',
      'git branch': 'lllll?llll',
      tail: 'llllllllll',
      head: 'llllllllll',
      git: 'llllllllll',
    });
    expect(h.classify('git fetch -q origin | tail -2; git branch -r --contains abc | head -3')).toBe('light');
  });

  it('still reads an unmeasured run as nothing at all', () => {
    // w-b689e9fc0c. A `?` among the ten must not become a way back in for the
    // over-holding that row took out: it is the absence of evidence, and an
    // own-record rule that counted it would hold a command for using 0 MB.
    const h = withRecords({
      'npx vitest && tail': '??????????',
      'npx vitest': 'llllllllll',
      tail: 'llllllllll',
      npx: 'llllllllll',
    });
    expect(h.classify('npx vitest run tests/a-row.test.mjs 2>&1 | tail -30')).toBe('light');
  });

  it('holds a single-segment command its own record calls heavy', () => {
    // The same hole exists with no chain in sight: one command, one program,
    // its own record measured heavy nine runs ago and light since.
    const h = withRecords({ 'npm test': 'hlllllllll', npm: 'llllllllll' });
    expect(h.classify('npm test')).toBe('heavy');
  });
});
