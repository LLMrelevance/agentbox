// THE PHONE APP DRAWS AN AGENT'S MARKDOWN AS TEXT (docs/mobile/PLAN.md).
//
// Agents write markdown, and the desktop draws it. A phone has no browser to
// hand it to, so the app reads the handful of shapes agents actually use
// (paragraphs, headings, lists, bold, code, links) into blocks it can draw
// (mobile/src/lib/markdown.ts). Without it a result reads as "**Shipped.**"
// with its asterisks. These pin each shape, and the text that must come
// through untouched: a lone asterisk, an underscore in a file name.
import { describe, it, expect } from 'vitest';
import { blocksOf, spansOf } from '../mobile/src/lib/markdown';

describe('the blocks of a message', () => {
  it('splits paragraphs, headings, lists and code', () => {
    expect(blocksOf('One line\nthe same paragraph.\n\n## A heading\n\n- first\n- second\n\n1. one\n2. two\n\n```\nnpm run ship\n```')).toEqual([
      { kind: 'p', text: 'One line\nthe same paragraph.' },
      { kind: 'h', text: 'A heading' },
      { kind: 'li', text: 'first', mark: '•' },
      { kind: 'li', text: 'second', mark: '•' },
      { kind: 'li', text: 'one', mark: '1.' },
      { kind: 'li', text: 'two', mark: '2.' },
      { kind: 'code', text: 'npm run ship' },
    ]);
  });

  it('keeps a list item\'s wrapped line with it', () => {
    expect(blocksOf('- a long item\n  that wraps')).toEqual([{ kind: 'li', text: 'a long item that wraps', mark: '•' }]);
  });

  it('an empty message is no blocks', () => {
    expect(blocksOf('  \n\n')).toEqual([]);
  });
});

describe('the spans of a line', () => {
  it('reads bold, code and a link as words', () => {
    expect(spansOf('**Shipped.** Run `npm run ship` or read [the plan](https://example.com).')).toEqual([
      { text: 'Shipped.', bold: true },
      { text: ' Run ' },
      { text: 'npm run ship', code: true },
      { text: ' or read ' },
      { text: 'the plan', link: 'https://example.com' },
      { text: '.' },
    ]);
  });

  it('leaves a lone asterisk and an underscore in a name alone', () => {
    expect(spansOf('5 * 3 in my_file_name.ts')).toEqual([{ text: '5 * 3 in my_file_name.ts' }]);
  });
});
