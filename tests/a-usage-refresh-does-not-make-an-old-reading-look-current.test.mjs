// On 2026-10-17 Settings labelled all local readings "Checked just now" using
// the newest account's timestamp, while ignoring refresh errors on the others.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import * as settings from '../renderer/src/components/Settings';
const { PlaceTiles, cloudPlaceAccounts } = settings;

const now = 10_000_000;
const account = (extra = {}) => ({ key: 'one', name: 'one@example.test', about: [], ...extra });
const draw = accounts => renderToStaticMarkup(React.createElement(PlaceTiles, { accounts, now }));

it('dates each account separately, including a cloud reading', () => {
  const html = draw([account({ checkedAt: now }), account({ key: 'two', checkedAt: now - 3_600_000 })]);
  expect(html).toContain('Checked just now');
  expect(html).toContain('Checked 1 hour ago');
  expect(cloudPlaceAccounts({ accounts: [{ engine: 'claude', key: 'c', limits: [{ span: 'session', percent: 8 }], readAt: now - 60_000 }] }, 'claude', now)[0].checkedAt).toBe(now - 60_000);
});

it('a failed refresh labels retained meters as the last reading', () => {
  const html = draw([account({ checkedAt: now - 60_000, usageError: 'Usage unavailable', limits: [{ span: 'session', percent: 8 }] })]);
  expect(html).toContain('Usage unavailable');
  expect(html).toContain('Last reading');
  expect(html).toContain('Checked 1 minute ago');
  expect(html).toContain('8%');
});

it('a failure with no old reading shows why, without inventing zero or a checked time', () => {
  const html = draw([account({ usageError: 'Usage unavailable' })]);
  expect(html).toContain('Usage unavailable');
  expect(html).not.toContain('0%');
  expect(html).not.toContain('Checked');
  expect(html).not.toContain('No usage reading yet');
});

it('uses the newest reading of the same account and refuses a sibling account’s newer reading', () => {
  const old = { profile: 'one', at: now - 60_000, limits: [{ span: 'session', percent: 39 }] };
  const fresh = { engine: 'claude', profile: 'one', at: now, limits: [{ span: 'session', percent: 8 }] };
  expect(settings.accountReadingFor('one', [old], fresh)).toEqual(fresh);
  expect(settings.accountReadingFor('one', [{ ...old, at: now + 1 }], fresh).at).toBe(now + 1);
  expect(settings.accountReadingFor('one', [old], { ...fresh, profile: 'two' }).at).toBe(old.at);
  expect(settings.accountReadingFor('one', [], { ...fresh, profile: 'two' })).toBeNull();
});
