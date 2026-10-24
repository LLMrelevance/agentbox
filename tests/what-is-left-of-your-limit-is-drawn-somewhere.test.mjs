// USAGE WAS DRAWN NOWHERE OUTSIDE SETTINGS, AND NOT BY ANYBODY'S DECISION.
//
// Measured on the Linux box, 2026-10-23 (F-34): nothing about a limit appeared
// in the inbox at all. The pill was still in App.tsx, in the top right corner,
// behind `!workspaceNavigation` — and `workspaceNavigationShown` has returned
// true unconditionally since the sidebar became the chrome, so that branch
// could not run. The approved sidebar foot (w-e731ca9376, 2026-10-01: Feedback,
// then Instructions and Settings, then the usage slot, then you) has carried an
// empty slot ever since; the component and its stylesheet were both finished.
//
// So this holds the wiring, which is the part that was missing: the slot is
// filled, it is filled with the quiet sidebar form and not the meter, and
// nothing at all is drawn before a reading lands.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UsagePill } from '../renderer/src/components/UsagePill';
import { WorkspaceNavigation } from '../renderer/src/components/WorkspaceNavigation';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(root, 'renderer/src/App.tsx'), 'utf8');
// THE TAG IS FOLLOWED BY A NEWLINE, NOT A SPACE, and a slice that asked for
// `'<WorkspaceNavigation '` came back empty — which is how the test this one
// replaces passed for a month while asserting the opposite of the truth.
const open = app.indexOf('<WorkspaceNavigation');
const nav = app.slice(open, app.indexOf('{inFullScreen && !workspaceNavigation ?', open));
const reading = { engine: 'codex', at: 0, limits: [{ span: 'session', name: 'This session', percent: 38, resetsAt: 3600000 }] };

describe('the one place the inbox says what is left', () => {
  // THE DEFECT: the slot existed, the pill existed, and App joined neither.
  it('hands the sidebar a usage pill', () => {
    expect(nav).toMatch(/usage=\{<UsagePill/);
    expect(nav).toContain('sidebar');
  });

  // THE CASE THAT MUST NOT COME BACK: the dead corner branch, which read as a
  // pill in the top right to anybody reading the file.
  it('leaves no corner pill that cannot draw', () => {
    expect(app).not.toContain('!workspaceNavigation && <UsagePill');
  });

  it('draws it quietly in the foot, not as a meter', () => {
    const html = renderToStaticMarkup(createElement(WorkspaceNavigation, {
      view: 'inbox', collapsed: false, onToggle() {}, onView() {}, onSearch() {}, onCompose() {},
      usage: createElement(UsagePill, { usage: reading, now: 0, sidebar: true, engineWord: 'Codex' }),
    }));
    expect(html).toContain('class="workspace-usage"');
    expect(html).toContain('38% used');
    expect(html).not.toContain('usage-meter');
  });

  // AND NOTHING BEFORE A FIGURE LANDS. The slot collapses on `:empty`, so an
  // app that has read nothing yet draws exactly what it drew before.
  it('draws nothing at all with no reading', () => {
    expect(renderToStaticMarkup(createElement(UsagePill, { usage: null, now: 0, sidebar: true }))).toBe('');
  });
});
