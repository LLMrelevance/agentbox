// What broke: nothing yet. The phone with the Mac shut (docs/cloud/PHONE-PLAN.md,
// step 1) is the app's own phone screens over a bridge to her rows online
// (renderer/src/cloud-bridge.ts), signing in as her (renderer/src/cloud-rest.ts).
// Measured on the bridge's own pieces with a fake database: what the inbox
// draws from the rows, what each press leaves for her Mac, that a reply shows
// as waiting until her Mac takes it, and that every request carries her
// sign-in and no other key.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { phoneView, phoneHistory, commandFor, readCloudConfig } from '../renderer/src/cloud-bridge';
import { cloudClient } from '../renderer/src/cloud-rest';

const NOW = Date.parse('2026-10-14T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const thread = (item, extra = {}) => ({ project: 'alpha', item, snapshot: { v: 2, item: { id: item, title: `T ${item}`, status: 'blocked', updatedAt: NOW - 1e5, ...extra }, history: [{ id: item, ts: 1, source: 'agent', patch: { result: 'Done.' } }] } });
const cmd = (id, kind, extra = {}) => ({ id, project: 'alpha', item: 'w-1', kind, payload: {}, created_at: iso(NOW - 1000), taken_at: null, outcome: null, ...extra });
const rows = (commands = []) => ({ projects: [{ project: 'alpha', name: 'Alpha' }], threads: [thread('w-1'), thread('w-2')], commands });

describe('what the inbox draws', () => {
  it('each thread as her Mac last saw it, under its project', () => {
    const v = phoneView(rows(), NOW);
    expect(v.products.map((p) => [p.slug, p.name])).toEqual([['alpha', 'Alpha']]);
    expect(v.items.map((i) => [i.id, i.product, i.productName, i.status])).toEqual([['w-1', 'alpha', 'Alpha', 'blocked'], ['w-2', 'alpha', 'Alpha', 'blocked']]);
    expect(phoneHistory(rows(), 'alpha', 'w-1').lines[0].patch.result).toBe('Done.');
    expect(phoneHistory(rows(), 'alpha', 'w-9').lines).toEqual([]);
  });

  it('a thread of a project no longer on her phone is not drawn', () => {
    const r = rows();
    r.threads.push({ ...thread('w-3'), project: 'gone' });
    expect(phoneView(r, NOW).items.map((i) => i.id)).toEqual(['w-1', 'w-2']);
  });

  it('a close or a snooze waiting for her Mac moves the row at once', () => {
    const v = phoneView(rows([cmd('c1', 'close'), cmd('c2', 'snooze', { item: 'w-2', payload: { until: NOW + 864e5 } })]), NOW);
    expect(v.items.find((i) => i.id === 'w-1').status).toBe('done');
    expect(v.items.find((i) => i.id === 'w-2').snoozedUntil).toBe(NOW + 864e5);
  });

  it('a new thread waiting for her Mac is a row of its own', () => {
    const v = phoneView(rows([cmd('0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 'new', { item: null, payload: { title: 'Ship it', body: 'today' } })]), NOW);
    const made = v.items.find((i) => i.title === 'Ship it');
    expect(made).toMatchObject({ product: 'alpha', status: 'open', waitsForMac: true });
    expect(made.id).toMatch(/^w-[0-9a-f]{10}$/);
  });

  it('a reply waits, then goes once her Mac has taken it', () => {
    expect(phoneView(rows([cmd('c1', 'reply', { payload: { text: 'Yes, ship it.' } })]), NOW).waiting)
      .toEqual([{ product: 'alpha', id: 'w-1', at: NOW - 1000, text: 'Yes, ship it.' }]);
    expect(phoneView(rows([cmd('c1', 'reply', { payload: { text: 'x' }, taken_at: iso(NOW), outcome: 'done' })]), NOW).waiting).toEqual([]);
  });

  it('a reply her Mac turned down says why, for a day', () => {
    const refused = cmd('c1', 'reply', { payload: { text: 'x' }, taken_at: iso(NOW), outcome: 'refused: that thread is not on your phone' });
    expect(phoneView(rows([refused]), NOW).waiting[0].refused).toBe('that thread is not on your phone');
    expect(phoneView(rows([refused]), NOW + 2 * 864e5).waiting).toEqual([]);
    // A close her Mac turned down leaves the row where it was.
    const noClose = cmd('c2', 'close', { taken_at: iso(NOW), outcome: 'refused: no' });
    expect(phoneView(rows([noClose]), NOW).items.find((i) => i.id === 'w-1').status).toBe('blocked');
  });
});

describe('what a press leaves for her Mac', () => {
  it('the four things, and nothing else', () => {
    expect(commandFor('zero:answer', { product: 'alpha', id: 'w-1', answer: 'Yes' })).toEqual({ project: 'alpha', item: 'w-1', kind: 'reply', payload: { text: 'Yes' } });
    expect(commandFor('zero:answer', { product: 'alpha', id: 'w-1', status: 'done' })).toEqual({ project: 'alpha', item: 'w-1', kind: 'close', payload: {} });
    expect(commandFor('zero:snooze', { product: 'alpha', id: 'w-1', snoozedUntil: 5 })).toEqual({ project: 'alpha', item: 'w-1', kind: 'snooze', payload: { until: 5 } });
    expect(commandFor('zero:compose', { product: 'alpha', title: 'T', body: 'B' })).toEqual({ project: 'alpha', item: null, kind: 'new', payload: { title: 'T', body: 'B' } });
    expect(commandFor('zero:answer', { product: 'alpha', id: 'w-1', answer: '  ' })).toBeNull();
    expect(commandFor('zero:answer', { product: 'alpha', id: 'w-1', priority: 9 })).toBeNull();
    expect(commandFor('zero:snooze', { product: 'alpha', id: 'w-1', snoozedUntil: null })).toBeNull();
    expect(commandFor('zero:compose', { product: 'alpha', title: ' ', body: '' })).toBeNull();
    expect(commandFor('zero:stop-session', { product: 'alpha', id: 'w-1' })).toBeNull();
  });
});

describe('signing in and asking, as her', () => {
  const cfg = { url: 'https://db.example.test', anonKey: 'public-anon' };
  const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
  const answer = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('signs in with a password, then asks with her token and the public key only', async () => {
    const seen = [];
    let t = NOW;
    const fetchImpl = async (url, init) => {
      seen.push({ url, headers: init.headers, body: init.body });
      if (url.includes('grant_type=password')) return answer(200, { access_token: 'tok-1', refresh_token: 'r-1', expires_in: 3600, user: { id: 'u-1', email: 'a@b.c' } });
      if (url.includes('grant_type=refresh_token')) return answer(200, { access_token: 'tok-2', refresh_token: 'r-2', expires_in: 3600, user: { id: 'u-1' } });
      return answer(200, [{ project: 'alpha', name: 'Alpha' }]);
    };
    const storage = memory();
    const c = cloudClient(cfg, { storage, fetchImpl, now: () => t });
    await c.signInWithPassword('a@b.c', 'pw');
    expect(await c.select('phone_projects', 'select=project,name')).toEqual([{ project: 'alpha', name: 'Alpha' }]);
    expect(seen[1].headers).toMatchObject({ apikey: 'public-anon', authorization: 'Bearer tok-1' });
    // Near its end the token is renewed first.
    t = NOW + 3600_000 - 30_000;
    await c.select('phone_threads', 'select=item');
    expect(seen.at(-2).url).toContain('grant_type=refresh_token');
    expect(seen.at(-1).headers.authorization).toBe('Bearer tok-2');
    // Kept for the next visit, and gone on sign-out.
    expect(cloudClient(cfg, { storage, fetchImpl }).signedIn()).toBe(true);
    c.signOut();
    expect(cloudClient(cfg, { storage, fetchImpl }).signedIn()).toBe(false);
  });

  it('signs in with Google through a one-time proof, and refuses a code it did not start', async () => {
    const storage = memory();
    let sent = null;
    const fetchImpl = async (url, init) => { sent = { url, body: JSON.parse(init.body) }; return answer(200, { access_token: 'tok', refresh_token: 'r', expires_in: 3600, user: { id: 'u-1' } }); };
    const c = cloudClient(cfg, { storage, fetchImpl });
    const go = new URL(await c.googleUrl('https://phone.example.test/'));
    expect(go.pathname).toBe('/auth/v1/authorize');
    expect(go.searchParams.get('provider')).toBe('google');
    expect(go.searchParams.get('code_challenge_method')).toBe('s256');
    await c.finishGoogle('code-1');
    expect(sent.url).toContain('grant_type=pkce');
    expect(sent.body.auth_code).toBe('code-1');
    expect(sent.body.code_verifier).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    await expect(cloudClient(cfg, { storage: memory(), fetchImpl }).finishGoogle('code-2')).rejects.toThrow(/started somewhere else/);
  });

  it('a refused sign-in says why in words, and a lapsed one signs her out', async () => {
    const c = cloudClient(cfg, { storage: memory(), fetchImpl: async () => answer(400, { error_description: 'Invalid login credentials' }) });
    await expect(c.signInWithPassword('a@b.c', 'no')).rejects.toThrow('Invalid login credentials');
    const storage = memory();
    storage.setItem('agentbox-cloud-session', JSON.stringify({ access_token: 't', refresh_token: 'r', expires_at: Date.now() + 3600_000, user: { id: 'u' } }));
    const d = cloudClient(cfg, { storage, fetchImpl: async () => answer(401, { message: 'JWT expired' }) });
    await expect(d.select('phone_threads', 'select=item')).rejects.toThrow('JWT expired');
    expect(d.signedIn()).toBe(false);
  });
});

describe('only on its own site', () => {
  it('reads the cloud address from the page, and nothing from a page without it', () => {
    const doc = (content) => ({ querySelector: () => (content == null ? null : { getAttribute: () => content }) });
    expect(readCloudConfig(doc(JSON.stringify({ url: 'https://db', anonKey: 'k' })))).toEqual({ url: 'https://db', anonKey: 'k' });
    expect(readCloudConfig(doc(null))).toBeNull();
    expect(readCloudConfig(doc('not json'))).toBeNull();
  });
  it('is never put in the page the desktop or the Mac\'s own phone page loads', () => {
    expect(fs.readFileSync(new URL('../renderer/index.html', import.meta.url), 'utf8')).not.toContain('agentbox-cloud');
  });
});
