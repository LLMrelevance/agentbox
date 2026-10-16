// THE CLOUD IS ON OR OFF, WITH ONE KEY, AND WHAT "ON" MEANS IS A PREFERENCE.
//
// What she asked for (2026-10-16): hovering the cloud button showed no key,
// and choosing between three places every time was the wrong shape: "you're
// either in cloud mode or not. If you're not in cloud mode, everything runs on
// the Mac. If you are in cloud mode, it gives those two options but maybe you
// have a default setting based on your preference." She picked that drawing
// over four others ("a lot more intuitive") and asked for it shipped. Measured
// that day by reading the code: no key opened the cloud, ⌘K had no command for
// it, and turning the cloud off forgot whether "on" had meant everything.
//
// Now C turns the cloud on or off from anywhere and a note says which; the
// menu shows On and Off, then what "on" means, kept even while it is off; ⌘K
// prints C beside the command; N alone starts a thread.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CLOUD_KEY, cloudIsOn, cloudToggleTarget, cloudToggleNote, cloudCommands, CLOUD_WHEN_ON } from '../renderer/src/cloud-menu';
import { HINTS } from '../renderer/src/hint-plate';
import { SHORTCUTS } from '../shared/shortcuts.mjs';
import { setWorkspaceSetting } from '../main/settings.mjs';
import { Supervisor } from '../main/supervisor.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const status = (mode, whenOn) => ({ setUp: true, mode, whenOn, running: 0, month: { runs: 0, agentHours: 0, estimatedCost: 0, costPerAgentHour: null } });

describe('on or off', () => {
  it('is on whenever threads may go to the cloud', () => {
    expect(cloudIsOn(status('full'))).toBe(true);
    expect(cloudIsOn(status('all'))).toBe(true);
    expect(cloudIsOn(status('mac'))).toBe(false);
    expect(cloudIsOn(null)).toBe(false);
  });

  it('C turns it off from either kind of on, and back on to what "on" meant', () => {
    expect(cloudToggleTarget(status('full', 'full'))).toBe('mac');
    expect(cloudToggleTarget(status('all', 'all'))).toBe('mac');
    expect(cloudToggleTarget(status('mac', 'all'))).toBe('all');
    expect(cloudToggleTarget(status('mac', 'full'))).toBe('full');
    // A Mac that never said: when this Mac is full, the gentler one.
    expect(cloudToggleTarget(status('mac', undefined))).toBe('full');
  });

  it('a note says what just happened, in words that name the place', () => {
    expect(cloudToggleNote('mac')).toBe('Cloud off: new threads run on this Mac');
    expect(cloudToggleNote('full')).toBe('Cloud on: threads that don’t fit here start in the cloud');
    expect(cloudToggleNote('all')).toBe('Cloud on: everything starts in the cloud');
  });

  it('what "on" means is the two choices, in this order', () => {
    expect(CLOUD_WHEN_ON.map((c) => [c.id, c.label])).toEqual([['full', 'When this Mac is full'], ['all', 'Everything']]);
  });
});

describe('the key', () => {
  it('is C, said on the button and on the shortcuts page under anywhere', () => {
    expect(CLOUD_KEY).toBe('C');
    expect(HINTS.cloud).toEqual([{ key: 'C', what: 'Cloud on or off' }]);
    const anywhere = SHORTCUTS.find((g) => g.label === 'Anywhere in the app');
    expect(anywhere.keys.some((k) => k.keys.includes('C'))).toBe(true);
    const button = read('../renderer/src/threads/Pages.tsx');
    expect(button).toMatch(/data-hint="cloud" data-hint-align="right"/);
  });

  it('flips the cloud on the list, in an open thread and on a teammate\'s card, and N alone starts a thread', () => {
    const app = read('../renderer/src/App.tsx');
    expect(app.match(/toggleCloudRef\.current\?\.\(\)/g)).toHaveLength(3);
    expect(app).toMatch(/case 'c': case 'C': e\.preventDefault\(\); toggleCloudRef\.current\?\.\(\); break;/);
    expect(app).toMatch(/case 'n': case 'N': e\.preventDefault\(\); setModal\('compose'\); break;/);
    expect(app).not.toMatch(/e\.key === 'c' \|\| e\.key === 'C' \|\| e\.key === 'n'/);
  });
});

describe('the command bar', () => {
  it('turns the cloud on or off with C beside it, and offers each meaning of on', () => {
    const on = cloudCommands(status('full', 'full'));
    expect(on.map((r) => [r.label, r.mode, r.keyHint ?? null, r.hint ?? null])).toEqual([
      ['Turn the cloud off', 'mac', 'C', null],
      ['Cloud on: when this Mac is full', 'full', null, 'On now'],
      ['Cloud on: everything', 'all', null, null],
    ]);
    const off = cloudCommands(status('mac', 'all'));
    expect(off[0]).toMatchObject({ label: 'Turn the cloud on', mode: 'all', keyHint: 'C' });
    expect(off.filter((r) => r.hint)).toEqual([]);
  });

  it('is wired to the app\'s own cloud, so the rows are there only once it is set up', () => {
    const app = read('../renderer/src/App.tsx');
    expect(app).toMatch(/cloud=\{snap\.cloud\?\.setUp \? snap\.cloud : null\}/);
    expect(read('../renderer/src/components/Palette.tsx')).toMatch(/cloudCommands\(cloud\)/);
  });
});

describe('what "on" means is kept', () => {
  let dir; let config; let supervisor;
  beforeEach(() => {
    dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cloudonoff-')));
    config = { home: dir, appDir: dir, storeRoot: dir, authProfiles: ['default'] };
    supervisor = new Supervisor(config, { listItems: () => [], listProducts: () => [], isDue: () => true, settleAnswer() {}, readItem: () => null }, dir);
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const set = (key, value) => setWorkspaceSetting({ config, supervisor }, { key, value });
  const onDisk = () => JSON.parse(fs.readFileSync(path.join(dir, 'zero.config.json'), 'utf8'));

  it('while on, choosing it moves threads there at once', () => {
    set('cloudRuns', 'full');
    set('cloudWhenOn', 'all');
    expect(onDisk()).toMatchObject({ cloudRuns: 'all', cloudWhenOn: 'all' });
    expect(supervisor.cloudStatus().whenOn).toBe('all');
  });

  it('while off, choosing it is remembered and leaves the cloud off', () => {
    set('cloudRuns', 'mac');
    set('cloudWhenOn', 'all');
    expect(onDisk()).toMatchObject({ cloudRuns: false, cloudWhenOn: 'all' });
    expect(supervisor.cloudStatus()).toMatchObject({ mode: 'mac', whenOn: 'all' });
  });

  it('turning it on takes what was remembered, and nothing but the two meanings is kept', () => {
    set('cloudRuns', 'mac');
    set('cloudWhenOn', 'all');
    set('cloudRuns', 'all');
    expect(supervisor.cloudStatus()).toMatchObject({ mode: 'all', whenOn: 'all' });
    expect(() => set('cloudWhenOn', 'mac')).toThrow();
    expect(supervisor.cloudStatus().whenOn).toBe('all');
  });

  it('a Mac that never chose means when this Mac is full', () => {
    expect(supervisor.cloudStatus().whenOn).toBe('full');
  });
});
