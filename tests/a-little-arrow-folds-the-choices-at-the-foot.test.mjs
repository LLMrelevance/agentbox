// A LITTLE ARROW FOLDS THE CHOICES AT THE FOOT (w-65bcefb857).
//
// The choices on the one-at-a-time page sit over the reply box for as long as
// the thread is open, and the founder asked for the room back: "All you need
// is a little toggle, like a dropdown, on what we already have... Just a
// little downward arrow... You don't need text and you don't need to change
// the component." It was built once (the `.opt-collapse` chevron) and taken
// out on 2026-10-05, 6bd9bc3f, when the options moved into the conversation
// and scrolled away by themselves (tests/the-options-are-never-folded-away).
// At the foot they no longer scroll away, so the same arrow comes back here,
// on this page's box only.
//
// Folded, the box keeps its first choice. The number keys pick any of them
// either way, and one picked out with the arrow keys shows. The fold stays
// from thread to thread, since it is how somebody likes to read.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChoicesFold } from '../renderer/src/components/OneThingAtATime.tsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const css = read('renderer/src/one-thing-at-a-time.css');
const focus = read('renderer/src/components/Focus.tsx');
const visible = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('the arrow', () => {
  const open = renderToStaticMarkup(h(ChoicesFold, { folded: false, onToggle: () => {} }));
  const shut = renderToStaticMarkup(h(ChoicesFold, { folded: true, onToggle: () => {} }));
  it('is the old chevron, with no words on it', () => {
    expect(open).toContain('<path d="M4 6l4 4 4-4"');
    expect(visible(open)).toBe('');
  });
  it('says what it does to a screen reader and whether the choices are open', () => {
    expect(open).toMatch(/aria-label="Fold the choices" aria-expanded="true"/);
    expect(shut).toMatch(/aria-label="Show all the choices" aria-expanded="false"/);
  });
  it('sits in the box\'s corner and turns over when folded', () => {
    expect(css).toMatch(/\.one-choices-fold \{[^}]*position: absolute; top: 6px; right: 8px;/);
    expect(css).toMatch(/\.one-choices-folded \.one-choices-fold svg \{ transform: rotate\(180deg\); \}/);
  });
});

describe('folded', () => {
  it('the box keeps its first choice, and one picked out with the keys', () => {
    expect(css).toMatch(/\.one-choices-folded \.opt-row:not\(:first-of-type\):not\(\.selected\) \{ display: none; \}/);
  });
  it('and the fold stays from thread to thread', () => {
    expect(focus).toMatch(/localStorage\.getItem\(CHOICES_FOLDED\) === '1'/);
    expect(focus).toMatch(/localStorage\.setItem\(CHOICES_FOLDED, now \? '1' : '0'\)/);
  });
});

describe('only on this page\'s box', () => {
  it('drawn beside the choices at the foot', () => {
    expect(focus).toMatch(/<div className=\{`one-choices\$\{choicesFolded \? ' one-choices-folded' : ''\}`\}>[\s\S]{0,700}<ChoicesFold folded=\{choicesFolded\} onToggle=\{foldChoices\} \/>/);
  });
  it('and not inside the options block, which the conversation draws without one', () => {
    expect(read('renderer/src/components/OptionsOffer.tsx')).not.toMatch(/ChoicesFold|one-choices-fold/);
  });
});
