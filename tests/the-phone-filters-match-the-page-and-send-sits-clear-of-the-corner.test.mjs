// THE THIRD ROUND OF PHONE NOTES (2026-10-11). On the drawn phone, "View and
// filters" took most of an 852px screen, in --bg-raised (#2f2d2c) over a
// list dimmed by a 100vmax shadow, with the picked choice a white block: "filters
// still look wack/ugly/now huge and have a different color bg than everything
// else". Send was an orange box 12px from the screen's right edge ("touching the
// top corner of the app"), and beside a grey "Cancel" its weight pulled "New
// thread" off the middle ("doesn't feel centered"). The pickers' sheet had 16px
// top corners; "square pickers wins for sure". The To row also drew two lines
// under it, the desktop's divider and the phone's own.
//
// Measured by reading renderer/src/phone.css, and on the drawn phone
// (an iPhone-sized headless page): the panel is now 353px, the page colour,
// with nothing dimmed behind it.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'renderer/src/phone.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const at = css.indexOf('@media (max-width: 700px), (max-height: 520px)');
const rules = [...css.slice(at).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
/** The declarations of every rule whose selector list ends in `piece`, last rule last. */
const bodiesFor = (piece) => rules.filter((r) => r.selector.split(',').some((s) => s.trim().endsWith(piece))).map((r) => r.body).join(';');
/** The last value a property is given across those rules, as the cascade would leave it. */
const last = (piece, prop) => {
  const all = [...bodiesFor(piece).matchAll(new RegExp(`(?:^|[;{\\s])${prop}:\\s*([^;]+)`, 'g'))];
  return all.length ? all[all.length - 1][1].trim() : undefined;
};

describe('on a phone, View and filters', () => {
  it('is the page\'s own colour, not the raised grey or the menu grey', () => {
    const bg = last('.th-pop', 'background');
    expect(bg).toMatch(/var\(--bg\)/);
    expect(bg).not.toMatch(/--bg-raised|--pop/);
  });

  it('dims nothing behind it', () => {
    expect(last('.th-pop', 'box-shadow')).not.toMatch(/100vmax/);
  });

  it('puts each section\'s name beside its choices, which wrap rather than run off the edge', () => {
    expect(last('.th-pop .line', 'flex-direction')).toBe('row');
    expect(last('.th-pop .opts', 'flex-wrap')).toBe('wrap');
  });

  it('draws its choices as plain words, the picked one underlined in the accent like the inboxes', () => {
    const button = bodiesFor('.th-pop .opts button');
    expect(last('.th-pop .opts button', 'border')).toBe('0');
    expect(last('.th-pop .opts button', 'background')).toBe('none');
    expect(Number.parseInt(last('.th-pop .opts button', 'height'), 10)).toBeLessThanOrEqual(34);
    expect(button).toBeTruthy();
    expect(last('.th-pop .opts button.on', 'text-decoration-color')).toBe('var(--accent)');
    // The white block it was.
    expect(last('.th-pop .opts button.on', 'background')).not.toMatch(/var\(--text\)/);
  });
});

describe('on a phone, a new thread', () => {
  it('has Send as an accent word, not a filled box in the corner', () => {
    expect(last('.tc-card .tc-send > button', 'background')).toBe('none');
    expect(last('.tc-card .tc-send > button', 'color')).toBe('var(--accent)');
  });

  it('keeps Send in off the edge and below the status bar', () => {
    expect(last('.tc-card .tc-send', 'top')).toMatch(/safe-area-inset-top/);
    const right = last('.tc-card .tc-send', 'right');
    expect(Number.parseInt(right.match(/calc\((\d+)px/)[1], 10)).toBeGreaterThanOrEqual(10);
  });

  it('centres its name across the whole bar, between two words of like weight', () => {
    expect(bodiesFor('.tc-veil::before')).toMatch(/content:\s*'Cancel'/);
    const title = bodiesFor('.tc-veil::after');
    expect(title).toMatch(/left:\s*0/);
    expect(title).toMatch(/right:\s*0/);
    expect(title).toMatch(/justify-content:\s*center/);
  });

  it('draws one line between its rows, not the desktop\'s divider as well', () => {
    expect(last('.tc-card > .tc-head', 'border-bottom')).toBe('0');
    expect(last('.tc-card .tc-field + .tc-field', 'border-top')).toBe('0');
  });

  it('opens its pickers as square sheets', () => {
    expect(last('.tc-menu', 'border-radius')).toBe('0');
  });
});
