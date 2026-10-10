// SIX OF THE TEN THINGS CODEX CAN ASK US GET AN ERROR FRAME (w-36c51443df).
//
// MEASURED 2026-10-09. `codex app-server generate-json-schema` on codex-cli
// 0.160.0, then every `method` const in `ServerRequest.json` -- the schema's own
// list of what the server may send a client. Ten of them:
//
//   item/commandExecution/requestApproval      main/codex-app-server.mjs knows it
//   item/fileChange/requestApproval            knows it
//   item/permissions/requestApproval           knows it
//   mcpServer/elicitation/request              knows it
//   item/tool/requestUserInput                 ERROR FRAME
//   item/tool/call                             ERROR FRAME
//   account/chatgptAuthTokens/refresh          ERROR FRAME
//   attestation/generate                       ERROR FRAME
//   execCommandApproval                        ERROR FRAME (the v1 name)
//   applyPatchApproval                         ERROR FRAME (the v1 name)
//
// DENY BY DEFAULT IS THE RIGHT RULE AND THIS FILE DOES NOT ARGUE WITH IT. An
// approval shape nobody has measured must not be granted. But the rule is being
// applied to requests that are not approvals, and two of those are worth naming:
//
//   `item/tool/requestUserInput` is a tool asking the PERSON something. Refused,
//   so a worker that needs an answer gets an error rather than a card in the
//   inbox -- the one road by which a Codex worker could ever ask her a question
//   mid-run.
//
//   `account/chatgptAuthTokens/refresh` is the server asking the client to
//   refresh the login. Refused. If it is ever sent during a long run, the run
//   is on an expiring token with nothing able to renew it.
//
// NEITHER WAS SEEN LIVE, and this comment does not pretend otherwise: the
// campaign drove roughly twenty real turns on 2026-10-09 and the only server
// request that ever arrived was `item/commandExecution/requestApproval`. So
// this is a gap read off the schema, not a failure that was reproduced, and the
// tests below pin the gap rather than claim the consequence.
import { describe, expect, it } from 'vitest';
import { createCodexAppServer, REFUSAL_DECISION } from '../main/codex-app-server.mjs';
import { EventEmitter } from 'node:events';

/** Every `method` the 0.160.0 schema lets a server send a client. */
const EVERY_REQUEST = Object.freeze([
  'account/chatgptAuthTokens/refresh',
  'applyPatchApproval',
  'attestation/generate',
  'execCommandApproval',
  'item/commandExecution/requestApproval',
  'item/fileChange/requestApproval',
  'item/permissions/requestApproval',
  'item/tool/call',
  'item/tool/requestUserInput',
  'mcpServer/elicitation/request',
]);

/** The four this app can express an answer to. */
const UNDERSTOOD = Object.freeze([
  'item/commandExecution/requestApproval',
  'item/fileChange/requestApproval',
  'item/permissions/requestApproval',
  'mcpServer/elicitation/request',
]);

/** The handler is called off a promise, so let the microtasks drain first. */
const settle = () => new Promise((r) => setTimeout(r, 0));

/** A child process's face, so nothing here spawns anything. */
function fakeChild() {
  const child = new EventEmitter();
  child.written = [];
  child.stdin = { write: (text, cb) => { child.written.push(text); cb?.(); return true; }, end: () => {}, on: () => {} };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {};
  child.say = (msg) => child.stdout.emit('data', `${JSON.stringify(msg)}\n`);
  child.answers = () => child.written.map((t) => JSON.parse(t)).filter((m) => m.id !== undefined && m.method === undefined);
  return child;
}

/** One client, one thread, and a handler that would say yes to anything. */
function connected() {
  const child = fakeChild();
  const client = createCodexAppServer({ transport: child });
  const asked = [];
  client.watch('T', {
    onApproval: (method, params) => { asked.push({ method, params }); return 'accept'; },
  });
  return { child, client, asked };
}

describe('the requests this app understands', () => {
  for (const method of UNDERSTOOD) {
    it(`asks her about ${method}`, async () => {
      const { child, asked } = connected();
      child.say({ jsonrpc: '2.0', id: 1, method, params: { threadId: 'T' } });
      await settle();
      expect(asked.map((a) => a.method)).toEqual([method]);
    });
  }
});

describe('the requests it does not', () => {
  const unknown = EVERY_REQUEST.filter((m) => !UNDERSTOOD.includes(m));

  it('is six of the ten the schema allows', () => {
    expect(unknown).toHaveLength(6);
    expect(EVERY_REQUEST).toHaveLength(10);
  });

  for (const method of unknown) {
    it(`answers ${method} with an error and never asks her`, async () => {
      const { child, asked } = connected();
      child.say({ jsonrpc: '2.0', id: 7, method, params: { threadId: 'T' } });
      await settle();
      expect(asked).toEqual([]);                       // nobody was asked
      const [answer] = child.answers();
      expect(answer.id).toBe(7);
      expect(answer.error).toBeTruthy();               // an error frame, not a word
      expect(answer.result).toBeUndefined();
    });
  }

  it('refuses a request on a thread nobody is watching, rather than parking it', () => {
    // The right behaviour and worth keeping: there is nobody to ask, so the
    // turn hears no NOW instead of waiting out a fifteen-minute deadline.
    const child = fakeChild();
    createCodexAppServer({ transport: child });
    child.say({ jsonrpc: '2.0', id: 3, method: 'item/commandExecution/requestApproval', params: { threadId: 'NOBODY' } });
    const [answer] = child.answers();
    expect(answer.id).toBe(3);
    expect(answer.result?.decision).toBe(REFUSAL_DECISION);
    expect(REFUSAL_DECISION).toBe('decline');
  });
});
