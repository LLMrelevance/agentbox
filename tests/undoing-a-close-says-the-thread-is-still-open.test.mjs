// UNDOING A CLOSE SAYS THE THREAD IS STILL OPEN, NOT "NOTHING WAS SENT".
//
// What broke: the pre-deploy breaker (verify-agentbox, 2026-10-15, seen twice)
// closed a running task with E and pressed Z inside the three-second window.
// The toast said "Undone. Nothing was sent." The task had been sent long
// before, the agent kept working and its answer arrived. The sentence was
// written for a reply held in the window and was said after every action.
//
// Each action held in the window now says what undoing it left: a reply's
// words are back in the box, a close leaves the thread open, and anything else
// says nothing changed, which is true because nothing was written.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { graceUndoneLine } from '../renderer/src/undo-window';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, '..', 'renderer', 'src', 'App.tsx'), 'utf8');

describe('what Z inside the grace window says', () => {
  it('a close: the thread is still open', () => {
    expect(graceUndoneLine({ said: 'Closed: Fix the login page', restored: false }))
      .toBe('Undone. Still open: Fix the login page');
  });

  it('a reply: the words are back in the reply box, as before', () => {
    expect(graceUndoneLine({ said: 'Sent', restored: true }))
      .toBe('Undone. Your message is back in the reply box.');
  });

  it('any other action: nothing changed', () => {
    expect(graceUndoneLine({ said: 'Approved', restored: false })).toBe('Undone. Nothing changed.');
    expect(graceUndoneLine({ said: undefined, restored: false })).toBe('Undone. Nothing changed.');
  });

  it('never says "Nothing was sent"', () => {
    for (const said of ['Closed: X', 'Approved', 'Doing it in this thread: X', undefined]) {
      expect(graceUndoneLine({ said, restored: false })).not.toMatch(/Nothing was sent/);
    }
  });
});

describe('the wiring in App.tsx', () => {
  it('keeps what the action said, and the undo reads it', () => {
    expect(app).not.toMatch(/'Undone\. Nothing was sent\.'/);
    expect(app).toMatch(/showToast\(graceUndoneLine\(\{ said: pending\.said, restored: !!restored \}\)\)/);
    expect(app).toMatch(/pendingRef\.current = \{ item, timer, run, restore, undid, said: toast \}/);
  });
});
