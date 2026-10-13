#!/usr/bin/env node
// A STAND-IN FOR THE STORE'S MCP SERVER, RUN ON THE "MAC" IN A CLOUD-RUN TEST.
// It answers `tools/list` with two tools (one the cloud must never see) and
// `tools/call note` by appending to a file on the Mac, so a test can prove the
// call ran here, with the worker's own environment.
import fs from 'node:fs';

const log = process.env.FAKE_STORE_LOG;
let buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const msg = JSON.parse(buf.slice(0, i));
    buf = buf.slice(i + 1);
    if (msg.method === 'tools/list') {
      reply(msg.id, { tools: [{ name: 'note', inputSchema: {} }, { name: 'look_at_page', inputSchema: {} }] });
    } else if (msg.method === 'tools/call') {
      fs.appendFileSync(log, JSON.stringify({ name: msg.params.name, args: msg.params.arguments, item: process.env.ZERO_ITEM }) + '\n');
      reply(msg.id, { content: [{ type: 'text', text: `noted on the Mac for ${process.env.ZERO_ITEM}` }] });
    }
  }
});
function reply(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n'); }
