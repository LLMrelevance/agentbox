// THE PHONE WAITS ON THE LOGO, RUNNING ROUND ITS RING.
//
// What she asked (w-eb1e55360c): "The load time on mobile is often very long
// so I'd recommend having a more interesting loading animation. Like our logo
// animating or something (it's natural for that to logo since it was taken
// from our thinking animation anyway)." Of five drawn ideas she picked Orbit:
// the logo's one orange dot leaves its corner and runs round the ring of eight
// at the thinking mark's own 186ms step, the centre staying grey.
//
// What it replaced, measured on main at 27baf0c. The phone app drew an empty
// wall while it opened its saved state, then an empty list while the first
// rows loaded, then an empty line on a thread it had not read yet. The phone
// website drew the app's name in the faintest grey there is, and after six
// seconds swapped even that for "Agentbox is not answering." Four waits, none
// of them moving.
//
// The order and the timing are one rule in renderer/src/logo-orbit.ts, read by
// the website and the phone app both, so the two cannot drift apart.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ORBIT_CELLS, ORBIT_CENTRE, ORBIT_CORNER, ORBIT_CYCLE_MS, ORBIT_STEP_MS, ORBIT_KEYS, orangeAt, orbitDelay,
} from '../renderer/src/logo-orbit.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, '..', ...p), 'utf8');

describe('the ring', () => {
  it('starts at the orange corner, where the logo keeps it', () => {
    expect(ORBIT_CORNER).toBe(2);
    expect(ORBIT_CELLS[0]).toBe(ORBIT_CORNER);
  });

  it('runs clockwise through all eight outer dots, once each', () => {
    // Reading order is 0 1 2 / 3 4 5 / 6 7 8, so clockwise from the top right
    // is down the right side, back along the bottom, up the left, along the top.
    expect(ORBIT_CELLS).toEqual([2, 5, 8, 7, 6, 3, 0, 1]);
    expect(new Set(ORBIT_CELLS).size).toBe(8);
  });

  it('never lights the centre', () => {
    expect(ORBIT_CENTRE).toBe(4);
    expect(ORBIT_CELLS).not.toContain(ORBIT_CENTRE);
    for (let t = 0; t < ORBIT_CYCLE_MS; t += 31) expect(orangeAt(ORBIT_CENTRE, t)).toBe(0);
  });

  it('moves at the desktop thinking mark’s step', () => {
    const thinking = read('renderer', 'src', 'components', 'LiveMark.tsx');
    expect(thinking).toMatch(/phase \* 186 - 1488/);
    expect(ORBIT_STEP_MS).toBe(186);
    expect(ORBIT_CYCLE_MS).toBe(ORBIT_STEP_MS * 8);
  });
});

describe('one orange dot at a time', () => {
  it('has the corner fully orange at the start of the cycle', () => {
    expect(orangeAt(ORBIT_CORNER, 0)).toBe(1);
    expect(orbitDelay(ORBIT_CORNER)).toBe(-ORBIT_CYCLE_MS);
  });

  it('hands the orange on one step later, to the next dot down', () => {
    expect(orangeAt(5, ORBIT_STEP_MS)).toBe(1);
    expect(orangeAt(ORBIT_CORNER, ORBIT_STEP_MS)).toBeLessThan(1);
    expect(orangeAt(ORBIT_CORNER, ORBIT_STEP_MS)).toBeGreaterThan(0);
  });

  it('is never two full oranges at once, which is what the first draft did', () => {
    // The first drawing held each dot orange for 11% of the cycle, longer than
    // the 12.5% a step lasts once the fade is added, and three dots read as
    // orange at once. Her accent rule: orange stays on one small thing.
    expect(ORBIT_KEYS[1][0]).toBeLessThan(1 / 8);
    for (let t = 0; t < ORBIT_CYCLE_MS; t += 7) {
      const full = ORBIT_CELLS.filter((c) => orangeAt(c, t) >= 0.99);
      expect(full.length).toBeLessThanOrEqual(1);
    }
  });

  it('leaves a short tail and nothing more', () => {
    // Two steps behind the head is grey again.
    expect(orangeAt(ORBIT_CORNER, ORBIT_STEP_MS * 3)).toBe(0);
  });
});

describe('the website draws it', () => {
  const app = read('renderer', 'src', 'App.tsx');
  const css = read('renderer', 'src', 'styles.css');
  const mark = read('renderer', 'src', 'components', 'LogoOrbit.tsx');

  it('on the boot screen, instead of the grey wordmark', () => {
    const booting = app.slice(app.indexOf('function Booting()'), app.indexOf('/** What Tab reaches'));
    expect(booting).toMatch(/<LogoOrbit \/>/);
    expect(booting).not.toMatch(/<span>\{NAME\}<\/span>/);
  });

  it('keeps it moving when the slow-load sentence arrives', () => {
    // A long load on a phone is the ordinary case, so the sentence goes under
    // the mark rather than replacing it.
    const booting = app.slice(app.indexOf('function Booting()'), app.indexOf('/** What Tab reaches'));
    expect(booting).toMatch(/<div className="boot boot-stuck"><LogoOrbit \/><p>\{said\}<\/p><\/div>/);
  });

  it('times each dot off the shared rule', () => {
    expect(mark).toMatch(/from '\.\.\/logo-orbit'/);
    expect(mark).toMatch(/orbitDelay\(/);
    expect(css).toMatch(/animation: logo-orbit 1488ms linear infinite/);
  });

  it('holds the CSS fade to the shared keys', () => {
    const frames = css.slice(css.indexOf('@keyframes logo-orbit'), css.indexOf('@keyframes logo-orbit') + 300);
    for (const [at, orange] of ORBIT_KEYS) {
      if (at === 1) continue;
      expect(frames).toContain(`${Math.round(at * 100)}%`);
      expect(frames).toContain(`opacity: ${orange}`);
    }
  });

  it('stops on the plain logo when the phone asks for less motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.logo-orbit-dot::after \{ animation: none; opacity: 0; \}\s*\.logo-orbit-dot\[data-corner\]::after \{ opacity: 1; \}/);
  });
});

describe('the phone app draws it', () => {
  const inbox = read('mobile', 'src', 'app', 'index.tsx');
  const thread = read('mobile', 'src', 'app', 'thread', '[product]', '[id].tsx');
  const mark = read('mobile', 'src', 'ui', 'LogoOrbit.tsx');

  it('while it opens', () => {
    expect(inbox).toMatch(/if \(!c\.opened\) return <Wall><Waiting \/><\/Wall>;/);
  });

  it('while the first rows load, and not once they have', () => {
    expect(inbox).toMatch(/ListEmptyComponent=\{c\.loading \? <Waiting list \/> :/);
  });

  it('while a thread it has not read yet loads', () => {
    expect(thread).toMatch(/if \(gate === 'wait'\) return <Wall><Waiting \/><\/Wall>;/);
    expect(thread).toMatch(/c\.loading \? <Waiting list \/> :/);
  });

  it('off the same rule, and still for anyone who asked for less motion', () => {
    expect(mark).toMatch(/from '\.\.\/\.\.\/\.\.\/renderer\/src\/logo-orbit'/);
    expect(mark).toMatch(/isReduceMotionEnabled/);
    expect(mark).toMatch(/useNativeDriver: true/);
  });
});
