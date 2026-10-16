// The 2026-10-07 screenshot had three meters, zero refresh controls, and no
// checked time. A cached 100% reading looked current even after switching.
// Since 2026-10-16 the meters sit under the account in use, on the card for
// this computer, and the checked time is on that account's row.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import fs from 'node:fs';
import { AccountMeters, AccountRows, usageCheckedAt } from '../renderer/src/components/Settings';

const now = 1_000_000;
const reading = { engine: 'claude', profile: '/profiles/one', at: now - 60_000, limits: [{ span: 'week', qualifier: 'all models', name: 'This week', percent: 100 }] };
const account = (profile, email, extra = {}) => ({ profile, email, plan: 'Max 20x', chosen: false, signedIn: true, trouble: null, dir: null, ...extra });

it('names the account in use and the age of its reading, with its meters straight under it', () => {
  const agent = { engine: 'claude', accounts: [
    account('/profiles/two', 'two@example.test'),
    account('/profiles/one', 'one@example.test', { chosen: true, use: usageCheckedAt(reading.at, now) }),
  ] };
  const html = renderToStaticMarkup(React.createElement(AccountRows, {
    agent, onChoose: () => {}, onAdd: () => {},
    under: (a) => a.chosen && React.createElement(AccountMeters, { reading, now }),
  }));
  expect(html).toContain('Checked 1 minute ago');
  // The account in use leads, and its meter follows it before any other account.
  expect(html.indexOf('one@example.test')).toBeLessThan(html.indexOf('100% used'));
  expect(html.indexOf('100% used')).toBeLessThan(html.indexOf('two@example.test'));
});

it('never draws a different account’s cached percentage', () => {
  const settings = fs.readFileSync(new URL('../renderer/src/components/Settings.tsx', import.meta.url), 'utf8');
  // Readings are looked up by the account's own folder, never handed across.
  expect(settings).toContain('accountReadings.find((r) => r.profile === profile && r.limits?.length && r.at)');
  expect(settings).toContain("return r && (r.profile ?? 'default') === profile ? r : null;");
});

it('says there is no reading yet rather than drawing empty meters', () => {
  const html = renderToStaticMarkup(React.createElement(AccountMeters, { reading: null, now }));
  expect(html).toContain('No usage reading yet');
  expect(html).not.toContain('% used');
});

it('keeps freshness honest at the minute and hour boundaries', () => {
  expect(usageCheckedAt(now, now)).toBe('Checked just now');
  expect(usageCheckedAt(now - 59_999, now)).toBe('Checked just now');
  expect(usageCheckedAt(now - 60_000, now)).toBe('Checked 1 minute ago');
  expect(usageCheckedAt(now - 120_000, now)).toBe('Checked 2 minutes ago');
  expect(usageCheckedAt(now - 3_600_000, now)).toBe('Checked 1 hour ago');
  expect(usageCheckedAt(null, now)).toBe('');
});
