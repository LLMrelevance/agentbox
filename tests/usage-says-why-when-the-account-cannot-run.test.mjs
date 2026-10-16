// Switching to an account whose organization has Claude Code turned off left
// the usage box at "No usage reading yet" and, after Refresh, "Could not
// refresh usage. Try again." Trying again can never work. Measured 2026-10-11
// with Claude Code 2.1.293: `claude -p /usage` on that login printed only the
// "What's contributing" breakdown and no limits, and any real prompt on it
// answered "Your organization has disabled Claude subscription access for
// Claude Code". The account says its own sentence in place of its meters.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { PlaceRows, PlaceTiles } from '../renderer/src/components/Settings';

const blocked = 'Signed in, but its organization has turned Claude Code off. Only an admin of that workspace can turn it back on.';
const limits = [{ span: 'week', qualifier: 'all models', name: 'This week', percent: 40, resetsText: null, resetsOn: null, resetsAt: null, zone: null }];
const account = (extra) => ({ key: 'one', name: 'one@example.test', about: ['Max 20x'], ...extra });

for (const [look, C] of [['row', PlaceRows], ['tile', PlaceTiles]]) {
  it(`a ${look} says why there is no reading when the account cannot run`, () => {
    const html = renderToStaticMarkup(React.createElement(C, { accounts: [account({ trouble: blocked })] }));
    expect(html).toContain('its organization has turned Claude Code off');
    expect(html).not.toContain('No usage reading yet');
  });

  it(`a ${look} keeps the meters of a healthy account, with no trouble beside them`, () => {
    const html = renderToStaticMarkup(React.createElement(C, { accounts: [account({ limits })] }));
    expect(html).toContain('40%');
    expect(html).not.toContain('organization');
  });
}
