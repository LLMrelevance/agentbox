// A PICTURE CAN GO INTO A REPLY IN A THREAD, AND ATTACH LOOKS LIKE ATTACH.
//
// Reported 2026-10-13 (w-140ac855b1): "In team threads I can't seem to attach
// images or paste them in the chat. At least for the reply, there doesn't seem
// to be an easy way to attach something." Measured on their screenshot and in
// the code before the change:
//
//  - The "Reply in thread…" box in the side panel was a bare textarea and a
//    Send button. No paste handler, no drop handler, no attach button: a
//    screenshot pasted there went nowhere.
//  - The chat's own reply box did take a paste, and had an attach button, but
//    it was drawn as a "+", sitting between "@" and the emoji face, and the
//    person looking straight at it did not read it as attach.
//
// So the panel's box now takes a picture the three ways the chat's box does,
// and both draw a paperclip.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ThreadPanel } from '../renderer/src/team/ThreadPanel.tsx';
import { FormatBar } from '../renderer/src/team/FormatBar.tsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const PLUS = 'M8 3v10M3 8h10';
const CLIP = 'm13.6 7.6-5.5 5.5';

const panel = () => renderToStaticMarkup(React.createElement(ThreadPanel, {
  product: 'talk-with-maya',
  parent: { at: 1, who: 'you', text: 'two tiers or three?', uid: 'u-1' },
  replies: [], md: (t) => React.createElement('p', null, t), width: 440,
  onSend: () => {}, onClose: () => {}, onResize: () => {},
}));

describe('the reply box in a thread', () => {
  it('has an attach button, drawn as a paperclip', () => {
    const html = panel();
    expect(html).toContain('aria-label="Attach a file"');
    expect(html).toContain(CLIP);
    expect(html).not.toContain(PLUS);
  });

  it('has the file picker the button opens, hidden', () => {
    expect(panel()).toMatch(/<input type="file" multiple="" style="display:none"/);
  });

  it('takes a pasted picture and a dropped one', () => {
    const src = code(read('renderer/src/team/ThreadPanel.tsx'));
    expect(src).toMatch(/onPaste=\{async \(e\) => \{\s*const pasted = await fromPaste\(e\)/);
    expect(src).toMatch(/onDrop=\{async \(e\) => \{[\s\S]*?collectFiles\(e\.dataTransfer\.files\)/);
  });

  // The file is saved into the conversation's own project, which is the folder
  // the team sync reads to send it on (main/team/sync.mjs), and the reply
  // carries the link to it after the words.
  it('saves the picture into the conversation and links it from the reply', () => {
    const src = code(read('renderer/src/team/ThreadPanel.tsx'));
    expect(src).toMatch(/\[words, await persistAttachments\(product, files\)\]\.filter\(Boolean\)\.join\('\\n\\n'\)/);
    expect(code(read('renderer/src/components/ItemThread.tsx'))).toMatch(/<ThreadPanel\s+product=\{item\.product\}/);
  });

  // THE BOUNDARY: a picture with no words is a reply worth sending, and an
  // empty box is still not.
  it('sends a picture with no words, and never an empty reply', () => {
    const src = code(read('renderer/src/team/ThreadPanel.tsx'));
    expect(src).toMatch(/if \(!words && !attachments\.length\) return;/);
    expect(src).toMatch(/const ready = !!draft\.trim\(\) \|\| attachments\.length > 0;/);
    expect(panel()).toMatch(/<button type="button" class="chat-thread-send" disabled="">Send<\/button>/);
  });
});

describe('the chat\'s own reply box', () => {
  const bar = (onAttach) => renderToStaticMarkup(React.createElement(FormatBar, { box: { current: null }, onChange: () => {}, onAttach }));

  it('draws attach as the same paperclip', () => {
    const html = bar(() => {});
    expect(html).toContain(CLIP);
    expect(html).not.toContain(PLUS);
  });

  // THE CASE THAT MUST NOT MATCH: where there is nothing to attach to, there is
  // no button at all.
  it('draws no attach button where there is nothing to attach to', () => {
    expect(bar(undefined)).not.toContain('Attach a file');
  });
});
