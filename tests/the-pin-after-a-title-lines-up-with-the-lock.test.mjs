// THE PIN AFTER A TITLE LINES UP WITH THE LOCK BESIDE IT.
//
// Reported 2026-10-20 (w-739077c097) on a pinned private card, with a crop of
// the two marks: "not lined up well". Measured in the built page at 4x: both
// marks spanned the same rows, but the pin was the thread menu's 24-unit
// glyph shrunk to 13px, so its line was 0.76px against the lock's 1.2px, its
// collar sat 1.5px below the top of the lock's body (two lines that nearly
// meet and miss), and the gap before it was 14px against 11.5px before the
// lock.
//
// Now the pin that follows a title is drawn on the lock's own 11 by 12 grid at
// its stroke, with the collar on the top of the lock's body, the top bar on
// the top of the shackle and the needle down to the body's foot, and it takes
// the lock's margin and baseline. The thread menu keeps its own pin, drawn on
// the 24-unit grid every other menu mark uses.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InboxBoard, ThreadCells } from '../renderer/src/threads/Pages.tsx';
import { PinMark } from '../renderer/src/threads/ThreadMenu.tsx';
import { TeamContext } from '../renderer/src/team/people.tsx';
globalThis.React = React;

const NOW = Date.now();
const DAY = 86_400_000;
const SINCE = NOW - 7 * DAY;
const ME = 'p-me';
const northwind = { slug: 'northwind', name: 'Northwind', team: { visibility: 'team', people: [] } };
const item = { id: 'w-1', product: 'northwind', productName: 'Northwind', status: 'open', title: 'Slack export and safe cancellation', kind: 'directive',
  labels: ['founder'], priority: 5, epoch: 0, claim: null, createdAt: SINCE + DAY, updatedAt: NOW - 60_000, createdBy: ME, visibility: 'private', pinned: true };
const team = { state: { since: SINCE, signedIn: true }, me: ME, byId: new Map(), products: new Map() };
const inTeam = (el) => renderToStaticMarkup(React.createElement(TeamContext.Provider, { value: team }, el));
const row = inTeam(React.createElement(ThreadCells, { item, product: northwind, now: NOW }));
const card = inTeam(React.createElement(InboxBoard, { items: [item], products: [northwind], now: NOW, onOpenItem: () => {}, picked: [ME],
  display: { view: 'board', sort: 'priority', priorities: [], projects: [], updated: 'any' }, stateOf: () => 'waiting' }));

const svgOf = (html, cls) => html.match(new RegExp(`<svg[^>]*class="${cls}"[^>]*>[\\s\\S]*?</svg>`))[0];
const attr = (svg, name) => svg.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null;
const box = (svg) => ['width', 'height', 'viewBox', 'stroke-width'].map((a) => attr(svg, a));

// The points of a path written in absolute M, H, V, L and Z, as [x, y] pairs.
function points(d) {
  const out = [];
  let x = 0, y = 0;
  for (const [, cmd, args] of d.matchAll(/([MHVLZ])([^MHVLZ]*)/g)) {
    const n = args.trim() ? args.trim().split(/[\s,]+/).map(Number) : [];
    if (cmd === 'H') x = n[0];
    else if (cmd === 'V') y = n[0];
    else if (cmd === 'M' || cmd === 'L') [x, y] = n;
    else continue;
    out.push([x, y]);
  }
  return out;
}
const pathsOf = (svg) => [...svg.matchAll(/<path d="([^"]*)"/g)].map((m) => points(m[1]));

// The lock's own lines: its body's box and the top of its shackle.
const LOCK = (() => {
  const lock = svgOf(row, 'th-lock');
  const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((a) => Number(lock.match(new RegExp(`<rect[^>]*\\s${a}="([^"]*)"`))[1]));
  const shackle = lock.match(/<path d="M[\d.]+ [\d.]+V([\d.]+)a([\d.]+)/);
  return { left: x, right: x + w, top: y, foot: y + h, crown: Number(shackle[1]) - Number(shackle[2]) };
})();

describe('the pin after a title is drawn on the lock\'s grid', () => {
  for (const [where, html] of [['a list row', row], ['a board card', card]]) {
    it(`${where}: the same box, view and line weight as the lock`, () => {
      expect(box(svgOf(html, 'th-pin'))).toEqual(box(svgOf(html, 'th-lock')));
    });
  }

  it('its widest line is the top of the lock\'s body, end to end', () => {
    const all = pathsOf(svgOf(card, 'th-pin')).flat();
    const widest = Math.max(...all.map(([x]) => x)) - Math.min(...all.map(([x]) => x));
    const collar = all.filter(([, y]) => y === LOCK.top);
    expect(Math.min(...collar.map(([x]) => x))).toBe(LOCK.left);
    expect(Math.max(...collar.map(([x]) => x))).toBe(LOCK.right);
    expect(widest).toBe(LOCK.right - LOCK.left);
  });

  it('its top is the top of the shackle and its needle ends at the foot of the body', () => {
    const ys = pathsOf(svgOf(card, 'th-pin')).flat().map(([, y]) => y);
    expect(Math.min(...ys)).toBeCloseTo(LOCK.crown, 6);
    expect(Math.max(...ys)).toBe(LOCK.foot);
  });

  it('the same pin on a row and on a card', () => {
    expect(svgOf(card, 'th-pin')).toBe(svgOf(row, 'th-pin'));
  });
});

describe('and sits where the lock sits', () => {
  const css = fs.readFileSync(new URL('../renderer/src/threads/pages.css', import.meta.url), 'utf8');
  const rule = (sel) => css.match(new RegExp(`^\\${sel} \\{([^}]*)\\}`, 'm'))[1];
  const prop = (sel, p) => rule(sel).match(new RegExp(`${p}:\\s*([^;]+);`))?.[1].trim();
  it('the same gap before it', () => {
    expect(prop('.th-pin', 'margin-left')).toBe(prop('.th-lock', 'margin-left'));
  });
  it('on the same baseline', () => {
    expect(prop('.th-pin', 'vertical-align')).toBe(prop('.th-lock', 'vertical-align'));
  });
});

// The case that must not change: the menu's pin stands among the menu's other
// marks, which are all drawn on 24 units.
describe('the thread menu keeps its own pin', () => {
  it('on the 24-unit grid of every menu mark', () => {
    const menu = renderToStaticMarkup(React.createElement(PinMark));
    expect(attr(menu, 'viewBox')).toBe('0 0 24 24');
    expect(menu).not.toContain('th-pin');
  });
});
