// TWO ROUNDS OF UNSLOP STILL READ AS MACHINE-MADE, BECAUSE IT ONLY CHECKED WORDS.
//
// w-32efa85cd6, 2026-10-21. The skill caught slop words, em dashes and
// sentences that point at other sentences, and the guide pages passed it twice.
// The maintainer read the result anyway as "really incoherent speech... it
// starts on a sentence fragment or a command that doesn't really make sense,
// and then it overuses things like colons".
//
// Measuring eight pieces by writers the dev world reads (Julia Evans, Simon
// Willison, Dan Luu) against the six pages said why, and none of it was
// vocabulary:
//   - first person 44.9 per 1,000 words in theirs against 1.3 in ours, so
//     nobody was speaking;
//   - 0.0% of their sentences open with a bare command against our 5.0%;
//   - mean sentence 21.8 against our 14.9, a monotone rhythm.
//
// The skill also told agents colons were fine before a list, which contradicts
// her own standing rule across about 930 threads: "no colons in copy".
//
// This pins the rules that were missing, so a later edit cannot quietly drop
// them, and pins the one that was wrong so it cannot come back.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skill = fs.readFileSync(
  path.join(root, '.claude', 'skills', 'unslop', 'SKILL.md'),
  'utf8',
);

/** The skill without its front matter, lowercased, for substring checks. */
const body = skill.replace(/^---\n[\s\S]*?\n---\n/, '').toLowerCase();

describe('the colon rule matches what she actually asks for', () => {
  it('says no colons in copy', () => {
    expect(body).toMatch(/no colons/);
  });

  it('no longer tells agents a colon before a list is fine', () => {
    // The exact line that shipped the wrong rule.
    expect(body).not.toMatch(/colons\*{0,2}\s*only before a list/);
  });
});

describe('the skill covers voice, not only vocabulary', () => {
  it('forbids opening a sentence with a bare command', () => {
    expect(body).toMatch(/bare command|bare imperative/);
  });

  it('asks for a person in the writing', () => {
    expect(body).toMatch(/first person/);
  });

  it('asks for sentence length to vary', () => {
    expect(body).toMatch(/same length|vary|monotone/);
  });

  it('carries the measurement that justifies each of them', () => {
    // Numbers, not adjectives, so a later reader can check the claim.
    expect(body).toMatch(/44\.9/);
    expect(body).toMatch(/21\.8/);
  });
});

describe('the limits that keep the voice rules honest', () => {
  it('forbids inventing experience to manufacture a first person', () => {
    expect(body).toMatch(/invent/);
  });

  it('keeps short direct answers legal, so an FAQ is not padded', () => {
    expect(body).toMatch(/faq|question heading/);
  });
});
