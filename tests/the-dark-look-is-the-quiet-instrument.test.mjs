// THE DARK LOOK IS THE QUIET INSTRUMENT (w-22da913d00, approved 2026-10-17
// after ten rounds of pictures in designs/w-22da913d00).
//
// What was picked, so a later change can tell what it is undoing: a warmer,
// slightly brown card; the cards on top of it (choices, reply, ⌘K) neutral
// grey; a faint grid fading in from the left and a ruler along the card's
// foot; corner marks standing just outside the card; the page name in spaced
// capitals after a small orange square; option numbers left uncoloured.
//
// The mockups drew the grid on `.workspace-layout::after`, which is the
// window's drag strip: shipped that way the window could not be moved. The
// marks have their own element, and this pins that the drag strip is left
// alone.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', f), 'utf8');
const styles = read('styles.css');
const nav = read('workspace-navigation.css');
const emberTokens = (() => { const s = styles.slice(styles.indexOf(':root[data-skin="ember-grid"] {')); return s.slice(0, s.indexOf('\n}')); })();
const E = ':root[data-skin="ember-grid"]';

describe('the Dark look', () => {
  it('has the warmer card and its warm hairlines', () => {
    expect(emberTokens).toMatch(/--skin-pane: rgba\(44, 34, 29, 0?\.62\);/);
    expect(emberTokens).toMatch(/--line: rgba\(255, 214, 170, 0?\.10?\);/);
  });

  it('keeps the window draggable: nothing in it touches the drag strip', () => {
    expect(nav).not.toMatch(new RegExp(`${E.replace(/[[\]]/g, '\\$&')} \\.workspace-layout::after`));
    expect(nav).toMatch(/\.workspace-layout::after \{[^}]*-webkit-app-region: drag;/);
  });

  it('draws its grid, ruler and corner marks on their own element, only in Dark', () => {
    expect(read('App.tsx')).toMatch(/<div className="panel-marks" aria-hidden="true" \/>/);
    expect(nav).toMatch(/^\.panel-marks \{ display: none; \}/m);
    expect(nav).toContain(`${E} .panel-marks {`);
    expect(nav).toContain(`${E} .panel-marks::before {`);
    expect(nav).toContain(`${E} .panel-marks::after {`);
  });

  it('puts the page name in spaced capitals after a small orange square', () => {
    expect(nav).toMatch(new RegExp(`${E.replace(/[[\]]/g, '\\$&')} \\.workspace-title::before \\{[^}]*background: var\\(--accent\\)`));
  });

  it('keeps the cards on top of the big card neutral grey', () => {
    for (const sel of ['.opt-strip', '.dock-card', '.modal']) {
      const rule = nav.match(new RegExp(`${E.replace(/[[\]]/g, '\\$&')} \\${sel} \\{([^}]*)\\}`))?.[1] ?? '';
      expect(rule, `${sel} has no Dark rule`).toMatch(/background: rgba\((38|42|44), (36|40|42), (34|38|40)/);
    }
  });

  it('leaves the option numbers uncoloured', () => {
    const key = nav.match(new RegExp(`${E.replace(/[[\]]/g, '\\$&')} \\.opt-key \\{([^}]*)\\}`))?.[1] ?? '';
    expect(key).not.toMatch(/(^|[^-])color:/);
  });
});
