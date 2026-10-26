// "SEND AS 2 SEPARATE THREADS" STARTED TWO AGENTS ON ONE CLICK (F-86, QA
// batch 004, 2026-10-26).
//
// How it was measured: a two line list typed into the new thread card, the
// link clicked to see how it would be split. Two threads were made and started
// at once, the toast said "Started 2 threads in Sandbox 1", and the only
// reading of the split was in the inbox afterwards.
//
// The link asks now, and the send is its own word beside the answer. It does
// NOT print the lines back: they are in the box an inch above, word for word,
// and the first drawing of this put the same two lines on screen twice.
// Backing out leaves Send exactly as it was, one thread.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { listedTasks } from '../renderer/src/message-split.ts';

const composer = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../renderer/src/threads/thread-composer.css', import.meta.url), 'utf8');

// The two lines from the report, as they were typed.
const TYPED = '- Add a reverse_words(s) function with one unit test\n- Add an is_blank(s) function with one unit test';

describe('the link', () => {
  it('opens the split instead of sending it', () => {
    expect(composer).toMatch(/onClick=\{\(\) => setSplitAsked\(true\)\}>Send as \{listed\.length\} separate threads/);
  });
  it('is the only thing the first click does, so nothing is composed', () => {
    const shut = composer.slice(composer.indexOf('setSplitAsked(true)'), composer.indexOf('setSplitAsked(true)') + 120);
    expect(shut).not.toMatch(/sendTask/);
  });
});

describe('the split, once it is open', () => {
  const open = composer.match(/\(splitOpen \? \(([\s\S]*?)\) : \(/)[1];
  it('says the rule it would use, and never prints the lines back', () => {
    expect(open).toContain('One thread for each line.');
    expect(open).not.toMatch(/listed\.map\(/);
    // Which is one thread per line of what was typed, marks off.
    expect(listedTasks(TYPED)).toEqual([
      'Add a reverse_words(s) function with one unit test',
      'Add an is_blank(s) function with one unit test',
    ]);
  });
  it('sends from its own word, which counts the threads it is about to start', () => {
    expect(open).toMatch(/onClick=\{\(\) => void sendTask\(\{ asList: true \}\)\}>Send \{listed\.length\} threads/);
  });
  it('backs out to the one thread Send has always made', () => {
    expect(open).toMatch(/onClick=\{\(\) => setSplitAsked\(false\)\}>Keep it as one/);
  });
  it('closes itself when the words stop being a list', () => {
    expect(composer).toMatch(/const splitOpen = splitAsked && listed\.length > 1;/);
  });
  it('draws as the card\'s own note, not as a browser slab', () => {
    expect(composer).toMatch(/className="tc-note tc-split"/);
    expect(css).toMatch(/\.tc-split/);
  });
});

describe('what Send itself does', () => {
  it('is untouched, one thread, whether the split is open or not', () => {
    expect(composer).toMatch(/const canSend = !sending &&/);
    for (const m of composer.matchAll(/className="tc-send-main"[^>]*>/g)) expect(m[0]).not.toMatch(/asList/);
  });
});
