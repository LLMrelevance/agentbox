// POINTING AT THE NARROW SIDEBAR MOVES NOTHING UNDER THE POINTER (w-49eac51aa7, 2026-10-25).
//
// "If I hover over the 'Restart to update' button, everything moves. I end up
// clicking the feedback button." With Groups on, the sidebar is a narrow rail
// that widens while pointed at. Narrow, a waiting update was a row at the top
// of the foot; wide, it became the tall card above the foot, so the row under
// the pointer vanished and Feedback slid up into its place. Measured on the
// groups stage at 1710 by 1063: the pointer on the row's middle (y 881) was
// left in the 14px gap between the card's Restart button (ends y 870) and
// Feedback (starts y 900), and a few points lower it was on Feedback.
//
// In the rail the update and move offers are the same row narrow and wide; its
// label fades in like every other row's. The wide sidebar you open yourself
// keeps the card.
import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkspaceNavigation } from '../renderer/src/components/WorkspaceNavigation.tsx';

const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
afterEach(() => {
  if (had) Object.defineProperty(globalThis, 'localStorage', had);
  else delete globalThis.localStorage;
});

const draw = (props) => {
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem() {}, removeItem() {} }, configurable: true, writable: true });
  return renderToStaticMarkup(createElement(WorkspaceNavigation, {
    view: 'inbox', inboxLabel: 'Inbox', onToggle() {}, onView() {}, onSearch() {}, onCompose() {}, onSettings() {}, onFeedback() {},
    onUpdate() {}, onMove() {}, ...props,
  }));
};
const update = { installing: false, version: 'abc1234' };
const move = { place: 'dmg' };
/** The sidebar's foot, from the update offer to the end. */
const foot = (html) => html.slice(html.indexOf('class="workspace-bottom"'));

describe('the narrow sidebar, narrow and then pointed at', () => {
  it('draws the waiting update as the same row in the same place', () => {
    const narrow = draw({ rail: true, collapsed: true, update });
    const wide = draw({ rail: true, collapsed: false, update });
    expect(wide).not.toContain('sb-update-card');
    expect(wide).toMatch(/class="sb-update-row"[^>]*aria-label="Restart to update"/);
    expect(foot(wide)).toBe(foot(narrow));
  });

  it('keeps the row above Feedback, inside the foot list', () => {
    const wide = foot(draw({ rail: true, collapsed: false, update }));
    expect(wide.indexOf('sb-update-row')).toBeGreaterThan(wide.indexOf('th-side-foot'));
    expect(wide.indexOf('sb-update-row')).toBeLessThan(wide.indexOf('aria-label="Feedback"'));
  });

  it('does the same for a copy that cannot update itself', () => {
    const narrow = draw({ rail: true, collapsed: true, move });
    const wide = draw({ rail: true, collapsed: false, move });
    expect(wide).not.toContain('sb-update-card');
    expect(foot(wide)).toBe(foot(narrow));
  });

  it('still says Updating while a restart runs', () => {
    const wide = draw({ rail: true, collapsed: false, update: { ...update, installing: true } });
    expect(wide).toMatch(/class="sb-update-row" data-installing="true" disabled=""/);
    expect(wide).toContain('<span>Updating</span>');
  });
});

describe('the sidebar you open and shut yourself', () => {
  it('still shows the card when open, and the row when shut', () => {
    expect(draw({ rail: false, collapsed: false, update })).toContain('class="sb-update-card"');
    expect(draw({ rail: false, collapsed: true, update })).not.toContain('sb-update-card');
    expect(draw({ rail: false, collapsed: false, move })).toContain('class="sb-update-card"');
  });
});
