// THE PRE-DEPLOY CHECK RUNS WHAT A CHANGE NEEDS, AND THE MACHINES IT BUILDS ARE THE MACHINES IT SAYS.
//
// Why this exists (w-4401acca50, 2026-10-11): most bugs that reached people were
// about their Mac, not the code — where Claude Code or Codex was installed, which
// shell, what PATH an app opened from the Dock sees — and the unit tests run on
// the Mac the code was written on, so they stayed green while those shipped.
// .claude/skills/verify-agentbox/scripts/verify.mjs is the check that runs before
// a deploy: fake Macs unlike this one, this Mac for real, and a live copy of the
// app driven by keyboard.
//
// Two things here must not drift. Which layers a branch gets (`layersFor`): too
// narrow and a change to how Codex is found ships without the machine check,
// too wide and every docs fix waits on a browser. And the fake machines
// themselves: a shape whose stub is not where it claims, or a fake root that
// lets this Mac's own installs answer, proves nothing about anybody else's Mac.
// Measured when written: the full machine check took 35 s for 16 shapes on a
// loaded Mac, and the live layer about 40 s, so neither runs in this suite; the
// one shape run below takes about a second.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { layersFor, DRIVE_ORDER } from '../.claude/skills/verify-agentbox/scripts/verify.mjs';
import { SHAPES, build } from '../.claude/skills/verify-agentbox/scripts/machines.mjs';

const runs = (files, opts) => Object.fromEntries(Object.entries(layersFor(files, opts)).map(([k, v]) => [k, v.run]));

describe('which layers a branch gets', () => {
  it('a change to how Codex is found runs the machine check and the live drive', () => {
    expect(runs(['main/codex-bin.mjs'])).toEqual({ 'this-machine': true, machines: true, live: true });
  });

  it('every file that decides how a tool is found or started counts', () => {
    for (const f of ['main/shell-path.mjs', 'main/claude-bin.mjs', 'main/codex-launch-env.mjs', 'main/harnesses/common.mjs', 'main/harnesses.mjs', 'main/config.mjs', 'package.json']) {
      expect(runs([f]).machines, f).toBe(true);
    }
  });

  it('a screen change runs the live drive but not the machine check', () => {
    expect(runs(['renderer/src/threads/ThreadComposer.tsx'])).toEqual({ 'this-machine': true, machines: false, live: true });
  });

  it('a change to the stand-in worker or the skill re-proves the drive', () => {
    expect(runs(['scripts/lib/stub-claude-worker.mjs']).live).toBe(true);
    expect(runs(['.claude/skills/verify-agentbox/scripts/drives.mjs']).live).toBe(true);
    expect(runs(['.claude/skills/verify-agentbox/scripts/machines.mjs']).machines).toBe(true);
  });

  it('docs, tests and one-off scripts get only the two-second layer', () => {
    expect(runs(['docs/team/PLAN.md', 'tests/a-bare-week-means-one-week.test.mjs', 'scripts/scratch/x.mjs', 'README.md']))
      .toEqual({ 'this-machine': true, machines: false, live: false });
  });

  it('does not match a path that only starts with a product folder\'s name', () => {
    expect(runs(['docs/main/notes.md', 'mainline.md', 'renderer-notes.md', 'tests/main/claude-bin.test.mjs']))
      .toEqual({ 'this-machine': true, machines: false, live: false });
  });

  it('--all runs everything, whatever changed', () => {
    expect(runs([], { all: true })).toEqual({ 'this-machine': true, machines: true, live: true });
  });

  it('every drive the check runs exists', async () => {
    const src = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', '.claude/skills/verify-agentbox/scripts/drives.mjs'), 'utf8');
    for (const d of DRIVE_ORDER) expect(src).toContain(`'${d}': {`);
  });
});

describe('the fake machines', () => {
  it('every shape has a unique name, a reason, and an expectation for both tools', () => {
    const names = SHAPES.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    for (const s of SHAPES) {
      expect(String(s.why ?? '').split(/\s+/).length, s.name).toBeGreaterThan(5);
      expect(s.expect.claude, s.name).toBeTruthy();
      expect(s.expect.codex, s.name).toBeTruthy();
    }
  });

  it('lays a shape out where it says, and reads system folders from the fake root, not this Mac', () => {
    const shape = SHAPES.find((s) => s.name === 'homebrew-apple-silicon');
    const m = build(shape);
    try {
      expect(m.virtual.exists('/opt/homebrew/bin/claude')).toBe(true);
      expect(fs.realpathSync(m.toReal('/opt/homebrew/bin/claude'))).toContain(path.join('sys', 'opt', 'homebrew', 'Caskroom'));
      // A folder the shape did not create is absent, even if this Mac has it.
      expect(m.virtual.exists('/usr/local/bin/node')).toBe(false);
      expect(m.virtual.exists('/bin/sh')).toBe(true);
      expect(m.launchEnv.PATH).toBe('/usr/bin:/bin:/usr/sbin:/sbin');
      expect(m.launchEnv.HOME).toBe(m.home);
    } finally {
      fs.rmSync(m.root, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform === 'darwin')('the installer-defaults Mac finds and starts both tools through the app\'s own modules', async () => {
    const { checkShape } = await import('../.claude/skills/verify-agentbox/scripts/check-machines.mjs');
    const r = await checkShape(SHAPES.find((s) => s.name === 'installer-defaults'));
    expect(r.wrong).toEqual([]);
    expect(r.claude).toMatchObject({ found: true, runs: true });
    expect(r.codex).toMatchObject({ found: true, runs: true });
  }, 30_000);
});
