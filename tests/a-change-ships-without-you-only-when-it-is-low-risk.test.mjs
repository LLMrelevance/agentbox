// A CHANGE SHIPS WITHOUT A PERSON ONLY WHEN IT IS LOW RISK (w-e4930b254c).
//
// Every task used to wait for the person to say "ship it", including docs,
// tests and fixes nobody needed to look at. Their time is the bottleneck, so
// the ship script now sets a tier from the change itself, never from what the
// agent says about it: low ships alone, anything that could look different on
// screen waits for them to look, and risky paths always wait for them.
//
// Pinned here: what the rules decide without asking anyone, that the
// Decisions API is asked only about the rest and only trusted when sure, that
// an unreachable classifier never lets a change through, that an approval
// covers the commit it was given for and nothing added after it, and that
// shadow mode never holds a ship back.
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { rulesTier, classify, shipVerdict, approvalCovers, readFacts, readGate } from '../scripts/lib/risk-tier.mjs';

const file = (p, { status = 'M', added = [], removed = [] } = {}) => ({ path: p, status, added, removed });
const facts = (...files) => ({ files, messages: 'A change' });
const lines = (n, text = 'x') => Array.from({ length: n }, (_, i) => `${text}${i}`);
const sure = (choice, confidence) => vi.fn(async () => ({ choice, confidence, runnersUp: [], ms: 1 }));

describe('the rules decide without asking anyone', () => {
  it('docs and new tests are low', () => {
    expect(rulesTier(facts(file('docs/team/PLAN.md', { added: ['a line'] }))).tier).toBe('low');
    expect(rulesTier(facts(file('tests/x-works.test.mjs', { status: 'A', added: ['expect(1).toBe(1)'] }))).tier).toBe('low');
    expect(rulesTier(facts(file('scripts/shot-the-board.mjs', { status: 'A', added: ['// a picture'] }))).tier).toBe('low');
  });

  it('a test that lost a line goes to the classifier, because a weakened assertion is how red turns green', () => {
    expect(rulesTier(facts(file('tests/x-works.test.mjs', { added: ['expect(1).toBe(1)'], removed: ['expect(2).toBe(2)'] }))).tier).toBe(null);
  });

  it('a deleted test is risky', () => {
    const r = rulesTier(facts(file('tests/x-works.test.mjs', { status: 'D', removed: ['it()'] })));
    expect(r.tier).toBe('risky');
    expect(r.reasons.join(' ')).toMatch(/deletes a test/);
  });

  it('the paths that always need a person are risky whatever is in them', () => {
    for (const p of ['scripts/ship.mjs', 'scripts/hooks/pre-push', '.github/workflows/tests.yml', 'main/ship-queue.mjs', 'main/store.mjs',
      'shared/harness-definitions.mjs', 'main/harnesses/claude.mjs', 'main/updater.mjs', 'scripts/release.mjs', 'main/team/sign-in.mjs',
      'cloud/supabase/schema.sql', 'scripts/check-before-public.mjs', 'package-lock.json', 'CLAUDE.md', '.claude/skills/unslop/SKILL.md',
      'scripts/risk-gate.json', 'scripts/lib/risk-tier.mjs', 'tests/no-worker-drives-her-own-browser.test.mjs', 'worker-permissions.json']) {
      expect(rulesTier(facts(file(p, { added: ['a'] }))).tier, p).toBe('risky');
    }
  });

  it('a look-alike path is not on that list', () => {
    expect(rulesTier(facts(file('scripts/shipping-notes.mjs', { added: ['a'] }))).tier).toBe(null);
    expect(rulesTier(facts(file('tests/main-store-reads.test.mjs', { status: 'A', added: ['a'] }))).tier).toBe('low');
  });

  it('a line that touches keys, the browser flag, spawning or deleting is risky in any file', () => {
    for (const line of ["args.push('--chrome')", 'env.OPENAI_API_KEY = key', "spawn('claude', args)", 'fs.rmSync(dir, { recursive: true })', "git('push', '--force')"]) {
      expect(rulesTier(facts(file('main/supervisor.mjs', { added: [line] }))).tier, line).toBe('risky');
    }
    expect(rulesTier(facts(file('main/supervisor.mjs', { removed: ["scrub: ['^ANTHROPIC_']"] }))).tier).toBe('risky');
  });

  it('those words in a comment do not make it risky, because a comment changes nothing', () => {
    for (const line of ['  // keeps CODEX_HOME out of the worker', ' * the billing scrub', '/* spawn( */', '# OPENAI_API_KEY']) {
      expect(rulesTier(facts(file('main/supervisor.mjs', { added: [line] }))).tier, line).toBe(null);
    }
    expect(rulesTier(facts(file('main/supervisor.mjs', { added: ['env.CODEX_HOME = dir; // a home'] }))).tier).toBe('risky');
  });

  it('those words inside a test or a doc do not make it risky', () => {
    expect(rulesTier(facts(file('tests/x.test.mjs', { status: 'A', added: ["spawn('claude')"] }))).tier).toBe('low');
    expect(rulesTier(facts(file('docs/a.md', { added: ['never pass --chrome'] }))).tier).toBe('low');
  });

  it('styles, html and pictures in the window are for a person to look at', () => {
    expect(rulesTier(facts(file('renderer/src/styles.css', { added: ['gap: 4px'] }))).tier).toBe('look');
    expect(rulesTier(facts(file('renderer/index.html', { added: ['<div>'] }))).tier).toBe('look');
    expect(rulesTier(facts(file('renderer/src/assets/icon.svg', { added: ['<svg>'] }))).tier).toBe('look');
  });

  // The phone app (docs/mobile/PLAN.md): its screens are looked at, and how it
  // signs in, keeps a sign-in, asks for alerts, is built or what it depends on
  // always needs a person. Its plain logic is left to the classifier.
  it('the phone app\'s screens are looked at, and its sign-in, keychain, alerts and build need a person', () => {
    for (const p of ['mobile/src/app/index.tsx', 'mobile/src/app/thread/[product]/[id].tsx', 'mobile/src/ui/parts.tsx', 'mobile/assets/icon.png']) {
      expect(rulesTier(facts(file(p, { added: ['<View />'] }))).tier, p).toBe('look');
    }
    for (const p of ['mobile/src/platform/sign-in.ts', 'mobile/src/platform/persist.ts', 'mobile/src/platform/alerts.ts', 'mobile/eas.json', 'mobile/app.config.ts', 'mobile/package.json', 'mobile/package-lock.json']) {
      expect(rulesTier(facts(file(p, { added: ['a'] }))).tier, p).toBe('risky');
    }
    expect(rulesTier(facts(file('mobile/src/lib/tabs.ts', { added: ['const a = 1;'] }))).tier).toBe(null);
  });

  it('a renderer component goes to the classifier: one word of copy is not a design decision', () => {
    expect(rulesTier(facts(file('renderer/src/App.tsx', { added: ['<p>Close</p>'], removed: ['<p>Shut</p>'] }))).tier).toBe(null);
  });

  it('a change over the size limit is risky, counting code and not tests or docs', () => {
    expect(rulesTier(facts(file('main/a.mjs', { added: lines(601) })), { maxLines: 600 }).tier).toBe('risky');
    expect(rulesTier(facts(file('main/a.mjs', { added: lines(600) })), { maxLines: 600 }).tier).toBe(null);
    expect(rulesTier(facts(file('main/a.mjs', { added: lines(10) }), file('tests/a.test.mjs', { status: 'A', added: lines(900) })), { maxLines: 600 }).tier).toBe(null);
  });

  it('the strictest file wins', () => {
    const r = rulesTier(facts(file('docs/a.md', { added: ['a'] }), file('renderer/src/a.css', { added: ['a'] }), file('scripts/ship.mjs', { added: ['a'] })));
    expect(r.tier).toBe('risky');
  });
});

describe('the classifier is asked about the rest, and trusted only when sure', () => {
  const code = facts(file('main/staleness.mjs', { added: ['return a + 1;'], removed: ['return a;'] }));

  it('is not asked when the rules already know', async () => {
    const decideImpl = sure('low', 0.99);
    const r = await classify(facts(file('docs/a.md', { added: ['a'] })), { decideImpl });
    expect(r.tier).toBe('low');
    expect(r.by).toBe('rules');
    expect(decideImpl).not.toHaveBeenCalled();
  });

  it('sends the diff and the three tiers, and takes a sure low', async () => {
    const decideImpl = sure('low', 0.9);
    const r = await classify(code, { decideImpl, sureAt: 0.85 });
    expect(r).toMatchObject({ tier: 'low', by: 'classifier', confidence: 0.9 });
    const [{ input, options }] = decideImpl.mock.calls[0];
    expect(input).toContain('main/staleness.mjs');
    expect(input).toContain('+return a + 1;');
    expect(options.map((o) => o.value)).toEqual(['low', 'look', 'risky']);
  });

  it('takes a low exactly at the bar and moves one just under it up a tier', async () => {
    expect((await classify(code, { decideImpl: sure('low', 0.85), sureAt: 0.85 })).tier).toBe('low');
    const under = await classify(code, { decideImpl: vi.fn(async () => ({ choice: 'low', confidence: 0.84, runnersUp: [{ value: 'look', probability: 0.1 }, { value: 'risky', probability: 0.06 }] })), sureAt: 0.85 });
    expect(under.tier).toBe('look');
    expect(under.reasons.join(' ')).toMatch(/not sure/);
  });

  it('an unsure low with no runner-up goes to a person', async () => {
    expect((await classify(code, { decideImpl: sure('low', 0.5), sureAt: 0.85 })).tier).toBe('risky');
    expect((await classify(code, { decideImpl: sure('low', null), sureAt: 0.85 })).tier).toBe('risky');
  });

  it('takes look and risky at any confidence', async () => {
    expect((await classify(code, { decideImpl: sure('look', 0.4) })).tier).toBe('look');
    expect((await classify(code, { decideImpl: sure('risky', 0.4) })).tier).toBe('risky');
  });

  it('never lets a change through when the classifier cannot be reached', async () => {
    const r = await classify(code, { decideImpl: async () => { throw new Error('No OpenAI key in the Keychain under "OPENAI_API_KEY".'); } });
    expect(r.tier).toBe('risky');
    expect(r.reasons.join(' ')).toMatch(/could not ask the classifier/);
  });

  it('cuts a long diff and says so', async () => {
    const decideImpl = sure('look', 0.9);
    await classify(facts(file('main/a.mjs', { added: lines(500, 'y'.repeat(200)) })), { decideImpl, maxLines: 10_000 });
    const [{ input }] = decideImpl.mock.calls[0];
    expect(input.length).toBeLessThan(40_000);
    expect(input).toMatch(/cut here/);
  });
});

describe('what the gate does with the tier', () => {
  it('in shadow mode ships everything and says what it would have done', () => {
    const v = shipVerdict({ mode: 'shadow', tier: 'risky', approved: false, reasons: ['touches scripts/ship.mjs'] });
    expect(v.ship).toBe(true);
    expect(v.say).toMatch(/shadow/);
    expect(v.say).toMatch(/would have held/);
  });

  it('when live ships low alone, and holds the rest until a person approved this commit', () => {
    expect(shipVerdict({ mode: 'live', tier: 'low', approved: false, reasons: [] }).ship).toBe(true);
    expect(shipVerdict({ mode: 'live', tier: 'look', approved: true, reasons: [] }).ship).toBe(true);
    const held = shipVerdict({ mode: 'live', tier: 'look', approved: false, reasons: ['could change the board'] });
    expect(held.ship).toBe(false);
    expect(held.say).toMatch(/refused to ship without a person/);
    expect(held.say).toMatch(/npm run ship:approved/);
    expect(shipVerdict({ mode: 'live', tier: 'risky', approved: false, reasons: [] }).ship).toBe(false);
  });

  it('an unknown mode is shadow, never live', () => {
    expect(shipVerdict({ mode: 'yes', tier: 'risky', approved: false, reasons: [] }).ship).toBe(true);
  });
});

describe('an approval covers the commit it was given for', () => {
  it('covers that commit, and merges of main made after it', () => {
    expect(approvalCovers({ approvedSha: 'abc', head: 'abc', ownCommitsSince: [] })).toBe(true);
    expect(approvalCovers({ approvedSha: 'abc', head: 'def', ownCommitsSince: [] })).toBe(true);
  });

  it('does not cover a commit the agent made after it, or no approval at all', () => {
    expect(approvalCovers({ approvedSha: 'abc', head: 'def', ownCommitsSince: ['def'] })).toBe(false);
    expect(approvalCovers({ approvedSha: null, head: 'abc', ownCommitsSince: [] })).toBe(false);
    expect(approvalCovers({ approvedSha: 'abc', head: 'def', ownCommitsSince: null })).toBe(false);
  });
});

describe('reading a real branch and the gate file', () => {
  it('reads what the branch changed, deletions included, and not what main changed', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'risk-'));
    const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
    git('init', '-q', '-b', 'main');
    fs.mkdirSync(path.join(dir, 'tests'));
    fs.writeFileSync(path.join(dir, 'a.mjs'), 'one\n');
    fs.writeFileSync(path.join(dir, 'tests/old.test.mjs'), 'it()\n');
    git('add', '.'); git('commit', '-qm', 'base');
    git('checkout', '-qb', 'work');
    fs.writeFileSync(path.join(dir, 'a.mjs'), 'two\n');
    fs.rmSync(path.join(dir, 'tests/old.test.mjs'));
    git('add', '-A'); git('commit', '-qm', 'Change a and drop a test');
    git('checkout', '-q', 'main');
    fs.writeFileSync(path.join(dir, 'b.mjs'), 'main moved\n');
    git('add', '.'); git('commit', '-qm', 'main moved');
    git('checkout', '-q', 'work');

    const f = readFacts(dir, 'main');
    expect(f.files.map((x) => [x.path, x.status]).sort()).toEqual([['a.mjs', 'M'], ['tests/old.test.mjs', 'D']]);
    expect(f.files.find((x) => x.path === 'a.mjs')).toMatchObject({ added: ['two'], removed: ['one'] });
    expect(f.messages).toContain('Change a and drop a test');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('a renamed test is not a deleted one', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'risk-'));
    const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
    git('init', '-q', '-b', 'main');
    fs.mkdirSync(path.join(dir, 'tests'));
    fs.writeFileSync(path.join(dir, 'tests/old-name.test.mjs'), lines(20).join('\n'));
    git('add', '.'); git('commit', '-qm', 'base');
    git('checkout', '-qb', 'work');
    git('mv', 'tests/old-name.test.mjs', 'tests/new-name.test.mjs');
    git('commit', '-qm', 'Rename');
    const f = readFacts(dir, 'main');
    expect(f.files).toEqual([{ path: 'tests/new-name.test.mjs', status: 'R', added: [], removed: [] }]);
    expect(rulesTier(f).tier).toBe('low');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('a missing or broken gate file is shadow', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-'));
    expect(readGate(path.join(dir, 'none.json')).mode).toBe('shadow');
    fs.writeFileSync(path.join(dir, 'g.json'), '{ not json');
    expect(readGate(path.join(dir, 'g.json')).mode).toBe('shadow');
    fs.writeFileSync(path.join(dir, 'g.json'), '{"mode":"live","sureAt":0.9}');
    expect(readGate(path.join(dir, 'g.json'))).toMatchObject({ mode: 'live', sureAt: 0.9, maxLines: 600 });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('the committed gate starts in shadow', () => {
    expect(readGate(new URL('../scripts/risk-gate.json', import.meta.url)).mode).toBe('shadow');
  });
});
