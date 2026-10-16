// WHERE THREADS RUN HAS A KEY, AND THE CLOUD MENU SHOWS USE WITHOUT A PRICE.
//
// What she said (2026-10-16): hovering the cloud button "doesn't show me the
// keyboard shortcut", and the two moves she wants are different ones: send
// everything to the cloud, or only the threads this Mac has no room for.
// Measured by reading the code that day: the button's title was "Where threads
// run" with no key, no key opened it, and ⌘K had no command for it.
//
// And: "people are on different plans so we don't want to show pricing to the
// end user ... how much they've used is really good to include, just not the
// pricing." The menu read "0.2 agent-hours · about $0.01".
//
// Now W opens the menu, its plate says so, 1 2 3 pick inside it, and ⌘K has a
// command for each choice. The month line is hours only.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { cloudMonthLine, CLOUD_KEY, cloudModeForKey, cloudCommands } from '../renderer/src/cloud-menu';
import { HINTS } from '../renderer/src/hint-plate';
import { SHORTCUTS } from '../shared/shortcuts.mjs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

describe('this month\'s use', () => {
  it('is hours, and never a price, whatever the runs cost', () => {
    expect(cloudMonthLine({ runs: 4, agentHours: 12.4, estimatedCost: 1.372, costPerAgentHour: 0.11 })).toBe('12.4 agent-hours');
    expect(cloudMonthLine({ runs: 1, agentHours: 0.2, estimatedCost: 0.01, costPerAgentHour: 0.05 })).toBe('0.2 agent-hours');
    expect(cloudMonthLine({ runs: 0, agentHours: 0, estimatedCost: 0, costPerAgentHour: null })).toBe('Nothing in the cloud yet this month');
  });
  it('nothing in the menu prints a dollar sign', () => {
    const button = read('../renderer/src/threads/Pages.tsx');
    const menu = button.slice(button.indexOf('function CloudButton'), button.indexOf('export function DisplayMenu'));
    expect(menu).not.toMatch(/\$\{?[^{]*estimatedCost|about \$/);
  });
});

describe('the key', () => {
  // Said on the button's plate, where she looked for it. Not on the shortcuts
  // page: its inbox group is at its limit of seven, and the button is the
  // only place the key does anything.
  it('is W, said on the button\'s plate', () => {
    expect(CLOUD_KEY).toBe('W');
    expect(HINTS.cloud).toEqual([{ key: 'W', what: 'Where threads run' }]);
    const button = read('../renderer/src/threads/Pages.tsx');
    expect(button).toMatch(/className=\{`th-disp th-cloud[^`]*`\}[\s\S]{0,200}data-hint="cloud"/);
  });
  it('is a letter nothing else in the inbox uses', () => {
    const keys = SHORTCUTS.flatMap((g) => g.keys).flatMap((k) => k.keys);
    expect(keys.map((k) => k.toUpperCase())).not.toContain('W');
    const app = read('../renderer/src/App.tsx');
    expect(app).toMatch(/case 'w': case 'W':[^\n]*openCloudMenu\(\)/);
  });
  it('then 1, 2 or 3 picks a choice, in the order the menu shows them, and nothing else does', () => {
    expect(cloudModeForKey('1')).toBe('mac');
    expect(cloudModeForKey('2')).toBe('full');
    expect(cloudModeForKey('3')).toBe('all');
    for (const k of ['0', '4', '9', 'w', 'Enter']) expect(cloudModeForKey(k)).toBe(null);
  });
});

describe('the command bar', () => {
  it('has one command for each choice, the one in use saying so', () => {
    const rows = cloudCommands('full');
    expect(rows.map((r) => r.mode)).toEqual(['all', 'full', 'mac']);
    expect(rows.map((r) => r.label)).toEqual(['Run everything in the cloud', 'Run threads in the cloud when this Mac is full', 'Run threads on this Mac only']);
    expect(rows.find((r) => r.mode === 'full').hint).toBe('on now');
    expect(rows.filter((r) => r.hint === 'on now')).toHaveLength(1);
    const palette = read('../renderer/src/components/Palette.tsx');
    expect(palette).toMatch(/cloudCommands\(cloudMode\)/);
  });
});
