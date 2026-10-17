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
  EMPTY, LIMITS, addMemory, cleanMemory, forgetMemory, rememberedText, withInstructions,
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
