// NEEDS YOU LIGHTS WHEN A THREAD LANDS THERE WHILE YOU WATCH ANOTHER TAB.
//
// Reported on w-22da913d00 (2026-10-17): someone watching In Progress did not
// notice when a thread moved into Needs You, because nothing on the Needs You
// tab changed apart from its number. Now its count sits in a small lit chip
// until you open Needs You.
//
// The chip must not move the tabs when it lights, so every count keeps the
// chip's room at rest and lighting only paints it. The count's letter spacing
// is 0 so the digit sits centred in the chip: with the tabs' spacing it sat
// about a pixel left, measured off the round ten close-up.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { needsYouLit } from '../renderer/src/unread.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', 'renderer', 'src', f), 'utf8');
const answered = (id, ts) => ({ id, createdAt: 1, wrote: { result: { ts, source: 'agent' } } });

describe('Needs You lights', () => {
  it('when a thread arrived there after you last looked', () => {
    expect(needsYouLit([answered('a', 500), answered('b', 2_000)], 1_000)).toBe(true);
  });
  it('not when everything there arrived before you last looked', () => {
    expect(needsYouLit([answered('a', 500), answered('b', 999)], 1_000)).toBe(false);
  });
  it('not for a thread that arrived the moment you looked', () => {
    expect(needsYouLit([answered('a', 1_000)], 1_000)).toBe(false);
  });
  it('not when Needs You is empty', () => {
    expect(needsYouLit([], 1_000)).toBe(false);
  });
});

describe('the tab draws it', () => {
  const pages = read('threads/Pages.tsx');
  it('as a class on Needs You, only while another tab is open', () => {
    expect(pages).toMatch(/t\.view === 'inbox' && lit && view !== 'inbox' \? ' fresh' : ''/);
  });
  it('from App, which remembers when you last had Needs You open', () => {
    const app = read('App.tsx');
    expect(app).toMatch(/lit=\{needsYouLit\(inbox, needsLookedAt\)\}/);
  });

  const css = read('team/team.css');
  it('with every count keeping the chip’s room, so nothing moves when it lights', () => {
    expect(css).toMatch(/\.tm-tab b \{[^}]*display: inline-block;[^}]*padding: 0 5px;[^}]*letter-spacing: 0;/);
    const fresh = css.match(/\.tm-tab\.fresh b \{([^}]*)\}/)?.[1] ?? '';
    expect(fresh).toMatch(/background:/);
    expect(fresh).not.toMatch(/padding|margin|width|font-size/);
  });
});
