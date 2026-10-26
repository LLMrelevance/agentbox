// ⌘K TAKES THE WEBSITE'S LOOK AND KEEPS ITS OWN PICK (w-391bc4efbe, 2026-10-26).
//
// The website's ⌘K picture had things the app's own box did not: a magnifier
// and an Esc key on the input, a heading naming the thread the rows act on, a
// small icon on every row, the typed letters underlined in orange, and a
// footer with the keys. "There is a Command K bar in this component that I
// feel looks better than our current Command K bar." Measured on a capture of
// the built app before the change: none of the six was drawn. The selected row
// stays the app's own (the full-height edge in
// the-card-corners-stand-outside-and-command-k-marks-its-pick), because "I do
// prefer the selection of ours".

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { Palette } from '../renderer/src/components/Palette';
import { matchMarks, markPieces, inSections, matchesQuery, rankMatches, LATER_KEYWORDS } from '../renderer/src/palette-rows.ts';
import { glyphFor, NO_GLYPH } from '../renderer/src/palette-glyphs.ts';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const noop = () => {};

describe('the letters you typed are marked in the row', () => {
  it('marks a word where it starts a word, before anywhere inside one', () => {
    // "Restart" has a t inside it, but "the" starts with one, as the website draws it.
    expect(matchMarks('Restart the Agent', 't')).toEqual([[8, 9]]);
  });

  it('marks every word, in any order', () => {
    expect(matchMarks('Priority: Urgent', 'urg pri')).toEqual([[0, 3], [10, 13]]);
    expect(matchMarks('Priority: Urgent', 'URG')).toEqual([[10, 13]]);
  });

  it('falls back to the inside of a word when no word starts with it', () => {
    expect(matchMarks('Mark unread', 'ark')).toEqual([[1, 4]]);
  });

  it('puts two of the same word on two different words', () => {
    expect(matchMarks('Add an agent', 'a a')).toEqual([[0, 1], [4, 5]]);
  });

  // The case that must NOT mark: a row found by its hidden keywords says
  // nothing in its label, rather than underlining letters that only look alike.
  it('marks nothing when the row was found by its keywords alone', () => {
    expect(matchesQuery('snooze', { label: 'Later', keywords: LATER_KEYWORDS })).toBe(true);
    expect(matchMarks('Later', 'snooze')).toEqual([]);
    expect(matchMarks('Later', '')).toEqual([]);
  });

  it('cuts the label into pieces that put it back together exactly', () => {
    const label = 'Priority: Urgent';
    const pieces = markPieces(label, matchMarks(label, 'pri urg'));
    expect(pieces.map((p) => p.text).join('')).toBe(label);
    expect(pieces.filter((p) => p.on).map((p) => p.text)).toEqual(['Pri', 'Urg']);
    expect(markPieces('Later', [])).toEqual([{ text: 'Later', on: false }]);
  });
});

describe('the rows come in sections', () => {
  const rows = [
    { id: 'new-project', label: 'New project…', section: 'first' },
    { id: 'reply', label: 'Reply', section: 'thread' },
    { id: 'remote-control', label: 'Remote control', keywords: 'phone', section: 'thread' },
    { id: 'snooze', label: 'Later', keywords: LATER_KEYWORDS, section: 'thread' },
    { id: 'search', label: 'Search threads' },
    { id: 'settings', label: 'Settings…' },
  ];
  const typed = (q) => inSections(rankMatches(q, rows.filter((r) => matchesQuery(q, r)))).map((r) => r.id);

  it('keeps New project first, then the thread, then everything else', () => {
    expect(typed('')).toEqual(['new-project', 'reply', 'remote-control', 'snooze', 'search', 'settings']);
    expect(typed('e')).toEqual(['new-project', 'snooze', 'reply', 'remote-control', 'search', 'settings']);
  });

  it('still puts Later under the return key for "rem"', () => {
    expect(typed('rem')).toEqual(['snooze', 'remote-control']);
  });
});

describe('the box', () => {
  const draw = (props = {}) => renderToStaticMarkup(createElement(Palette, {
    products: [], supervisorPaused: false, look: 'dark', order: [],
    onSetLook: noop, onOpenFilter: noop, onClearFilter: noop, onView: noop, onPause: noop, onResume: noop,
    onRankFirst: noop, onNewProject: noop, onNewThread: noop, onStanding: noop, onSettings: noop,
    onShortcuts: noop, panelUp: true, onTogglePanel: noop, keyHints: false, onSetKeyHints: noop,
    onSearch: noop, onFirstRun: noop, onTutorial: noop, onImportAgents: noop, onFreshUser: noop,
    onDemo: noop, onClose: noop, ...props,
  }));
  const thread = { itemCommands: [{ id: 'reply', label: 'Reply', keyHint: 'R', run: noop }], itemTitle: 'Dark mode flashes white on launch' };

  it('names the thread its rows act on, and heads the rest Anywhere', () => {
    const html = draw(thread);
    expect(html).toContain('<div class="palette-head">This thread<span>Dark mode flashes white on launch</span></div>');
    expect(html).toContain('<div class="palette-head">Anywhere</div>');
    // New project is still the first row, above the thread's heading.
    expect(html.indexOf('New project…')).toBeLessThan(html.indexOf('This thread'));
    expect(html.indexOf('This thread')).toBeLessThan(html.indexOf('>Reply<'));
    expect(html.indexOf('>Reply<')).toBeLessThan(html.indexOf('Anywhere'));
  });

  it('says how many when rows are ticked', () => {
    expect(draw({ ...thread, batch: true, itemTitle: '3 selected' }))
      .toContain('<div class="palette-head">These threads<span>3 selected</span></div>');
  });

  // With no thread to act on, every row acts anywhere, so a heading saying so is noise.
  it('draws no headings when there is no thread', () => {
    expect(draw()).not.toContain('palette-head');
  });

  it('carries the magnifier, the Esc key and the footer', () => {
    const html = draw();
    expect(html).toContain('class="palette-query"');
    expect(html).toMatch(/<button type="button" class="palette-esc"[^>]*>esc<\/button>/);
    expect(html).toContain('Every word filters, in any order');
  });

  it('gives every row an icon', () => {
    const html = draw(thread);
    const rows = html.match(/class="palette-item[^"]*"/g) ?? [];
    const glyphs = html.match(/class="palette-glyph"/g) ?? [];
    expect(rows.length).toBeGreaterThan(10);
    expect(glyphs.length).toBe(rows.length);
  });
});

describe('every row has an icon of its own', () => {
  // Every fixed id the palette is built from, read out of the files that build it.
  const fixed = (file) => [...read(file).matchAll(/id: '([a-z-]+)'/g)].map((m) => m[1]);
  const app = read('renderer/src/App.tsx');
  const itemBlock = app.slice(app.indexOf('itemCommands={(() => {'), app.indexOf('filtering={isFiltering(boxFilter)}'));
  const ids = new Set([
    ...fixed('renderer/src/components/Palette.tsx'),
    ...fixed('renderer/src/thread-commands.ts'),
    ...fixed('renderer/src/run-now.ts'),
    ...[...itemBlock.matchAll(/id: ?'([a-z-]+)'/g)].map((m) => m[1]),
    // The ids built from a name, one of each shape.
    'rank-site', 'move-site', 'model-opus', 'group-design', 'teammate-t1', 'teammate-pause-t1',
    'cloud-toggle', 'cloud-mac', 'cloud-full', 'cloud-all', 'route-agent', 'route-me', 'route-back',
    'priority-urgent', 'priority-high', 'priority-medium', 'priority-low',
    'theme-light', 'theme-dark', 'theme-match',
  ]);

  it('finds the rows it is checking', () => {
    for (const id of ['new-project', 'approve', 'reply', 'stop', 'pin', 'run-now', 'settings']) expect(ids).toContain(id);
  });

  it('draws one for each of them', () => {
    const bare = [...ids].filter((id) => glyphFor({ id, label: '' }) === NO_GLYPH);
    expect(bare).toEqual([]);
  });

  it('never draws an emoji, which would come out in colour', () => {
    for (const id of ids) expect(glyphFor({ id, label: '' })).not.toMatch(/\p{Emoji_Presentation}/u);
  });

  it('pauses with one icon and unpauses with another', () => {
    expect(glyphFor({ id: 'pause', label: 'Pause agents' })).not.toBe(glyphFor({ id: 'pause', label: 'Unpause agents' }));
  });

  // The boundary: an id nobody has drawn yet still gets a quiet mark, not a gap.
  it('falls back to a quiet mark for an id it does not know', () => {
    expect(glyphFor({ id: 'something-new', label: 'Something new' })).toBe(NO_GLYPH);
    expect(NO_GLYPH.length).toBeGreaterThan(0);
  });
});
