// A CLOUD RUN SERVES THE APP'S TOOLS WITHOUT STARTING A PROCESS FOR EACH.
//
// What broke: she wants 50 to 100 agents at once in the cloud (2026-10-17).
// Measured on her Mac that day, each cloud run kept three processes on it, its
// relay and its own copies of the approvals and store servers, each a whole
// runtime (the approvals server alone 46 MB), so 100 runs would need about
// 12 GB of a 16 GB Mac.
//
// Now the relay serves the app's own two servers in its own process, one
// channel per connection: the approvals for that worker's row, the store with
// its own claims. Any other server is still started as configured.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { servedHere } from '../main/cloud/run.mjs';

let tmp;
const ACCOUNT = 'acct-test';
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tools-here-'));
  fs.mkdirSync(path.join(tmp, 'store', 'accounts', ACCOUNT), { recursive: true });
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

// Lines in, answers out, as a stub would carry them.
function talk(proc, lines) {
  return new Promise((resolve) => {
    const got = [];
    let buf = '';
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) { got.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); if (got.length === lines.length) resolve(got); }
    });
    for (const l of lines) proc.stdin.write(JSON.stringify(l) + '\n');
  });
}
const hello = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } };
const list = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} };

describe('the approvals channel', () => {
  it('answers in this process, for this worker', async () => {
    const proc = servedHere({ command: '/nowhere/scripts/approval-server.sh' }, { ZERO_APPROVALS_DIR: path.join(tmp, 'spool'), ZERO_ITEM: 'w-1' }, 'r-c1');
    expect(proc).toBeTruthy();
    expect(proc.pid).toBeUndefined();
    const [init, tools] = await talk(proc, [hello, list]);
    expect(init.result.serverInfo.name).toBe('zero-approvals');
    expect(tools.result.tools.map((t) => t.name)).toEqual(['approval_prompt']);
    // With no key it refuses at once rather than waiting for a card.
    const [call] = await talk(proc, [{ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'approval_prompt', arguments: { tool_name: 'Bash', input: { command: 'ls' } } } }]);
    expect(JSON.parse(call.result.content[0].text)).toMatchObject({ behavior: 'deny' });
    const closed = new Promise((r) => proc.on('close', r));
    proc.stdin.end();
    await closed;
  });
});

describe('the store', () => {
  it('answers in this process, each connection with its own claims', async () => {
    const env = { STORE_ACCOUNT_ID: ACCOUNT, AGENTBOX_HOME: path.join(tmp, 'store') };
    const a = servedHere({ command: '/nowhere/mcp/agentbox-mcp.sh', env }, env, 'r-c1');
    const b = servedHere({ command: '/nowhere/mcp/agentbox-mcp.sh', env }, env, 'r-c2');
    const [[, toolsA], [, toolsB]] = await Promise.all([talk(a, [hello, list]), talk(b, [hello, list])]);
    expect(toolsA.result.tools.map((t) => t.name)).toContain('claim_work_item');
    expect(toolsB.result.tools.length).toBe(toolsA.result.tools.length);
    for (const p of [a, b]) { const closed = new Promise((r) => p.on('close', r)); p.stdin.end(); await closed; }
  });
});

describe('any other server', () => {
  it('is started as configured', () => {
    expect(servedHere({ command: '/usr/local/bin/some-mcp' }, {}, 'r-c3')).toBe(null);
  });
});
