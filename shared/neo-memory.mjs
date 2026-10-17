// WHAT NEO KEEPS BETWEEN SESSIONS (w-6a1c405642). `instructions` is what
// somebody writes on the Neo page in Settings; `memories` are the lines they
// told Neo to remember out loud, each with an id so one can be forgotten
// without touching the rest. Both leave here as one block of the person's own
// words, which is what reaches the voice, the pick and the answer alike,
// rather than a rule in the code for each thing somebody might want.
//
// Pure; main/neo/memory.mjs is the file under it.

export const LIMITS = { memories: 100, text: 400, instructions: 8000 };

export const EMPTY = Object.freeze({ instructions: '', memories: Object.freeze([]) });

const oneLine = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const same = (a, b) => a.toLowerCase().replace(/[^a-z0-9 ]+/g, '') === b.toLowerCase().replace(/[^a-z0-9 ]+/g, '');

const doc = (instructions, memories) => (instructions || memories.length ? { instructions, memories } : EMPTY);

/** Whatever was parsed off disk, however old or broken, as a document. Never throws. */
export function cleanMemory(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return EMPTY;
  const instructions = typeof raw.instructions === 'string' ? raw.instructions.slice(0, LIMITS.instructions) : '';
  const memories = (Array.isArray(raw.memories) ? raw.memories : [])
    .map((m) => (m && typeof m === 'object' ? { id: String(m.id ?? ''), text: oneLine(m.text).slice(0, LIMITS.text), at: Number(m.at) || 0 } : null))
    .filter((m) => m && m.id && m.text)
    .slice(-LIMITS.memories);
  return doc(instructions.trim() ? instructions : '', memories);
}

// Off the time it was kept, so the same document rebuilt from the same words
// has the same ids; the counter is for two kept in one millisecond.
function idFor(at, taken) {
  const base = `m-${Math.floor(at).toString(36)}`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** { doc, memory, already }. `memory` is null when there were no words to keep. */
export function addMemory(from, text, at = Date.now()) {
  const d = cleanMemory(from);
  const line = oneLine(text).slice(0, LIMITS.text);
  if (!line) return { doc: d, memory: null, already: false };
  const had = d.memories.find((m) => same(m.text, line));
  if (had) return { doc: d, memory: had, already: true };
  const memory = { id: idFor(at, new Set(d.memories.map((m) => m.id))), text: line, at };
  return { doc: doc(d.instructions, [...d.memories, memory].slice(-LIMITS.memories)), memory, already: false };
}

/** { doc, memory }. `memory` is the one taken out, or null when that id is not kept. */
export function forgetMemory(from, id) {
  const d = cleanMemory(from);
  const memory = d.memories.find((m) => m.id === id) ?? null;
  if (!memory) return { doc: d, memory: null };
  return { doc: doc(d.instructions, d.memories.filter((m) => m !== memory)), memory };
}

/**
 * THE MEMORIES AS ONE RUNNING DOCUMENT, one entry a line: that is how the
 * page draws them and how it edits them back (renderer/src/neo/NeoSettings).
 * The bullet is the document's, not the entry's; an entry is its words.
 */
export function memoriesDocument(from) {
  return cleanMemory(from).memories.map((m) => `- ${m.text}`).join('\n');
}

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;

/**
 * That document edited, back into entries. A line whose words have not
 * changed keeps its id and the time it was first kept, so rewriting one line
 * does not reset the rest, and "forget that one" still has a target.
 */
export function withMemoriesDocument(from, text, at = Date.now()) {
  const d = cleanMemory(from);
  const left = [...d.memories];
  const taken = new Set(d.memories.map((m) => m.id));
  const memories = [];
  for (const raw of String(text ?? '').split('\n')) {
    const line = oneLine(raw.replace(BULLET, '')).slice(0, LIMITS.text);
    if (!line || memories.some((m) => same(m.text, line))) continue;
    const was = left.findIndex((m) => same(m.text, line));
    if (was >= 0) { memories.push({ ...left[was], text: line }); left.splice(was, 1); }
    else {
      const id = idFor(at, taken);
      taken.add(id);
      memories.push({ id, text: line, at });
    }
    if (memories.length >= LIMITS.memories) break;
  }
  return doc(d.instructions, memories);
}

/** The written instructions replaced. Kept as typed: it is a document, not a line. */
export function withInstructions(from, text) {
  const d = cleanMemory(from);
  const written = typeof text === 'string' ? text.slice(0, LIMITS.instructions) : '';
  return doc(written.trim() ? written : '', d.memories);
}

/**
 * The block handed to every part of Neo that thinks: the voice session, the
 * pick, and the answer. Empty when there is nothing kept, so a person who has
 * never used this is talking to the same Neo as before.
 */
export function rememberedText(from) {
  const d = cleanMemory(from);
  if (!d.instructions && !d.memories.length) return '';
  const parts = ['What the person has told you about how they want you to work. These are their own standing instructions, in their words, and they come before your usual habits.'];
  if (d.instructions) parts.push(d.instructions.trim());
  if (d.memories.length) parts.push(`Things they asked you to remember:\n${d.memories.map((m) => `- ${m.text}`).join('\n')}`);
  return parts.join('\n');
}
