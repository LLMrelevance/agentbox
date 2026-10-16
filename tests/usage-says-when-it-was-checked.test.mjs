// The 2026-10-07 screenshot had three meters, zero refresh controls, and no
// checked time. A cached 100% reading looked current even after switching.
// Since 2026-10-16 every account carries its own session and week meters, and
// the checked time sits beside Refresh at the head of the card.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import fs from 'node:fs';
import { MiniMeters, PlaceRows, usageCheckedAt } from '../renderer/src/components/Settings';

const now = 1_000_000;
const limit = (span, percent, extra = {}) => ({ span, qualifier: span === 'week' ? 'all models' : null, name: span, percent, resetsText: null, resetsOn: null, resetsAt: null, zone: null, ...extra });

it('each account shows its own two numbers, the one in use first', () => {
  const html = renderToStaticMarkup(React.createElement(PlaceRows, { accounts: [
    { key: 'one', name: 'one@example.test', about: ['Max 20x'], inUse: true, limits: [limit('session', 5), limit('week', 9)] },
    { key: 'two', name: 'two@example.test', about: ['Max 20x'], limits: [limit('session', 100, { resetsText: '5:09pm' }), limit('week', 15)] },
  ] }));
  expect(html.indexOf('one@example.test')).toBeLessThan(html.indexOf('5%'));
  expect(html.indexOf('5%')).toBeLessThan(html.indexOf('two@example.test'));
  expect(html).toContain('back 5:09pm');
  expect(html).toContain('In use');
});

it('never draws a different account’s cached percentage', () => {
  const settings = fs.readFileSync(new URL('../renderer/src/components/Settings.tsx', import.meta.url), 'utf8');
  // Readings are looked up by the account's own folder, never handed across.
  expect(settings).toContain('accountReadings.find((r) => r.profile === profile && r.limits?.length && r.at)');
  expect(settings).toContain("return r && (r.profile ?? 'default') === profile ? r : null;");
});

it('a tile with no reading says so; a row draws no empty meters', () => {
  expect(renderToStaticMarkup(React.createElement(MiniMeters, { limits: null, stacked: true }))).toContain('No usage reading yet');
  expect(renderToStaticMarkup(React.createElement(MiniMeters, { limits: null }))).toBe('');
});

it('keeps freshness honest at the minute and hour boundaries', () => {
  expect(usageCheckedAt(now, now)).toBe('Checked just now');
  expect(usageCheckedAt(now - 59_999, now)).toBe('Checked just now');
  expect(usageCheckedAt(now - 60_000, now)).toBe('Checked 1 minute ago');
  expect(usageCheckedAt(now - 120_000, now)).toBe('Checked 2 minutes ago');
  expect(usageCheckedAt(now - 3_600_000, now)).toBe('Checked 1 hour ago');
  expect(usageCheckedAt(null, now)).toBe('');
});
