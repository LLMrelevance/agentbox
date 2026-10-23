// Neo is an alpha (w-e85fd9144f): it ships in everyone's app and must start
// for nobody who has not turned on its switch in Alpha features (before
// w-09835f4874, a hand-made `neo-alpha` file). And it pays OpenAI with a key from the Keychain,
// which must never reach process.env (every worker inherits that, and workers
// run on the person's subscription, never a key), a page, or an error message.
// Measured by reading the gate and the session request with fakes for the
// disk, the Keychain and the network.
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { neoEnabled } from '../main/neo/gate.mjs';
import { readKey, startLive } from '../main/neo/live.mjs';
import { createNeo } from '../main/neo/index.mjs';

const KEY = 'sk-test-not-a-real-key-0123456789';
const OFFER = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n';

describe('the alpha gate', () => {
  it('is on only on a Mac whose switch is on', () => {
    expect(neoEnabled({ platform: 'darwin', config: { alphaNeo: true } })).toBe(true);
    expect(neoEnabled({ platform: 'darwin', config: { alphaNeo: false } })).toBe(false);
    expect(neoEnabled({ platform: 'darwin', config: {} })).toBe(false);
    expect(neoEnabled({ platform: 'linux', config: { alphaNeo: true } })).toBe(false);
  });

  it('with the gate off, the app gets only the "is it on" answer and nothing else starts', () => {
    const handled = [];
    const ipcMain = { handle: vi.fn((ch) => handled.push(ch)), on: vi.fn((ch) => handled.push(ch)) };
    const r = createNeo({ ipcMain, userData: '/nowhere-' + Date.now(), app: {}, BrowserWindow: vi.fn(), session: { fromPartition: vi.fn() }, globalShortcut: { register: vi.fn() } });
    expect(r.enabled).toBe(false);
    expect(handled).toEqual(['neo:enabled']);
  });

  it('nothing in the app turns the switch on but the switch', () => {
    const roots = ['main', 'renderer/src', 'shared', 'scripts'];
    const offenders = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'scratch' && e.name !== 'dist') walk(p); continue; }
        if (!/\.(m?js|cjs|ts|tsx)$/.test(e.name)) continue;
        const text = fs.readFileSync(p, 'utf8');
        for (const line of text.split('\n')) {
          if (/alphaNeo\s*:/.test(line) && /saveConfig/.test(line)) offenders.push(`${p}: ${line.trim()}`);
        }
      }
    };
    for (const r of roots) walk(r);
    expect(offenders).toEqual([`${path.join('main', 'settings.mjs')}: saveConfig(config, { alphaNeo: !!value });`]);
  });
});

describe('the key', () => {
  it('is read with an argument list, not a shell line', async () => {
    const run = vi.fn((cmd, args, opts, cb) => cb(null, `${KEY}\n`));
    expect(await readKey({ run })).toBe(KEY);
    expect(run.mock.calls[0][0]).toBe('security');
    expect(run.mock.calls[0][1]).toEqual(['find-generic-password', '-s', 'OPENAI_API_KEY', '-w']);
  });

  it('says plainly when the Keychain has none, without echoing anything it read', async () => {
    const run = (cmd, args, opts, cb) => cb(new Error(`exit 44 ${KEY}`), '');
    await expect(readKey({ run })).rejects.toThrow(/No OpenAI key/);
    await expect(readKey({ run })).rejects.not.toThrow(new RegExp(KEY));
  });

  it('goes only into the one request, and never into process.env', async () => {
    const before = JSON.stringify(process.env);
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 201, json: async () => ({ transport: { sdp: 'v=0 answer' }, session: { id: 's1' } }) }));
    const r = await startLive({ sdp: OFFER, session: { model: 'gpt-live-1' }, getKey: async () => KEY, fetchImpl });
    expect(r).toEqual({ sdp: 'v=0 answer', id: 's1' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/live/sessions');
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(init.body)).toEqual({ session: { model: 'gpt-live-1' }, transport: { type: 'webrtc', sdp: OFFER } });
    expect(JSON.stringify(process.env)).toBe(before);
    expect(JSON.stringify(r)).not.toContain(KEY);
  });

  it('is not in the error when OpenAI refuses', async () => {
    const fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({ error: { code: 'invalid_api_key', message: `Incorrect key ${KEY}` } }) });
    const err = await startLive({ sdp: OFFER, session: {}, getKey: async () => KEY, fetchImpl }).catch((e) => e);
    expect(err.message).toMatch(/401/);
    expect(err.message).not.toContain(KEY);
  });

  it('is never fetched for something that is not a WebRTC offer', async () => {
    const getKey = vi.fn(async () => KEY);
    for (const sdp of ['', 'hello', 'v=' + 'x'.repeat(70 * 1024), null]) {
      await expect(startLive({ sdp, session: {}, getKey, fetchImpl: vi.fn() })).rejects.toThrow(/offer/);
    }
    expect(getKey).not.toHaveBeenCalled();
  });

  it('no file of Neo\'s puts it in an environment', () => {
    for (const f of ['main/neo/index.mjs', 'main/neo/live.mjs', 'main/neo/cmd-tap.mjs', 'main/neo/preload.cjs']) {
      const text = fs.readFileSync(f, 'utf8');
      expect(text).not.toMatch(/process\.env\.[A-Z_]*OPENAI|env:\s*\{[^}]*KEY/);
    }
  });
});
