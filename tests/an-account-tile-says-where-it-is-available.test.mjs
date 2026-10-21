// AN ACCOUNT TILE SAYS WHERE IT IS AVAILABLE, AND OFFERS THE CLOUD WHEN IT IS MISSING THERE.
//
// What was asked (2026-10-21, after the one-tile-per-account design): "there
// is a possibility that we didn't set something up initially ... don't we
// need to reauthenticate for it to work with the cloud? ... I have a
// different set of accounts available locally than in the cloud ... The best
// case would be to show an account and tell you where it's available."
//
// The cloud cannot borrow this computer's login; each account is signed in
// there on its own. The tile named a place only when one was missing, and
// said nothing at all about an account signed in here but not in the cloud.
// Now every tile, once a cloud is set up, says where it is available, and one
// missing from the cloud (or whose cloud sign-in stopped) has the button that
// signs it in there.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaceTiles, accountTile } from '../renderer/src/components/Settings';
import { SETUP } from '../renderer/src/cloud-setup.ts';
import { recordCloudLogin } from '../main/cloud/logins.mjs';
import { Supervisor } from '../main/supervisor.mjs';

const here = (extra = {}) => ({ profile: 'default', email: 'work@example.test', plan: 'Max 20x', chosen: true, signedIn: true, trouble: null, dir: null, ...extra });
const cloud = (extra = {}) => ({ engine: 'claude', key: 'acct-1', name: 'work@example.test', ready: true, state: 'ready', identified: true, ...extra });
const account = (extra = {}) => ({ key: 'default', name: 'work@example.test', plan: 'Max 20x', here: here(), cloud: cloud(), limits: null, checkedAt: null, usageError: null, ...extra });
const acts = (extra = {}) => ({ picked: true, many: true, now: Date.now(), onUse: vi.fn(), cloud: true, onCloudSignIn: vi.fn(), ...extra });
// The words in their own span, which cuts them short rather than wrapping into the meters.
const line = (t) => renderToStaticMarkup(React.createElement(PlaceTiles, { accounts: [t] })).match(/<div class="acct-tile-about"><span>(.*?)<\/span>(.*?)<\/div>/)?.slice(1).join('');

describe('where an account is available', () => {
  it('the reported case: signed in here and in the cloud, said once on its one tile', () => {
    expect(line(accountTile(account(), acts()))).toBe('Max 20x · This computer and cloud');
  });

  it('here but not in the cloud says so, with Add to cloud, which signs in that account there', () => {
    const onCloudSignIn = vi.fn();
    const t = accountTile(account({ cloud: null }), acts({ onCloudSignIn }));
    expect(line(t)).toBe('Max 20x · This computer only<button type="button" class="acct-cloud-act">Add to cloud</button>');
    t.cloudAct.onUse();
    expect(onCloudSignIn).toHaveBeenCalledWith(null, 'work@example.test');
  });

  it('in the cloud and nowhere here: Cloud only once its account is known, In the cloud before', () => {
    expect(line(accountTile(account({ here: null }), acts()))).toBe('Max 20x · Cloud only');
    expect(line(accountTile(account({ here: null, cloud: cloud({ identified: false }) }), acts()))).toBe('Max 20x · In the cloud');
  });

  // "Cloud sign-in stopped" and its button did not fit one line: it wrapped into the meters.
  it('a cloud sign-in that stopped says so in words that fit beside the button that signs that login in again', () => {
    const onCloudSignIn = vi.fn();
    const t = accountTile(account({ cloud: cloud({ state: 'broken', ready: false }) }), acts({ onCloudSignIn }));
    expect(line(t)).toBe('Max 20x · Signed out of cloud<button type="button" class="acct-cloud-act">Sign in again</button>');
    expect('Signed out of cloud'.length).toBeLessThanOrEqual('This computer only'.length + 1);
    t.cloudAct.onUse();
    expect(onCloudSignIn).toHaveBeenCalledWith('acct-1', 'work@example.test');
  });

  it('must NOT name a place, or offer the cloud, where no cloud is set up', () => {
    const t = accountTile(account({ cloud: null }), acts({ cloud: false }));
    expect(line(t)).toBe('Max 20x');
    expect(t.cloudAct).toBeNull();
  });

  it('must NOT offer the cloud to an account not signed in here yet: that comes first', () => {
    const t = accountTile(account({ cloud: null, here: here({ signedIn: false, email: null }) }), acts());
    expect(t.about).toEqual(['Finish signing in to use it']);
    expect(t.cloudAct).toBeNull();
  });
});

describe('the cloud’s sign-in, opened from the tile', () => {
  it('names the account to sign in as', () => {
    expect(SETUP.signInHead('claude', 'work@example.test')).toBe('Sign in to work@example.test');
    expect(SETUP.signInHead('claude')).toBe('Sign in to Claude');
    expect(SETUP.signInHead('codex', null)).toBe('Sign in to Codex');
  });

  const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

  it('starts the sign-in and opens the cloud screen over Settings', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toMatch(/onCloudSignIn=\{\(key, email\) => \{[\s\S]{0,200}api\.cloudSignIn\(\{ action: 'start', engine: 'claude', key \}\)[\s\S]{0,200}setCloudSetupOpen\(true\)/);
    expect(app).toMatch(/<CloudSetup[\s\S]{0,200}signInAs=\{cloudSignInAs\}/);
  });

  it('Escape belongs to the cloud screen while it is over Settings, and must NOT close Settings under it', () => {
    expect(read('renderer/src/components/Settings.tsx')).toMatch(/if \(document\.querySelector\('\.ps-over'\)\) return;/);
  });
});

describe('main says whether it knows whose a cloud login is', () => {
  let home;
  beforeEach(() => { home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-known-'))); });
  afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

  const signIn = (dir, email, org) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: email, accountUuid: `a-${email}`, organizationUuid: org } }));
  };
  const listed = (profiles) => new Supervisor({ home, storeRoot: home, maxConcurrentSessions: 1, authProfiles: profiles }, { listItems: () => [], listProducts: () => [] }, '/nonexistent-app')
    ._cloudAccounts().map((a) => [a.key, a.profile, a.identified]);

  it('known once its organization is read, and not before', () => {
    recordCloudLogin('claude', 'acct-1', { id: 'id-1', org: 'org-1' }, { home, now: 1 });
    recordCloudLogin('claude', 'acct-2', { id: 'id-2' }, { home, now: 2 });
    expect(listed(['default'])).toEqual([['acct-1', null, true], ['acct-2', null, false]]);
  });

  // A team plan: two people's logins here share one organization, and a cloud
  // token says only the organization. It was called "Cloud only" and drawn as
  // a second tile beside the one it may well be.
  it('must NOT call a login only in the cloud when two people here share its organization and it cannot say which', () => {
    const second = path.join(home, '.claude-2');
    signIn(home, 'a@example.test', 'org-team');
    signIn(second, 'b@example.test', 'org-team');
    recordCloudLogin('claude', 'acct-1', { id: 'id-1', org: 'org-team' }, { home, now: 1 });
    expect(listed(['default', second])).toEqual([['acct-1', null, false]]);
  });

  it('pairs a login that says its email with that person, even in an organization two people here share', () => {
    const second = path.join(home, '.claude-2');
    signIn(home, 'a@example.test', 'org-team');
    signIn(second, 'b@example.test', 'org-team');
    recordCloudLogin('claude', 'acct-1', { id: 'id-1', org: 'org-team', email: 'b@example.test' }, { home, now: 1 });
    expect(listed(['default', second])).toEqual([['acct-1', second, true]]);
  });

  it('only in the cloud when nobody here is in its organization, or when it names someone not signed in here', () => {
    signIn(home, 'a@example.test', 'org-team');
    recordCloudLogin('claude', 'acct-1', { id: 'id-1', org: 'org-elsewhere' }, { home, now: 1 });
    recordCloudLogin('claude', 'acct-2', { id: 'id-2', org: 'org-team', email: 'c@example.test' }, { home, now: 2 });
    recordCloudLogin('claude', 'acct-3', { id: 'id-3', org: 'org-team' }, { home, now: 3 });
    expect(listed(['default'])).toEqual([['acct-1', null, true], ['acct-2', null, true], ['acct-3', 'default', true]]);
  });
});
