// A NEO PAGE IN SETTINGS (w-6a1c405642), and the alpha it is gated behind.
//
// Neo is on for one Mac: a file in the app's data folder turns it on and
// nothing in the app ever writes that file (main/neo/gate.mjs). A page about
// Neo on everybody else's Mac is a row that opens an empty screen and a
// search result that lands nowhere, so the gate has to reach the menu, the
// search and the pane alike. This file pins all three, and the words somebody
// would actually type to find the page.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SETTINGS_PAGES, searchSettings } from '../renderer/src/settings-search';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const settings = read('renderer/src/components/Settings.tsx');
const app = read('renderer/src/App.tsx');
const page = read('renderer/src/neo/NeoSettings.tsx');

const EVERY = SETTINGS_PAGES.map((p) => p.id);
const WITHOUT_NEO = EVERY.filter((id) => id !== 'neo');

describe('the menu', () => {
  it('has a Neo row, among the person\'s own settings', () => {
    const neo = SETTINGS_PAGES.find((p) => p.id === 'neo');
    expect(neo).toEqual({ id: 'neo', label: 'Neo', group: 'Personal' });
  });

  it('is filtered by the gate, the same way Team is', () => {
    expect(settings).toMatch(/p\.id !== 'neo' \|\| neoOn/);
    expect(settings).toMatch(/neoOn\?: boolean/);
  });

  it('sends ?settings=neo to General where Neo is off, rather than to a blank page', () => {
    expect(settings).toMatch(/want === 'neo'\) return has\.neo \? 'neo' : 'general'/);
  });

  it('draws the pane only with the gate open', () => {
    expect(settings).toMatch(/pane === 'neo' && neoOn && <NeoSettings \/>/);
  });

  it('is told whether this Mac has Neo by the one thing that already asks', () => {
    expect(app).toMatch(/neoOn=\{neo\.on\}/);
    expect(read('renderer/src/neo/useNeo.ts')).toMatch(/return \{ on: enabled \}/);
  });
});

describe('the search over Settings', () => {
  it.each([
    ['neo'],
    ['memories'],
    ['memory'],
    ['remember'],
    ['forget'],
    ['voice'],
    ['jarvis'],
  ])('finds the Neo page for "%s"', (query) => {
    const hits = searchSettings(query, { pages: EVERY });
    expect(hits.filter((h) => h.page === 'neo').length).toBeGreaterThan(0);
  });

  it('lands on the group the hit names, not just the page', () => {
    const hit = searchSettings('memories', { pages: EVERY }).find((h) => h.page === 'neo');
    expect(hit.anchor).toBe('neo-memories');
    // The group draws the anchor as `data-find`, which is what the search scrolls to.
    expect(page).toContain('data-find={id}');
    for (const anchor of ['neo-instructions', 'neo-memories', 'neo-talks']) expect(page).toContain(`id="${anchor}"`);
  });

  it('offers nothing about Neo where Neo is off', () => {
    for (const query of ['neo', 'memories', 'remember', 'jarvis']) {
      expect(searchSettings(query, { pages: WITHOUT_NEO }).filter((h) => h.page === 'neo')).toEqual([]);
    }
  });

  it('still finds everything it found before', () => {
    expect(searchSettings('theme', { pages: EVERY })[0].page).toBe('appearance');
    expect(searchSettings('permission mode', { pages: EVERY }).map((h) => h.page)).toContain('claude');
  });
});

describe('the page itself', () => {
  it('asks main for everything on it, so nothing about Neo enters the settings file', () => {
    expect(page).toMatch(/neoMemory/);
    expect(page).not.toMatch(/setWorkspaceSetting|api\.settings/);
  });

  it('offers the three things the founder asked for: instructions, memories, and one way to take one back', () => {
    expect(page).toContain('Instructions for Neo');
    expect(page).toContain('What Neo remembers');
    expect(page).toMatch(/forget: m\.id/);
  });
});
