// THE CLAUDE CODE PAGE DRAWS EACH ACCOUNT ONCE, WITH REFRESH OVER ALL OF THEM.
//
// What was said (2026-10-21, with a screenshot of Settings › Claude Code):
// "Quite often the accounts are out of sync. The refresh button refreshes all
// of them so I don't know why it's in that position." The page drew a Cloud
// card and a This computer card, each with a tile per account, so two
// subscriptions were four tiles with two sets of numbers, and Refresh sat on
// the second card though it read both. Five layouts later: "most of these
// still confuse me/look ugly ... just making one very good design".
//
// The page now has one "Signed in" group, a tile per account with Refresh at
// its head, then the cloud as one row with a switch and a sentence saying
// when threads go there and on which accounts.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cloudRunsLine } from '../renderer/src/components/Settings';

const settings = fs.readFileSync(new URL('../renderer/src/components/Settings.tsx', import.meta.url), 'utf8');
const page = settings.slice(settings.indexOf('const enginePage = (engine'), settings.indexOf('<div className="set-nav">'));
const claude = page.slice(page.indexOf("engine === 'claude' ? ("), page.indexOf('<Group id="accounts"'));

describe('the Claude Code page', () => {
  it('the reported case:one group of tiles, every account in it, with Refresh at its head', () => {
    expect(claude.match(/<Place\b/g)).toHaveLength(1);
    expect(claude).toMatch(/name="Signed in"[\s\S]*readAccounts\(true\)[\s\S]*accounts=\{tiles\}/);
  });

  it('IN USE sits beside the address, and must NOT be pushed to the right margin, where it was missed', () => {
    const css = fs.readFileSync(new URL('../renderer/src/components/settings.css', import.meta.url), 'utf8');
    const rule = css.slice(css.indexOf('.acct-tile-head .set-badge {'), css.indexOf('}', css.indexOf('.acct-tile-head .set-badge {')));
    expect(rule).toContain('.acct-tile-head .set-badge {');
    expect(rule).not.toMatch(/margin-left:\s*auto/);
    expect(css).toMatch(/\.set-ghost\.acct-switch \{[^}]*margin: -4px 0 -4px auto/);
  });

  it('the cloud is one row with a switch, not a second set of tiles', () => {
    expect(claude).toMatch(/<Group id="cloud-accounts" label="Cloud">\s*<Row label="Use the cloud"/);
    expect(claude).toContain('cloudToggleTarget(cloudHere)');
    expect(page).toContain("const cloudCard = cloudHere && engine === 'codex' && (");
  });
});

describe('the cloud row’s sentence', () => {
  it('the reported case:on first, on both accounts', () => {
    expect(cloudRunsLine('all', ['a@example.test', 'b@example.test'], 2)).toBe('Threads start there first, on both accounts in turn.');
  });

  it('when this computer is full, and off', () => {
    expect(cloudRunsLine('full', ['a@example.test', 'b@example.test'], 2)).toBe('Threads start there when this computer is full, on both accounts in turn.');
    expect(cloudRunsLine('mac', ['a@example.test', 'b@example.test'], 2)).toBe('Every thread runs on this computer.');
  });

  it('one account is named, never counted', () => {
    expect(cloudRunsLine('all', ['a@example.test'], 1)).toBe('Threads start there first, on a@example.test.');
    expect(cloudRunsLine('all', ['a@example.test'], 3)).toBe('Threads start there first, on a@example.test.');
  });

  it('must NOT say both, or all, when the cloud holds only some of the accounts', () => {
    expect(cloudRunsLine('all', ['a@example.test', 'b@example.test'], 3)).toBe('Threads start there first, on a@example.test and b@example.test in turn.');
    expect(cloudRunsLine('all', ['a', 'b', 'c'], 3)).toBe('Threads start there first, on all 3 accounts in turn.');
  });
});
