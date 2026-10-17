// Measured on the 10 minutes of talk on 2026-10-17 01:18, where the Decisions
// API ran in shadow beside Neo and logged what it would have done. It chose
// "none" — do nothing — for four plain requests:
//
//   "Jump into it"                              none 0.26  (next 0.09, cmd:open 0.06)
//   "Move on. We're on the next one."           none 0.69  (next 0.29)
//   "you accidentally moved us on, right"       none 0.53  (back 0.12)
//   "So. What is this again"                    none 0.49  (ask 0.32)
//
// It is live now, so each of those is Neo doing nothing when she asked for
// something. The reason is in the list it picks from: reply, pick, later,
// show, hide and file all carry the words she would say, and "none" carries
// three phrasings AND a catch-all, while next, back, open, inbox, summary and
// ask carry none at all. The bare options cannot win a close call.
//
// So every option that competes with "none" names the words she actually
// uses, and "none" stops claiming anything that merely sounds like filler.
import { describe, expect, it } from 'vitest';
import { buildOptions } from '../shared/neo-options.mjs';

const screen = {
  open: { id: 'w-a', title: 'Image preview modal redesign', options: [{ n: 1, text: 'Keep it' }], pictures: [{ n: 1, name: 'a.png' }, { n: 2, name: 'b.png' }], films: [], files: [] },
  rows: [{ id: 'w-a', title: 'Image preview modal redesign' }, { id: 'w-b', title: 'Personal to-dos design exploration' }],
  commands: [],
  canGoBack: true,
};

const list = buildOptions(screen).list;
const describedAs = (value) => list.find((o) => o.value === value)?.description ?? '';

describe('the options she reaches for carry her own words', () => {
  it('"jump into it" and "open that one" belong to opening a thread', () => {
    expect(describedAs('open:w-b')).toMatch(/jump in|open it|go to/i);
  });

  it('"move on" and "next one" belong to the next thread', () => {
    expect(describedAs('next')).toMatch(/move on|next one|skip/i);
  });

  it('"go back" and "you moved us on" belong to going back', () => {
    expect(describedAs('back')).toMatch(/go back|moved us on|back one/i);
  });

  it('"what is this again" belongs to answering about the thread', () => {
    expect(describedAs('ask')).toMatch(/what is this|what's this|again/i);
  });

  it('"what needs me" belongs to the inbox', () => {
    expect(describedAs('inbox')).toMatch(/what needs me|what's next|anything need/i);
  });
});

describe('doing nothing stops being the easy answer', () => {
  it('no longer claims any talk that is not asking for something', () => {
    expect(describedAs('none')).not.toMatch(/not asking for anything/i);
  });

  it('still owns a greeting and a hold-off, which is what it is for', () => {
    expect(describedAs('none')).toMatch(/greeting/i);
    expect(describedAs('none')).toMatch(/not yet|wait/i);
  });

  it('says a short command is never nothing, which is where it went wrong', () => {
    expect(describedAs('none')).toMatch(/short|a few words|command/i);
  });
});

describe('what she means by more than one picture', () => {
  // "You show me those? Images" showed one picture. Plural is not picture 1.
  it('comparing carries the plural askings', () => {
    expect(describedAs('compare')).toMatch(/show me the (images|pictures)|show them|all of them|both/i);
  });

  it('a single picture still says it is the one she means', () => {
    expect(describedAs('show:1')).toMatch(/the picture/i);
  });
});

describe('the list is still the same shape', () => {
  it('every option keeps a value, a description and an act', () => {
    for (const o of list) {
      expect(typeof o.value).toBe('string');
      expect(o.description.length).toBeGreaterThan(0);
      expect(o.act).toBeTruthy();
    }
  });

  it('changing the words changes the version, so a stale pick cannot be replayed', () => {
    const other = buildOptions({ ...screen, canGoBack: false });
    expect(buildOptions(screen).version).not.toBe(other.version);
  });
});
