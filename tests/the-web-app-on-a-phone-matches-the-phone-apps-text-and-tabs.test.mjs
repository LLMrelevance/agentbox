// THE WEB APP ON A PHONE DRAWS ITS INBOX THE WAY THE PHONE APP DOES (2026-10-28).
//
// On an iPhone the web app's inbox felt "somehow a bit uncomfortable", and its
// Needs you, In progress, Later, Done bar was "super duper low and worse
// vibes". The phone app on the same iPhone was the fix: "This spacing in the
// mobile app image is perfect ... Everything there has just a bit bigger font."
//
// Measured from the two screenshots (both 1206px wide, 3x): the phone app drew
// "Desktop folder picker escape and key leak" 338.0pt wide, where Geist at the
// 16px both apps ask for is 304.6pt; the web app drew its title at 283.7pt
// against 277.0pt, that is at the size asked. The phone app follows the
// iPhone's text size (React Native scales every Text by it), one step over the
// default on that phone, 19/17 = 1.118. The web app ignored it.
// And its bar sat 14px lower: the phone app keeps the whole home bar inset
// under its tabs (footRoom, mobile/src/ui/parts.tsx), the web app kept the
// inset less 14px.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { textScale } from '../renderer/src/phone-text.ts';

const css = fs.readFileSync('renderer/src/phone.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const phone = css.slice(css.indexOf('@media (max-width: 700px), (max-height: 520px)'));
const rules = [...phone.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
const last = (piece, prop) => {
  const body = rules.filter((r) => r.selector.split(',').some((s) => s.trim().endsWith(piece))).map((r) => r.body).join(';');
  const all = [...body.matchAll(new RegExp(`(?:^|[;{\\s])${prop}:\\s*([^;]+)`, 'g'))];
  return all.length ? all[all.length - 1][1].trim() : undefined;
};

describe("the iPhone's text size", () => {
  it('is 1 at the default, where the body text is 17px', () => {
    expect(textScale(17)).toBe(1);
  });
  it('is 1.118 one step up, as the phone app drew it', () => {
    expect(textScale(19)).toBeCloseTo(1.118, 3);
  });
  it('shrinks with a smaller setting, as the phone app does', () => {
    expect(textScale(15)).toBeCloseTo(0.882, 3);
  });
  it('stops at 1.35 for the largest accessibility sizes, before the rows break', () => {
    expect(textScale(53)).toBe(1.35);
    expect(textScale(10)).toBe(0.8);
  });
  it('is 1 where nothing says, in any browser but an iPhone', () => {
    for (const v of [0, NaN, -3, undefined]) expect(textScale(v)).toBe(1);
  });
  it('is read from the page and set as --phone-type', () => {
    const src = fs.readFileSync('renderer/src/phone-text.ts', 'utf8');
    expect(src).toMatch(/-apple-system-body/);
    expect(src).toMatch(/setProperty\('--phone-type'/);
    expect(fs.readFileSync('renderer/src/phone-screen.ts', 'utf8')).toMatch(/followTextSize\(\)/);
  });
});

describe('the inbox on a phone', () => {
  it("scales a row's title and its quiet line by it, and keeps the row's own room", () => {
    expect(last('.th-grid > :nth-child(1)', 'font-size')).toBe('calc(16px * var(--phone-type, 1))');
    expect(last('.th-grid > :nth-child(2)', 'font-size')).toBe('calc(11px * var(--phone-type, 1))');
    expect(last('.th-grid > :last-child', 'font-size')).toBe('calc(11px * var(--phone-type, 1))');
    expect(last('.th-table .row', 'padding-top')).toBe('14px');
  });
  it('scales the tabs, their counts and the title over them', () => {
    expect(last('.tm-tab', 'font-size')).toBe('calc(15px * var(--phone-type, 1))');
    expect(last('.tm-tab b', 'font-size')).toBe('calc(11px * var(--phone-type, 1))');
    expect(last('.topbar .workspace-title', 'font-size')).toBe('calc(19px * var(--phone-type, 1))');
  });
  it('keeps the whole home bar inset under the tabs, as the phone app does', () => {
    const foot = rules.filter((r) => r.selector === ':root').map((r) => r.body).join(';').match(/--phone-foot:\s*([^;]+)/);
    expect(foot?.[1].trim()).toBe('max(8px, env(safe-area-inset-bottom, 0px))');
    const app = fs.readFileSync('mobile/src/ui/parts.tsx', 'utf8');
    expect(app).toMatch(/Math\.max\(8, inset\.bottom\)/);
  });
});
