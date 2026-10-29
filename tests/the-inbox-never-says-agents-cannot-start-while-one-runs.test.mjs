// A brand new user with ChatGPT signed in sent their first task and watched
// "Agents cannot start until they have a plan to run on" sit across the top of
// the inbox from Starting your task, through WORKING, and into Needs you,
// while the agent ran, finished and asked them a question (F-141, QA batch 008
// on main 5bf0ec64). The bar is drawn off one readiness probe taken when the
// walk ended and never asked again, so a probe that answered no once says it
// for the rest of the session. Measured from the four screenshots on the row:
// the same bar over IN PROGRESS 1 WORKING, then over NEEDS YOU 1 WAITING.
//
// And the tab they looked at next said "Nothing is running." with no word of
// where the thread had gone (F-142), which is true and useless.
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { planBarShows } from '../renderer/src/plan-setup.ts';
import { EmptyTab } from '../renderer/src/threads/Pages';

globalThis.React = React;
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('whether the inbox may say agents cannot start', () => {
  it('says it on a computer with no plan where nothing has run', () => {
    expect(planBarShows({ noPlan: true, agentsRan: false })).toBe(true);
  });

  it('stops saying it the moment an agent runs', () => {
    expect(planBarShows({ noPlan: true, agentsRan: true })).toBe(false);
  });

  it('keeps saying nothing on a computer with a plan', () => {
    expect(planBarShows({ noPlan: false, agentsRan: false })).toBe(false);
    expect(planBarShows({ noPlan: false, agentsRan: true })).toBe(false);
  });
});

describe('the inbox reads its own evidence', () => {
  const app = read('renderer/src/App.tsx');

  it('draws the bar through planBarShows rather than the probe alone', () => {
    expect(app).toMatch(/planBarShows\(\{ noPlan, agentsRan \}\)/);
    expect(app).not.toMatch(/\{noPlan && !run &&/);
  });

  // The walk's own row is not a worker: "the app itself is reading the folder.
  // There is no session behind it" (`runningRows`). Reading `liveIds` here
  // would let the tutorial silence the bar for everybody.
  it('takes its proof from the supervisor rather than the walk row', () => {
    const watch = app.slice(app.indexOf('const [agentsRan, setAgentsRan]'));
    const effect = watch.slice(0, watch.indexOf('}, ['));
    expect(effect).toContain('snap?.supervisor.running');
    expect(effect).not.toContain('liveIds');
    expect(effect).not.toContain('runningRows');
  });
});

describe('the In progress tab with nothing in it', () => {
  const draw = (props) => renderToStaticMarkup(React.createElement(EmptyTab, props));

  it('still says nothing is running', () => {
    expect(draw({ view: 'progress', waiting: 0 })).toContain('Nothing is running.');
  });

  it('says where the one thread went', () => {
    expect(draw({ view: 'progress', waiting: 1 })).toContain('Nothing is running. One thread waits in Needs you.');
  });

  it('counts them when there are several', () => {
    expect(draw({ view: 'progress', waiting: 4 })).toContain('Nothing is running. 4 threads wait in Needs you.');
  });

  it('says the task is starting instead, which is the newer news', () => {
    expect(draw({ view: 'progress', starting: true, waiting: 2 })).toContain('Starting your task…');
    expect(draw({ view: 'progress', starting: true, waiting: 2 })).not.toContain('in Needs you.');
  });

  it('leaves the other tabs alone', () => {
    expect(draw({ view: 'done', waiting: 3 })).not.toContain('in Needs you.');
    expect(draw({ view: 'snoozed', waiting: 3 })).not.toContain('in Needs you.');
  });

  it('is handed the count the Needs you tab itself draws', () => {
    const app = read('renderer/src/App.tsx');
    expect(app).toContain('<EmptyTab view={view} starting={!!landOn} waiting={needsYouCount.inbox} />');
  });
});
