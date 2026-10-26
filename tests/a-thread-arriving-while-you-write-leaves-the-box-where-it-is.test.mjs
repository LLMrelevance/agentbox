// A THREAD ARRIVING WHILE YOU WRITE LEAVES THE BOX WHERE IT IS (w-8d12087e6b).
//
// "The moment a task comes into my Needs You, I've lost it." The New thread
// box on the empty inbox was drawn only while Needs you was empty, so a thread
// landing mid-sentence swapped the page for the list under your hands. The
// words survived in the saved draft, but the box, the caret and the project
// you picked were gone, and the next letters you typed went to the inbox's
// keys (E closes the thread you are on). Measured on the page's own rule:
// App.tsx drew InboxClear only on `list.length === 0`.
//
// Now the page stays while the keyboard is in the box, its heading says what
// arrived, and it gives way when you send or step out.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';

globalThis.React = React;

let emptyInboxStays, emptyInboxHeading, InboxClear;
beforeAll(async () => {
  ({ emptyInboxStays, emptyInboxHeading } = await import('../renderer/src/threads/composer-rules'));
  ({ InboxClear } = await import('../renderer/src/threads/Pages'));
});

describe('whether the empty inbox stays on screen', () => {
  it('stays while nothing needs you, whatever you are doing', () => {
    expect(emptyInboxStays({ waiting: 0, onScreen: false, writing: false })).toBe(true);
    expect(emptyInboxStays({ waiting: 0, onScreen: true, writing: true })).toBe(true);
  });

  it('stays when a thread lands while you are in the box', () => {
    expect(emptyInboxStays({ waiting: 1, onScreen: true, writing: true })).toBe(true);
    expect(emptyInboxStays({ waiting: 4, onScreen: true, writing: true })).toBe(true);
  });

  it('gives way to the list once you are out of the box', () => {
    expect(emptyInboxStays({ waiting: 1, onScreen: true, writing: false })).toBe(false);
  });

  it('is never brought back over a list that is already showing', () => {
    expect(emptyInboxStays({ waiting: 1, onScreen: false, writing: true })).toBe(false);
  });
});

describe('what the heading says', () => {
  it('says nothing needs you when nothing does', () => {
    expect(emptyInboxHeading(0)).toBe('Nothing needs you');
  });

  it('counts what landed while you were writing', () => {
    expect(emptyInboxHeading(1)).toBe('1 thread needs you');
    expect(emptyInboxHeading(2)).toBe('2 threads need you');
  });

  it('is drawn on the page', () => {
    const html = renderToStaticMarkup(React.createElement(InboxClear, { slot: () => {}, waiting: 3 }));
    expect(html).toContain('<h2>3 threads need you</h2>');
  });
});

describe('the app holds the page and lets it go', () => {
  const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
  const box = fs.readFileSync(new URL('../renderer/src/threads/ThreadComposer.tsx', import.meta.url), 'utf8');

  it('asks the rule, with whether you are writing in the box', () => {
    expect(app).toMatch(/emptyInboxStays\(\{[^}]*writing: clearWriting/);
    expect(app).toContain('onWriting={setClearWriting}');
  });

  it('counts writing by where the keyboard is, so switching apps does not end it', () => {
    expect(box).toMatch(/card\.current\?\.contains\(document\.activeElement\)/);
  });

  it('steps out of the box after a send when threads are waiting', () => {
    const sending = app.slice(app.indexOf('onSending={walkCard'), app.indexOf('onSending={walkCard') + 1200);
    expect(sending).toMatch(/clearHeld/);
    expect(sending).toMatch(/\.blur\(\)/);
  });
});
