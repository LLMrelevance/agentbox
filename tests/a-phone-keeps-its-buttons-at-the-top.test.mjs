// THE PHONE LAYOUT, AS PICKED (2026-10-11). Pull request #34 laid the side
// rail along the bottom of a phone: the app's logo as a "Menu" nobody could
// name, a Threads tab for the page you are already on, Feedback, and Settings
// wearing the same sliders as "View and filters" one row above it. Three
// directions were drawn on the real app; the pick, in her words: "tidy wins",
// "not a fan of that bar at the bottom entirely ... all that stuff is best
// placed at the top", "big fan of the new thread button", and the open thread
// as drawn in the chips direction.
//
// Measured by reading renderer/src/phone.css: before this change the side
// rail's rule pinned it to `bottom: 0`, and no rule floated the new-thread
// button or hid Feedback.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = fs.readFileSync(path.join(root, 'renderer/src/phone.css'), 'utf8');
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');

/** The text inside `@media (max-width: 700px), (max-height: 520px) { … }`, and what is outside it. */
function split(text) {
  const at = text.indexOf('@media (max-width: 700px), (max-height: 520px)');
  const open = text.indexOf('{', at);
  let depth = 0;
  let end = open;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  return { inside: text.slice(open + 1, end), outside: text.slice(0, at) + text.slice(end + 1) };
}
const { inside, outside } = split(css);

/** Every `selector { declarations }` inside the phone block. */
const rules = [...inside.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim(), body: m[2] }));
/** The declarations of every rule whose selector list carries `piece`. */
const bodiesFor = (piece) => rules.filter((r) => r.selector.split(',').some((s) => s.trim().endsWith(piece))).map((r) => r.body).join(';');
const hidden = (piece) => /display:\s*none/.test(bodiesFor(piece));

describe('on a phone', () => {
  it('there is no bar along the bottom: the side rail sits in the top bar', () => {
    const nav = bodiesFor('.workspace-navigation');
    expect(nav).toMatch(/top:\s*env\(safe-area-inset-top/);
    expect(nav).not.toMatch(/(^|;|\s)bottom:\s*0(px)?\s*(;|$)/);
    expect(nav).not.toMatch(/border-top:/);
  });

  it('only Settings is left of the side rail: no logo, no Threads tab, no Feedback, no Instructions', () => {
    expect(hidden('.workspace-navigation .th-team')).toBe(true);
    expect(hidden('.workspace-navigation .workspace-tabs')).toBe(true);
    expect(hidden('.workspace-navigation button[aria-label="Feedback"]')).toBe(true);
    expect(hidden('.workspace-navigation button[aria-label="Instructions"]')).toBe(true);
    expect(hidden('.workspace-navigation button[aria-label="Settings"]')).toBe(false);
  });

  it('Settings wears a gear, not the sliders "View and filters" wears', () => {
    expect(hidden('.workspace-navigation button[aria-label="Settings"] svg')).toBe(true);
    const gear = bodiesFor('.workspace-navigation button[aria-label="Settings"]::before');
    expect(gear).toMatch(/mask:\s*url\("data:image\/svg\+xml/);
    expect(gear).toMatch(/circle/);
  });

  it('a new thread is one orange button floating under the thumb', () => {
    const fab = bodiesFor('.topbar .th-new');
    expect(fab).toMatch(/position:\s*fixed/);
    expect(fab).toMatch(/border-radius:\s*50%/);
    expect(fab).toMatch(/background:\s*var\(--accent\)/);
    // The last row is not left under it.
    expect(bodiesFor('.list.th-table')).toMatch(/padding-bottom:\s*\d+px/);
  });

  it('inside a thread, Settings and the new-thread button step aside', () => {
    expect(rules.some((r) => r.selector.includes(':has(.workspace-task-header)') && r.selector.includes('.workspace-navigation') && /display:\s*none/.test(r.body))).toBe(true);
    expect(rules.some((r) => r.selector.includes(':has(.workspace-task-header)') && r.selector.includes('.th-new') && /display:\s*none/.test(r.body))).toBe(true);
  });

  it('an open thread is titled in the reading type, with no crumb trail', () => {
    expect(hidden('.thread-crumb-from')).toBe(true);
    expect(hidden('.thread-crumb-sep')).toBe(true);
    const crumb = bodiesFor('.thread-crumb');
    expect(crumb).toMatch(/text-transform:\s*none/);
    expect(crumb).not.toMatch(/font-family:[^;]*Mono/);
  });

  it('the desktop window\'s chrome stays off a phone: no corner marks, no keyboard underline, no tick boxes', () => {
    expect(bodiesFor('.workspace-layout::before')).toMatch(/background:\s*var\(--skin-pane/);
    expect(hidden('.row .mark')).toBe(true);
    expect(bodiesFor('.row.selected .subject')).toMatch(/text-decoration:\s*none/);
  });
});

describe('on the desktop', () => {
  it('none of it applies: every rule in the file is inside the phone-sized block', () => {
    expect(outside.replace(/\s+/g, '')).toBe('');
  });
});
