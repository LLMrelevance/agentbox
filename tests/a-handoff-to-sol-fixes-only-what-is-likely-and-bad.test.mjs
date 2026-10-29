// A HANDOFF TO SOL FIXES ONLY WHAT IS LIKELY AND BAD.
//
// w-ca34944396, 2026-10-29. Changes written by Claude are handed to Codex
// (gpt-6.1-sol) to test and review, and the reviewer flags bugs that are
// possible but almost never happen. Claude fixes each, the reviewer finds the
// next, and the loop never ends. The `handoff` skill makes the reviewer score
// every finding (how often x how bad, 1 to 10 each), fixes only products of 5
// or more, files the rest, and stops after two rounds. Before this test there
// was no handoff skill and nothing in CLAUDE.md or interrogate about rare cases.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const skill = () => read('.claude', 'skills', 'handoff', 'SKILL.md');
const codexCalls = () => skill().split('\n').filter((l) => /^\s*codex exec /.test(l));

describe('the handoff skill', () => {
  it('exists and can be picked when someone says "hand this to Sol"', () => {
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(skill())[1];
    expect(fm).toMatch(/^name: handoff$/m);
    expect(fm).not.toMatch(/disable-model-invocation/);
  });

  it('hands the change to gpt-6.1-sol, able to run tests but not with full access', () => {
    const calls = codexCalls();
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).toMatch(/ -m gpt-6\.1-sol /);
      expect(call).toMatch(/ -s workspace-write /);
      expect(call).not.toMatch(/danger-full-access|dangerously/);
    }
  });

  it('never hands Codex a key', () => {
    expect(skill()).not.toMatch(/(OPENAI|ANTHROPIC)_API_KEY=/);
  });

  it('fixes a finding scoring 5 or more and leaves the code alone below 5', () => {
    const text = skill();
    expect(text).toMatch(/how often/i);
    expect(text).toMatch(/how bad/i);
    expect(text).toMatch(/5 or more/);
    expect(text).toMatch(/below 5/);
    expect(text).toMatch(/leave the code alone/i);
  });

  it('stops after two rounds', () => {
    expect(skill()).toMatch(/two rounds/i);
  });
});

describe('the same rule everywhere a change is reviewed or fixed', () => {
  it('tells every agent in CLAUDE.md not to build for cases nobody asked about', () => {
    expect(read('CLAUDE.md')).toContain('Do not design for rare or future cases nobody asked about.');
  });

  it('asks the interrogate reviewers for the same two scores', () => {
    const text = read('.claude', 'skills', 'interrogate', 'SKILL.md');
    expect(text).toMatch(/how often/i);
    expect(text).toMatch(/how bad/i);
  });
});
