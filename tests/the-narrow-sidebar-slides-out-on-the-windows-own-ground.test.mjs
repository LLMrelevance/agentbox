// THE NARROW SIDEBAR SLIDES OUT ON THE WINDOW'S OWN GROUND (w-dcaa2c122e, 2026-10-24).
//
// Pointed at, the narrow sidebar jumped open as a floating card on the menus'
// lighter grey (--pop) with a border, a different surface from the strip it
// grew out of: "it doesn't come out smoothly and it doesn't even feel
// connected to the existing sidebar because it has a completely different
// background color." Its words appeared in one frame (display: none to
// shown), and it listed every group to switch between, which was "not a
// sufficient way to switch between groups".
// Measured on the stage at 1710 by 1063, stepping the transitions at 60 frames
// a second: before, one frame narrow and the next wide on #363431; now the
// panel is the window's ground (#1a1817 with its dots), 38 to 202 wide over
// 0.22s, never see-through over the page, and the strip unchanged pixel for
// pixel while narrow.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SidebarGroups } from '../renderer/src/team/rooms/GroupsSidebar.tsx';
globalThis.React = React;

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const css = read('../renderer/src/team/rooms/rooms.css');
const nav = read('../renderer/src/workspace-navigation.css');
const rule = (sel) => {
  const at = css.indexOf(`${sel} {`);
  return at < 0 ? null : css.slice(at, css.indexOf('}', at) + 1);
};

describe('the wide sidebar', () => {
  it('is the window’s ground, never a menu’s grey', () => {
    const panel = rule('.gt-rail-nav::before');
    expect(panel).toContain('background: var(--bg)');
    expect(css).not.toMatch(/gt-rail-nav::before \{[^}]*var\(--pop\)/);
    expect(css).toMatch(/:root\[data-skin\] \.gt-rail-nav::before \{[^}]*var\(--skin-image\)[^}]*background-attachment: fixed/);
  });
  it('reaches the window’s edges, so it reads as the strip grown wider', () => {
    const panel = rule('.gt-rail-nav::before');
    expect(panel).toMatch(/top: -\d+px; bottom: -\d+px; left: -\d+px;/);
    expect(panel).not.toContain('border-radius');
  });
  it('widens and narrows over time rather than in one frame', () => {
    expect(rule('.gt-rail .workspace-navigation.gt-rail-nav')).toMatch(/transition: width \.\d+s/);
    expect(rule('.gt-rail-open .workspace-navigation.gt-rail-nav')).toMatch(/transition-duration: \.\d+s/);
  });
  it('is solid the moment it opens and until it has closed, so the page never shows through', () => {
    expect(rule('.gt-rail-nav::before')).toContain('transition: opacity 0s .16s');
    expect(rule('.gt-rail-open .gt-rail-nav::before')).toContain('transition: none');
  });
  it('fades its words in and out instead of hiding them, keeping your face', () => {
    expect(css).toMatch(/\.workspace-collapsed \.gt-rail-nav\.workspace-navigation button > span:not\(\.tm-av\)[^{]*\{ display: block; opacity: 0;/);
    expect(css).toMatch(/\.gt-rail-nav button > span:not\(\.tm-av\)[^{]*\{ display: block; white-space: nowrap; opacity: 1; transition: opacity/);
  });
  it('stands still for anyone who asks for less motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.gt-rail \.workspace-navigation\.gt-rail-nav, \.gt-rail-nav::before/);
  });
  it('leaves the ordinary sidebar alone: with Groups off its words still hide when folded', () => {
    expect(nav).toContain('.workspace-collapsed .workspace-navigation button > span, .workspace-collapsed .workspace-search kbd { display: none; }');
  });
});

describe('Groups in the sidebar', () => {
  const side = (props) => renderToStaticMarkup(createElement(SidebarGroups, { onGroupsPage: false, onGroups() {}, ...props }));
  it('is one row, and no group is listed under it', () => {
    const html = side({ groups: [{ key: 'room:a', name: 'Northwind' }] });
    expect([...html.matchAll(/<button/g)]).toHaveLength(1);
    expect(html).toContain('aria-label="Groups"');
    expect(html).not.toContain('Northwind');
  });
  it('is lit on a group’s page and not on the Inbox', () => {
    expect(side({ onGroupsPage: true })).toMatch(/class="workspace-tab active"[^>]*aria-label="Groups"/);
    expect(side({})).not.toContain('active');
  });
  it('leaves no rule behind for the rows it used to hold', () => {
    for (const gone of ['.gt-rail-list', '.gt-rail-row', '.gt-rail-dot', '.gt-rail-quiet']) expect(css).not.toContain(gone);
  });
});
