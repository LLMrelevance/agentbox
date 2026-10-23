// A NEO PAGE IN SETTINGS (w-6a1c405642), and the alpha it is gated behind.
//
// Neo is on only where its switch in Alpha features is on, and only on a Mac
// (main/neo/gate.mjs). A page about
// Neo on everybody else's Mac is a row that opens an empty screen and a
// search result that lands nowhere, so the gate has to reach the menu, the
// search and the pane alike. This file pins all three, and the words somebody
// would actually type to find the page.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SETTINGS_PAGES, searchSettings } from '../renderer/src/settings-search';
import { neoEnabled } from '../main/neo/gate.mjs';

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

  /* "This should only be visible to me because no one else should have
     access to Neo" (2026-10-17). The page rides the gate the rest of Neo
     rides: a Mac, a switch only its owner turns on, and a door that answers
     no anywhere else. Nothing about the page relaxes any of that. */
  it('is behind the gate the rest of Neo is behind, and so is what it reads', () => {
    expect(neoEnabled({ platform: 'linux', config: { alphaNeo: true } })).toBe(false);
    expect(read('preload.cjs')).toMatch(/neoEnabled: \(\) => ipcRenderer\.invoke\('neo:enabled'\)\.catch\(\(\) => false\)/);
    // A browser tab and a phone are told no on both doors, not left to 404.
    const serve = read('main/serve.mjs');
    expect(serve).toMatch(/ipcMain\.handle\('neo:enabled', \(\) => false\)/);
    expect(serve).toMatch(/ipcMain\.handle\('neo:memory', \(\) => null\)/);
    // And the handler that answers for real is registered past the gate's return.
    const neo = read('main/neo/index.mjs');
    expect(neo.indexOf("ipcMain.handle('neo:memory'")).toBeGreaterThan(neo.indexOf('if (!on) return { enabled: false }'));
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
    ['instructions neo'],
  ])('finds the Neo page for "%s"', (query) => {
    const hits = searchSettings(query, { pages: EVERY });
    expect(hits.filter((h) => h.page === 'neo').length).toBeGreaterThan(0);
  });

  it('lands on the section the hit names, not just the page', () => {
    const hit = searchSettings('memories', { pages: EVERY }).find((h) => h.page === 'neo');
    expect(hit.anchor).toBe('neo-memories');
    // `find` is what the section draws as data-find, which is what the search scrolls to.
    for (const anchor of ['neo-instructions', 'neo-memories']) expect(page).toContain(`find="${anchor}"`);
    expect(read('renderer/src/components/InstructionSettings.tsx')).toContain('data-find={find}');
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

  it('holds the two documents that were asked for, and nothing else', () => {
    expect(page).toContain('Instructions for Neo');
    expect(page).toContain('data-find="neo-voice"');
    expect(page).toContain('What Neo remembers');
  });

  /* "If you look at the design style, we already have components like this in
     Instructions... just make it similar where possible" (2026-10-17). It is
     the same component and the same card, not a lookalike built beside it. */
  it('is drawn with the Instructions page\'s own card and sections', () => {
    expect(page).toMatch(/import \{ Part.*\} from '\.\.\/components\/InstructionSettings'/);
    expect(page).toContain('set-inner instructions-page');
    expect(page).toContain('instr-card');
  });

  /* "the voice stuff is unrelated. This is a totally different section in the
     Neo settings so it shouldn't follow that design pattern. Look at the other
     settings pages and, more so, follow those design patterns" (2026-10-17).
     So the voice is a settings card with a row and the settings dropdown, and
     only the voice: the instructions stay on the instructions card. */
  it('puts the voice on a settings card, like every other page, and only the voice', () => {
    const voice = page.slice(page.indexOf('function VoiceRow'));
    expect(voice).toMatch(/set-row/);
    expect(voice).toMatch(/set-picker/);
    expect(page).toMatch(/data-find="neo-voice"[\s\S]*set-plate/);
    const instructions = page.slice(page.indexOf('<div className="instr-card">'), page.indexOf('data-find="neo-voice"'));
    expect(instructions).not.toMatch(/set-plate|set-row|set-seg/);
  });

  it('the instructions card is rounded like the settings card', () => {
    expect(read('renderer/src/workspace-navigation.css')).toMatch(/\.instr-card \{[^}]*border-radius:10px/);
    expect(read('renderer/src/components/settings.css')).toMatch(/\.set-plate:not\(\.set-keys\) \{[^}]*border-radius: 10px/);
  });

  it('has no stylesheet of its own to drift from that one', () => {
    expect(read('renderer/src/components/settings.css')).not.toMatch(/\.neo-/);
  });
});
