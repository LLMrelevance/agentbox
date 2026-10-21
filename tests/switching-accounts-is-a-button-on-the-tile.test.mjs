// SWITCHING ACCOUNTS IS A BUTTON ON THE TILE, AND EVERY TILE SAYS ITS STATE.
//
// What she said (2026-10-20): "I don't see how to switch accounts on Claude."
// The switch was grey text in the line under the email, the same size and
// colour as a status, so it read as one. And "these cards should be very
// similar to each other, almost one-to-one": the cloud's tiles said "Ready" or
// "At its limit" there, this computer's said IN USE or the switch. She picked
// design C (designs/w-1e5b38c905/10-switch-c.png): IN USE beside the name,
// the state on the second line of every tile, and a full-width "Switch to
// this account" button under the meters of each one not in use.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PlaceTiles, cloudPlaceAccounts, hereState } from '../renderer/src/components/Settings';

const limit = (span, percent) => ({ span, qualifier: span === 'week' ? 'all models' : null, name: span, percent, resetsText: null, resetsOn: null, resetsAt: null, zone: null });
const draw = (accounts) => renderToStaticMarkup(React.createElement(PlaceTiles, { accounts }));
const tile = (extra = {}) => ({ key: 'k', name: 'one@example.test', plan: 'Max 20x', about: ['Ready'], limits: [limit('session', 5), limit('week', 9)], ...extra });

describe('a tile on this computer', () => {
  it('her case: the account not in use has a full-width Switch to this account button', () => {
    const onUse = vi.fn();
    const html = draw([tile({ key: 'a', inUse: true }), tile({ key: 'b', name: 'two@example.test', use: { word: 'Switch to this account', onUse } })]);
    expect(html.match(/acct-switch/g)).toHaveLength(1);
    expect(html).toMatch(/two@example\.test.*<button type="button" class="set-ghost acct-switch">Switch to this account<\/button>/s);
  });

  it('the one in use says IN USE beside its name and its state on the next line', () => {
    const html = draw([tile({ inUse: true })]);
    expect(html).toMatch(/acct-tile-name">one@example\.test<\/span><span class="set-badge">In use<\/span><span class="acct-tile-plan">Max 20x/);
    expect(html).toContain('<div class="acct-tile-about">Ready</div>');
    expect(html).not.toContain('acct-switch');
  });

  it('says Ready, At its limit, or that it needs signing in', () => {
    expect(hereState({ signedIn: true, trouble: null, limits: [limit('session', 99), limit('week', 9)] })).toEqual(['Ready']);
    expect(hereState({ signedIn: true, trouble: null, limits: [limit('session', 100), limit('week', 9)] })).toEqual(['At its limit']);
    expect(hereState({ signedIn: true, trouble: null, limits: null })).toEqual(['Ready']);
    expect(hereState({ signedIn: false, trouble: null, limits: null })).toEqual(['Finish signing in to use it']);
  });

  it('must NOT claim Ready over trouble, which says what is wrong below it', () => {
    expect(hereState({ signedIn: true, trouble: 'Signed out. Sign in again.', limits: null })).toEqual([]);
  });
});

describe('a tile in the cloud', () => {
  // IN USE, AS THIS COMPUTER'S TILES SAY IT (w-dac993a554). The cloud used to
  // take its accounts in turn, so no tile could claim to be the one; it runs
  // on one account now, and the tiles are still one-to-one with this
  // computer's apart from the switch, which the cloud has nowhere to put.
  it('has the same lines and says which account runs, with no switch on it', () => {
    const [a] = cloudPlaceAccounts({ mode: 'all', accounts: [{ engine: 'claude', key: 'c', name: 'one@example.test', plan: 'Max 20x', ready: true, state: 'ready', limits: [limit('session', 5)] }] }, 'claude', Date.now());
    const html = draw([a]);
    expect(html).toMatch(/acct-tile-name">one@example\.test<\/span><span class="set-badge">In use<\/span><span class="acct-tile-plan">Max 20x/);
    expect(html).toContain('<div class="acct-tile-about">Ready</div>');
    expect(html).not.toContain('acct-switch');
  });
});
