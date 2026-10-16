// Switching to an account whose organization has Claude Code turned off left
// the usage box at "No usage reading yet" and, after Refresh, "Could not
// refresh usage. Try again." Trying again can never work. Measured 2026-10-11
// with Claude Code 2.1.293: `claude -p /usage` on that login printed only the
// "What's contributing" breakdown and no limits, and any real prompt on it
// answered "Your organization has disabled Claude subscription access for
// Claude Code". The account's row says its own sentence; the meters under it
// must not add "No usage reading yet" beside it.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { AccountMeters } from '../renderer/src/components/Settings';

const now = 1_000_000;
const blocked = 'Signed in, but its organization has turned Claude Code off. Only an admin of that workspace can turn it back on.';
const reading = { engine: 'claude', profile: 'default', at: now - 60_000, limits: [{ span: 'week', qualifier: 'all models', name: 'This week', percent: 40 }] };
const draw = (props = {}) => renderToStaticMarkup(React.createElement(AccountMeters, { reading: null, now, ...props }));

it('says nothing under an account that cannot run: its row already says why', () => {
  expect(draw({ trouble: blocked })).toBe('');
});

it('still says no reading yet when nothing is wrong with the account', () => {
  expect(draw({ trouble: null })).toContain('No usage reading yet');
});

it('says the reader’s own reason when a refresh came back empty', () => {
  expect(draw({ error: 'Claude Code did not report usage for this account.' })).toContain('did not report usage');
});

it('keeps the meters of a reading it has, even beside trouble', () => {
  const html = draw({ reading, trouble: 'At its limit. It rejoins on its own when the limit resets.' });
  expect(html).toContain('40% used');
  expect(html).not.toContain('No usage reading yet');
});
