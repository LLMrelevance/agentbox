// THE CONTEXT SITS SMALL AND SET OFF, WITH NO LABEL (w-65bcefb857, round seventeen).
//
// "I keep not reading this thing up top, the context bar... something about it
// looks a little funky." Measured at the founder's zoom: the Context ran the
// whole page width, about 170 characters a line, twice a comfortable length,
// and its "CONTEXT" label sat inside the first line, so the two lines started
// at different edges. Seven versions were drawn on four of their threads in
// light and dark; they picked F, "all three": the label and "Show N earlier
// messages" on one quiet row, then the text under it, set off by a thin line
// down its left edge, smaller and fainter, at most three lines.
//
// Then, once it had shipped: "remove the word \"context\"". The row above the
// text keeps only "Show N earlier messages".
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueueSummary } from '../renderer/src/components/OneThingAtATime.tsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'renderer/src/one-thing-at-a-time.css'), 'utf8');
const rule = (sel) => css.match(new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';
const draw = (p) => renderToStaticMarkup(h(QueueSummary, { onToggle: () => {}, open: false, earlier: 0, ...p }));
const visible = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('the row above the text', () => {
  it('holds the way to the earlier messages, and no word for the text', () => {
    const html = draw({ title: 'Find accelerator funding deadlines', context: 'You asked for funding deadlines.', earlier: 11 });
    expect(html).toMatch(/<div class="one-head"><button type="button" class="one-earlier">Show 11 earlier messages<\/button><\/div><div class="one-cols"/);
    expect(visible(html)).toBe('Find accelerator funding deadlines Show 11 earlier messages You asked for funding deadlines.');
    expect(html).not.toContain('one-lab');
  });
  it('and is not drawn when there is nothing earlier, the text right under the name', () => {
    expect(draw({ title: 'T', context: 'c' })).toBe('<div class="one-sum"><h2 class="one-title">T</h2><div class="one-cols"><div class="one-col">c</div></div></div>');
  });
  it('and the text carries no label of its own', () => {
    expect(draw({ context: 'c' })).toMatch(/<div class="one-col">c<\/div>/);
  });
  it('keeps the way to the earlier messages when there is no Context', () => {
    expect(visible(draw({ context: null, earlier: 3 }))).toBe('Show 3 earlier messages');
  });
  it('and draws nothing with neither', () => {
    expect(draw({ context: null })).toBe('<div class="one-sum"></div>');
  });
  it('quiet', () => {
    expect(rule('.one-head')).toMatch(/display: flex; align-items: baseline; gap: 16px;/);
    expect(rule('.one-earlier')).toMatch(/font-size: 12\.5px; color: var\(--text-faint\);/);
  });
});

describe('the text', () => {
  it('is set off by a thin line down its left edge', () => {
    expect(rule('.one-cols')).toMatch(/border-left: 2px solid var\(--line-strong\); padding-left: 14px;/);
  });
  it('no wider than a comfortable line', () => {
    expect(rule('.one-cols')).toMatch(/max-width: 680px;/);
  });
  it('smaller and fainter than the answer, three lines at most', () => {
    expect(rule('.one-col')).toMatch(/font-size: 13\.5px; line-height: 1\.55; color: var\(--text-faint\);/);
    expect(rule('.one-col')).toMatch(/-webkit-line-clamp: 3;/);
  });
});
