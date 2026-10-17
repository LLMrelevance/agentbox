// WHAT NEO KEEPS AFTER THE SESSION ENDS (w-6a1c405642).
//
// Neo forgot everything the moment a conversation closed, so "never close a
// thread without asking me" had to be said again the next morning. The
// document below is what outlives a session: the instructions somebody writes
// for Neo in Settings, and the lines they told Neo to remember out loud.
//
// Measured against the file on disk as well as the shape, because the thing
// that breaks a kept document is a half-written file, not a wrong field name.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  EMPTY, LIMITS, addMemory, cleanMemory, forgetMemory, memoriesDocument, rememberedText,
  withInstructions, withMemoriesDocument,
} from '../shared/neo-memory.mjs';
import { openMemory } from '../main/neo/memory.mjs';

const AT = Date.UTC(2026, 9, 17, 9, 0, 0);

describe('the document Neo remembers with', () => {
  it('reads a file that is missing, empty or nonsense as nothing remembered', () => {
    expect(cleanMemory(undefined)).toEqual(EMPTY);
    expect(cleanMemory(null)).toEqual(EMPTY);
    expect(cleanMemory('not an object')).toEqual(EMPTY);
    expect(cleanMemory({ memories: 'nope', instructions: 7 })).toEqual(EMPTY);
    expect(cleanMemory({ memories: [null, 3, { text: '' }] })).toEqual(EMPTY);
  });

  it('keeps a memory with the words said, when it was said, and an id of its own', () => {
    const { doc, memory } = addMemory(EMPTY, '  Never   merge anything without asking me.  ', AT);
    expect(memory.text).toBe('Never merge anything without asking me.');
    expect(memory.at).toBe(AT);
    expect(memory.id).toMatch(/^m-/);
    expect(doc.memories).toEqual([memory]);
  });

  it('does not keep the same thing twice, and says so', () => {
    const first = addMemory(EMPTY, 'Call me by my first name.', AT);
    const again = addMemory(first.doc, 'call me by my first name', AT + 1000);
    expect(again.already).toBe(true);
    expect(again.doc.memories).toHaveLength(1);
    expect(again.memory.id).toBe(first.memory.id);
  });

  it('keeps nothing when there are no words to keep', () => {
    expect(addMemory(EMPTY, '   ', AT).memory).toBe(null);
    expect(addMemory(EMPTY, undefined, AT).memory).toBe(null);
    expect(addMemory(EMPTY, '   ', AT).doc).toEqual(EMPTY);
  });

  it('gives two memories kept in the same millisecond different ids', () => {
    const one = addMemory(EMPTY, 'Never speak first.', AT);
    const two = addMemory(one.doc, 'Always say the option number.', AT);
    expect(two.memory.id).not.toBe(one.memory.id);
    expect(two.doc.memories).toHaveLength(2);
  });

  it('forgets one by id and leaves the rest alone', () => {
    const one = addMemory(EMPTY, 'Never speak first.', AT);
    const two = addMemory(one.doc, 'Call me by my first name.', AT + 1);
    const gone = forgetMemory(two.doc, one.memory.id);
    expect(gone.memory.text).toBe('Never speak first.');
    expect(gone.doc.memories.map((m) => m.text)).toEqual(['Call me by my first name.']);
    // An id that is not there changes nothing.
    expect(forgetMemory(gone.doc, 'm-nothing').doc).toEqual(gone.doc);
    expect(forgetMemory(gone.doc, 'm-nothing').memory).toBe(null);
  });

  it('cuts one memory to its limit and drops the oldest past the count', () => {
    const long = addMemory(EMPTY, 'x'.repeat(LIMITS.text + 50), AT);
    expect(long.memory.text).toHaveLength(LIMITS.text);
    let doc = EMPTY;
    for (let i = 0; i < LIMITS.memories + 3; i++) doc = addMemory(doc, `memory ${i}`, AT + i).doc;
    expect(doc.memories).toHaveLength(LIMITS.memories);
    expect(doc.memories[0].text).toBe('memory 3');
    expect(doc.memories.at(-1).text).toBe(`memory ${LIMITS.memories + 2}`);
  });

  it('keeps the written instructions as they were typed, newlines and all, up to the limit', () => {
    const doc = withInstructions(EMPTY, '# How I work\n\n- Never read ids out loud.\n');
    expect(doc.instructions).toBe('# How I work\n\n- Never read ids out loud.\n');
    expect(withInstructions(EMPTY, 'y'.repeat(LIMITS.instructions + 10)).instructions).toHaveLength(LIMITS.instructions);
    expect(withInstructions(doc, 17).instructions).toBe('');
  });
});

/* ONE ENTRY A LINE, EDITED AS A RUNNING DOCUMENT. Their words, 2026-10-17:
   "For memories it should be one entry per memory, kind of like a running
   document." So the page reads and writes the whole thing as text, and the
   ids underneath have to survive that round trip: without them "forget that
   one" has nothing to aim at, and every line's date resets on every save. */
describe('the memories as a running document', () => {
  const two = addMemory(addMemory(EMPTY, 'Never merge without asking me.', AT).doc, 'Call me by my first name.', AT + 1).doc;

  it('is one entry a line, in the order they were kept', () => {
    expect(memoriesDocument(two)).toBe('- Never merge without asking me.\n- Call me by my first name.');
    expect(memoriesDocument(EMPTY)).toBe('');
  });

  it('comes back the same when nothing was changed, ids and dates and all', () => {
    expect(withMemoriesDocument(two, memoriesDocument(two), AT + 9999)).toEqual(two);
  });

  it('keeps the id and the date of a line that was not touched', () => {
    const edited = withMemoriesDocument(two, '- Never merge without asking me.\n- Always say the option number.', AT + 500);
    expect(edited.memories[0]).toEqual(two.memories[0]);
    expect(edited.memories[1]).toEqual({ id: expect.stringMatching(/^m-/), text: 'Always say the option number.', at: AT + 500 });
    expect(edited.memories[1].id).not.toBe(two.memories[1].id);
  });

  it('drops a line that was deleted, and reorders without losing anything', () => {
    expect(withMemoriesDocument(two, '- Call me by my first name.', AT).memories).toEqual([two.memories[1]]);
    const flipped = withMemoriesDocument(two, '- Call me by my first name.\n- Never merge without asking me.', AT);
    expect(flipped.memories).toEqual([two.memories[1], two.memories[0]]);
  });

  it('takes a line however it was bulleted, or not bulleted at all', () => {
    const d = withMemoriesDocument(EMPTY, '- one\n* two\n• three\n1. four\nfive', AT);
    expect(d.memories.map((m) => m.text)).toEqual(['one', 'two', 'three', 'four', 'five']);
  });

  it('skips blank lines and the same line written twice', () => {
    const d = withMemoriesDocument(EMPTY, '- one\n\n   \n- One!\n- two', AT);
    expect(d.memories.map((m) => m.text)).toEqual(['one', 'two']);
  });

  it('emptying the document forgets everything', () => {
    expect(withMemoriesDocument(two, '', AT)).toEqual(EMPTY);
    expect(withMemoriesDocument(two, '\n\n  \n', AT).memories).toEqual([]);
  });

  it('leaves the written instructions alone', () => {
    const d = withInstructions(two, 'Talk like a colleague.');
    expect(withMemoriesDocument(d, '- Never merge without asking me.', AT).instructions).toBe('Talk like a colleague.');
  });

  it('stops at the same count a spoken memory stops at', () => {
    const many = Array.from({ length: LIMITS.memories + 5 }, (_, i) => `- memory ${i}`).join('\n');
    expect(withMemoriesDocument(EMPTY, many, AT).memories).toHaveLength(LIMITS.memories);
  });
});

describe('what Neo is told it remembers', () => {
  it('says nothing at all when nothing is written and nothing is kept', () => {
    expect(rememberedText(EMPTY)).toBe('');
    expect(rememberedText(cleanMemory({ instructions: '   ' }))).toBe('');
  });

  it('carries the written instructions and every kept line', () => {
    const doc = addMemory(
      withInstructions(EMPTY, 'Talk to me like a colleague, not a butler.'),
      'Never close a thread without asking me.', AT,
    ).doc;
    const text = rememberedText(doc);
    expect(text).toContain('Talk to me like a colleague, not a butler.');
    expect(text).toContain('- Never close a thread without asking me.');
  });

  it('says these are the person\'s own words, so nothing in them reads as the app talking', () => {
    const text = rememberedText(addMemory(EMPTY, 'Call me by my first name.', AT).doc);
    expect(text.toLowerCase()).toContain('the person');
  });
});

describe('the file Neo keeps it in', () => {
  const open = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-memory-'));
    return { dir, memory: openMemory({ dir, now: () => AT }) };
  };

  it('reads nothing before anything has been written', () => {
    const { memory } = open();
    expect(memory.read()).toEqual(EMPTY);
    expect(memory.remembered()).toBe('');
  });

  it('writes what it keeps, and the next reader finds it', () => {
    const { dir, memory } = open();
    const added = memory.add('Never merge without asking.');
    expect(added.memory.text).toBe('Never merge without asking.');
    expect(openMemory({ dir }).read().memories.map((m) => m.text)).toEqual(['Never merge without asking.']);
    memory.setInstructions('Keep it short.');
    expect(openMemory({ dir }).read().instructions).toBe('Keep it short.');
    expect(openMemory({ dir }).remembered()).toContain('Never merge without asking.');
  });

  it('writes the whole running document the page hands it', () => {
    const { dir, memory } = open();
    const kept = memory.add('Never merge without asking.');
    memory.setMemories('- Never merge without asking.\n- Call me by my first name.');
    const again = openMemory({ dir });
    expect(again.read().memories.map((m) => m.text)).toEqual(['Never merge without asking.', 'Call me by my first name.']);
    expect(again.read().memories[0].id).toBe(kept.memory.id);
    expect(again.document()).toBe('- Never merge without asking.\n- Call me by my first name.');
  });

  it('forgets a line for good', () => {
    const { dir, memory } = open();
    const added = memory.add('Call me by my first name.');
    memory.forget(added.memory.id);
    expect(openMemory({ dir }).read().memories).toEqual([]);
  });

  it('starts over rather than throwing when the file is half-written', () => {
    const { dir, memory } = open();
    memory.add('Something.');
    fs.writeFileSync(path.join(dir, 'memory.json'), '{"memories":[{"text":"Some');
    expect(memory.read()).toEqual(EMPTY);
    expect(memory.add('Again.').memory.text).toBe('Again.');
    expect(openMemory({ dir }).read().memories.map((m) => m.text)).toEqual(['Again.']);
  });
});
