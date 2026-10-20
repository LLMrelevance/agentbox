// The open picture is the one you can find in the strip at a glance, and it is
// never scrolled out of sight.
//
// What broke: "I do not know which one I have selected." The open thumbnail
// differed from the rest only in opacity (.38 against 1) and a 1px outline, so
// in a row of dark screenshots, each 72px wide, it could not be told apart; and
// with 28 of them the row ran wider than the window and nothing scrolled the open
// one into view. Measured on the screenshot sent with the report: 28 thumbnails
// across the full width, the open one 26th.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../renderer/src/styles.css', import.meta.url), 'utf8');
const view = fs.readFileSync(new URL('../renderer/src/components/PictureView.tsx', import.meta.url), 'utf8');

function rule(selector) {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, `${selector} is in the stylesheet`).toBeGreaterThan(-1);
  return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
}
const num = (decls, prop) => Number(new RegExp(`(?:^|[;\\s])${prop}:\\s*(-?[\\d.]+)`).exec(decls)?.[1]);

describe('the open thumbnail', () => {
  const thumb = rule('.pv-thumb');
  const on = rule('.pv-thumb.is-on');

  it('is twice the size of the others', () => {
    expect(num(on, 'width')).toBeGreaterThanOrEqual(2 * num(thumb, 'width'));
    expect(num(on, 'height')).toBeGreaterThanOrEqual(2 * num(thumb, 'height'));
  });

  it('is at full strength while the others are dimmed', () => {
    expect(num(on, 'opacity')).toBe(1);
    expect(num(thumb, 'opacity')).toBeLessThanOrEqual(0.5);
  });

  it('is named as the current one for a screen reader', () => {
    expect(view).toMatch(/aria-current=\{i === index \|\| undefined\}/);
  });
});

describe('the strip', () => {
  it('fits under the picture with the open thumbnail in it', () => {
    const strip = rule('.pv-strip');
    const stage = /inset:\s*\d+px\s+\d+px\s+(\d+)px/.exec(rule('.pv-stage'))?.[1];
    const top = num(strip, 'bottom') + num(rule('.pv-thumb.is-on'), 'height') + 2 * num(strip, 'padding');
    expect(Number(stage)).toBeGreaterThan(top);
  });

  it('scrolls the open one to its middle whenever the open picture changes', () => {
    const scroll = view.slice(view.indexOf('const row = strip.current'));
    expect(scroll).toMatch(/row\.scrollTo\(\{ left: on\.offsetLeft - \(row\.clientWidth - on\.offsetWidth\) \/ 2/);
    expect(scroll.slice(0, scroll.indexOf('}, [index]);') + 12)).toMatch(/\}, \[index\]\);$/);
  });
});
