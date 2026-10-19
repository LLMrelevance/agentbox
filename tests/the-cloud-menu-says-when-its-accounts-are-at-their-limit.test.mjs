// THE CLOUD MENU SAYS WHEN ITS ACCOUNTS ARE AT THEIR LIMIT, AND UNTIL WHEN.
//
// What happened (2026-10-16, 8:13pm): she wrote "our cloud must be broken
// given only a few of my agents are running". Nothing was broken: both cloud
// accounts had hit their session limit at 7:01pm and were benched until
// 10:10pm (main/cloud/logins.mjs 'limited'), so every thread ran on the one
// free login on this Mac, five at a time, and fourteen waited. The menu said
// only "Nothing running in the cloud now".
//
// Now the menu's last line says the accounts are at their limit and when they
// come back, while every one of them is; otherwise it says what runs there.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { cloudFootLine } from '../renderer/src/cloud-menu';

const at = (h, m) => { const d = new Date(2026, 9, 16, h, m, 0, 0); return d.getTime(); };
const now = at(20, 13);
const acct = (key, limitedUntil = null) => ({ engine: 'claude', key, name: null, ready: !limitedUntil, state: limitedUntil ? 'limited' : 'ready', limitedUntil });
const cloud = (accounts, running = 0, mode = 'all') => ({ setUp: true, mode, whenOn: 'all', running, accounts, signIns: [], month: { runs: 0, agentHours: 0 } });

describe('the last line of the cloud menu', () => {
  it('says every account is at its limit, and when the first comes back', () => {
    const line = cloudFootLine(cloud([acct('a', at(22, 10)), acct('b', at(22, 40))]), now);
    expect(line).toBe('Your cloud accounts are at their usage limit until 10:10pm. Threads wait for the cloud until then.');
  });

  it('says what runs there while any account can still run', () => {
    expect(cloudFootLine(cloud([acct('a', at(22, 10)), acct('b')], 2), now)).toBe('2 running in the cloud now');
    expect(cloudFootLine(cloud([acct('a')]), now)).toBe('Nothing running in the cloud now');
  });

  it('forgets a limit that has passed, and says nothing of limits with the cloud off', () => {
    expect(cloudFootLine(cloud([acct('a', at(20, 0))]), now)).toBe('Nothing running in the cloud now');
    expect(cloudFootLine(cloud([acct('a', at(22, 10))], 0, 'mac'), now)).toBe('Nothing running in the cloud now');
  });

  it('is what the menu draws, and the app hands the screen each account\'s limit', () => {
    expect(fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8')).toMatch(/<span>\{cloudFootLine\(cloud\)\}<\/span>/);
    expect(fs.readFileSync(new URL('../main/supervisor.mjs', import.meta.url), 'utf8')).toMatch(/limitedUntil: r\.limitedUntil \?\? null/);
  });
});
