// ALPHA FEATURES ARE SWITCHED ON IN SETTINGS (w-3d0fa23ffb, 2026-10-20).
//
// What was asked: Rooms "should only be available in alpha so it should be
// toggleable on. Maybe there's a section in settings where you can toggle on
// alpha features, which would include Neo and this one." Before this, Neo came
// on only when someone created a `neo-alpha` file by hand in the app's data
// folder (main/neo/gate.mjs), and there was no switch for anything.
//
// Measured here: the gate, the saved setting, what Settings reads back, the
// snapshot field the renderer gates Rooms on, and the page in the menu. Off is
// the default for both. The old file once still turned Neo on with the switch
// off; tests/neo-stays-off-once-its-switch-is-off has why it no longer does.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { neoEnabled } from '../main/neo/gate.mjs';
import { setWorkspaceSetting, alphaFeatures } from '../main/settings.mjs';
import { SETTINGS_PAGES, searchSettings } from '../renderer/src/settings-search.ts';

const read = (rel) => fs.readFileSync(path.join(import.meta.dirname, '..', rel), 'utf8');

describe('the Neo gate', () => {
  const noFile = () => false;
  it('is on when the switch is on, with no file', () => {
    expect(neoEnabled({ userData: '/data', platform: 'darwin', exists: noFile, config: { alphaNeo: true } })).toBe(true);
  });
  it('the old file no longer turns it on with the switch off', () => {
    const at = (p) => p === path.join('/data', 'neo-alpha');
    expect(neoEnabled({ userData: '/data', platform: 'darwin', exists: at, config: { alphaNeo: false } })).toBe(false);
  });
  it('is off with neither, and off on Linux whatever the switch says', () => {
    expect(neoEnabled({ userData: '/data', platform: 'darwin', exists: noFile, config: {} })).toBe(false);
    expect(neoEnabled({ userData: '/data', platform: 'darwin', exists: noFile })).toBe(false);
    expect(neoEnabled({ userData: '/data', platform: 'linux', exists: noFile, config: { alphaNeo: true } })).toBe(false);
  });
  it('only a real true turns it on', () => {
    expect(neoEnabled({ userData: '/data', platform: 'darwin', exists: noFile, config: { alphaNeo: 'yes' } })).toBe(false);
  });
});

describe('saving the switches', () => {
  const world = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alpha-'));
    return { config: { appDir: dir }, supervisor: { onChange() {} }, store: {}, dir };
  };

  it('both are off until someone turns them on', () => {
    expect(alphaFeatures({})).toEqual({ neo: false, rooms: false });
  });

  it('Rooms on is written to the config file and read back', () => {
    const w = world();
    setWorkspaceSetting(w, { key: 'alphaRooms', value: true });
    expect(JSON.parse(fs.readFileSync(path.join(w.dir, 'zero.config.json'), 'utf8')).alphaRooms).toBe(true);
    expect(alphaFeatures(w.config)).toEqual({ neo: false, rooms: true });
    setWorkspaceSetting(w, { key: 'alphaRooms', value: false });
    expect(alphaFeatures(w.config).rooms).toBe(false);
    fs.rmSync(w.dir, { recursive: true, force: true });
  });

  it('Neo on is written without touching Rooms', () => {
    const w = world();
    setWorkspaceSetting(w, { key: 'alphaRooms', value: true });
    setWorkspaceSetting(w, { key: 'alphaNeo', value: true });
    expect(alphaFeatures(w.config)).toEqual({ neo: true, rooms: true });
    fs.rmSync(w.dir, { recursive: true, force: true });
  });
});

describe('where the app reads them', () => {
  it('the snapshot carries the switches, so the renderer can gate Rooms', () => {
    expect(read('main/ipc.mjs')).toMatch(/alpha:\s*alphaFeatures\(config\)/);
  });
  it('Settings reads them back', () => {
    expect(read('main/settings.mjs')).toMatch(/alpha:\s*alphaFeatures\(config\)/);
  });
  it('Neo is handed the config at boot', () => {
    expect(read('main/main.mjs')).toMatch(/createNeo\(\{[\s\S]{0,400}config,/);
  });
});

describe('the page in Settings', () => {
  it('Alpha features is a page under Personal', () => {
    expect(SETTINGS_PAGES.find((p) => p.id === 'alpha')).toEqual({ id: 'alpha', label: 'Alpha features', group: 'Personal' });
  });
  it('typing alpha, rooms or neo finds it', () => {
    for (const q of ['alpha', 'rooms', 'beta']) {
      expect(searchSettings(q, { pages: SETTINGS_PAGES.map((p) => p.id) }).some((r) => r.page === 'alpha'), q).toBe(true);
    }
  });
  it('the page draws a switch for each, wired to its key', () => {
    const src = read('renderer/src/components/Settings.tsx');
    expect(src).toMatch(/setWorkspace\('alphaNeo'/);
    expect(src).toMatch(/setWorkspace\('alphaRooms'/);
  });
});
