// A CODEX WORKER LEFT ITS SANDBOX AND NOBODY WAS ASKED (w-36c51443df).
//
// MEASURED, NOT REASONED. 2026-10-09 on codex-cli 0.160.0, a real
// `codex app-server` on her own `~/.codex`, driven through this repo's own
// `createCodexAppServer` and `createCodexWorker`. Run
// `node scripts/qa-codex-live.mjs approvals default home` to repeat it.
//
//   thread/start with `workerThreadParams({ cwd })` -- the shipped default
//   posture, on-request + workspace-write, no reviewer named -- and a prompt
//   asking for `echo ESCAPED > ~/.qa-codex-escape-probe`:
//
//     the worker's shell ran, exit 0
//     the probe file appeared in the HOME DIRECTORY on disk, reading ESCAPED
//     onApproval was NEVER CALLED. Cards raised: 0.
//     the raw wire carried NO server request at all.
//
//   The same prompt and the same posture with ONE field added,
//   `approvalsReviewer: 'user'`:
//
//     << item/commandExecution/requestApproval, reason "The sandbox blocked
//        this write outside the workspace. Do you approve..."
//     >> { "decision": "accept" }
//
// SO THE ESCALATION IS REAL AND THE CARD IS REACHABLE; it was being answered by
// somebody else. `~/.codex/config.toml` line 6 is
// `approvals_reviewer = "auto_review"`, a TOP-LEVEL key, and the schema says
// what that means: ApprovalsReviewer "configures who approval requests are
// routed to for review. Examples include sandbox escapes, blocked network
// access... Defaults to `user`. `auto_review` uses a carefully prompted
// subagent to... approve or deny the request."
//
// `workerThreadParams` overrides `mcp_servers`, `projects` and `features`. It
// does not override this one, so whoever owns the Codex home decides whether a
// worker may leave its sandbox, and the person holding the app is never shown
// the question.
//
// WHAT THESE TESTS ARE. They are TRIPWIRES on the shape of the decision, not a
// blessing of it. The fix is a product decision about what the person sees, so
// it is filed rather than taken here. Each test below names the fact it pins
// and fails the moment that fact changes -- which is exactly when somebody
// should be reading this file.
import { describe, expect, it } from 'vitest';
import { CODEX_DEFAULT_MODE, CODEX_MODES, codexPosture } from '../shared/codex-modes.mjs';
import { workerThreadParams, WORKER_APPROVAL_POLICY, WORKER_SANDBOX } from '../main/codex-session.mjs';
import { APPROVAL_DECISIONS, ELICITATION_ACTIONS } from '../main/codex-app-server.mjs';

/**
 * The three values `approvalsReviewer` takes, read off
 * `codex app-server generate-json-schema` on codex-cli 0.160.0, 2026-10-09.
 * `user` is the protocol's own default and the only one that reaches a person.
 */
const REVIEWERS = ['user', 'auto_review', 'guardian_subagent'];
const TO_A_PERSON = 'user';

describe('the posture a Codex worker is started in', () => {
  const cwd = '/tmp/some-task-folder';

  it('asks the sandbox to refuse and leaves the asking switched on', () => {
    // Both halves matter. `workspace-write` is the wall; `on-request` is what
    // makes an escalation a QUESTION rather than a plain failure. Neither moved
    // between 0.148.0 and 0.160.0.
    expect(WORKER_SANDBOX).toBe('workspace-write');
    expect(WORKER_APPROVAL_POLICY).toBe('on-request');
    const params = workerThreadParams({ cwd });
    expect(params.sandbox).toBe('workspace-write');
    expect(params.approvalPolicy).toBe('on-request');
  });

  it('names nobody to answer those asks, so her own Codex config decides', () => {
    // THIS IS THE DEFECT, PINNED. With no reviewer in `thread/start`, the value
    // comes from `approvals_reviewer` in whichever CODEX_HOME the run bills --
    // which on this Mac is `auto_review`, and which Agentbox neither reads nor
    // shows. When this line starts failing, the fix has landed: delete the test
    // and keep the one below it.
    const params = workerThreadParams({ cwd });
    expect(params.approvalsReviewer).toBeUndefined();
  });

  it('would route the question to her if it named the protocol default', () => {
    // The whole of the fix, so that the one field and the one value are written
    // down next to the measurement that proved they work.
    const fixed = { ...workerThreadParams({ cwd }), approvalsReviewer: TO_A_PERSON };
    expect(REVIEWERS).toContain(fixed.approvalsReviewer);
    expect(fixed.approvalsReviewer).toBe('user');
  });
});

describe('the mode she picks, and what it promises her', () => {
  it('starts on a mode that routes every ask away from her', () => {
    // Not an oversight: `auto` sets this deliberately (w-ca48e69535) so that a
    // second login with no config behaves like the first. The cost was never
    // written down, and it is this: on the default mode NO approval card can
    // ever reach her, because a subagent answers first.
    expect(CODEX_DEFAULT_MODE).toBe('auto');
    expect(codexPosture('auto').approvalsReviewer).toBe('auto_review');
    expect(codexPosture('auto').approvalsReviewer).not.toBe(TO_A_PERSON);
  });

  it('is the only one of the three that names a reviewer at all', () => {
    // read-only and full-access name none, so they fall through to her config
    // exactly as the default posture does. One screen, three rows, three
    // different answers to "who gets asked", and none of them says so.
    expect(codexPosture('read-only').approvalsReviewer).toBeUndefined();
    expect(codexPosture('full-access').approvalsReviewer).toBeUndefined();
    expect(codexPosture('full-access').approvalPolicy).toBe('never');
  });

  it('tells her on screen that it asks, which is not what it does', () => {
    // THE SENTENCE IS THE PRODUCT AND IT IS NOT TRUE. Pinned as text so that a
    // fix to the behaviour and a fix to the words cannot drift apart: whichever
    // lands first, this fails and the other one gets written.
    expect(CODEX_MODES.auto.what).toBe('Works inside the project folder. Asks before going outside it or onto the network.');
    expect(CODEX_MODES.auto.what).toMatch(/asks/i);
    // And nothing on that row says WHO it asks.
    expect(CODEX_MODES.auto.what).not.toMatch(/you|review/i);
  });
});

describe('the card, once it does reach her', () => {
  // Every one of these was exercised live on 2026-10-09 with
  // `approvalsReviewer: 'user'` and three real escalations in one turn:
  // accept ran the command (exit 0), decline left it unrun and the turn
  // carried on, and a card left unanswered was declined ONCE at its deadline
  // with the turn still carrying on. `client.stats()` ended
  // `{ pending: 0, threads: 0, approvals: 0 }` -- nothing leaked.
  it('takes the four words Codex accepts for a command, and no others', () => {
    expect(APPROVAL_DECISIONS).toEqual(['accept', 'acceptForSession', 'decline', 'cancel']);
    expect(APPROVAL_DECISIONS).not.toContain('abort');
    expect(APPROVAL_DECISIONS).not.toContain('approve');
  });

  it('takes a shorter list for an elicitation, which is not a subset by accident', () => {
    expect(ELICITATION_ACTIONS).toEqual(['accept', 'decline', 'cancel']);
    expect(ELICITATION_ACTIONS).not.toContain('acceptForSession');
  });
});
