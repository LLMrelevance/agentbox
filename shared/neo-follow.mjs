// Which picture or design page Neo is talking about, from its own words as
// they arrive, so the app can put that one up while Neo says it
// (tests/neo-shows-each-picture-as-it-names-it.test.mjs). The last mention in
// the words so far wins.

const NUMS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const ORDS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'];
const NUM = `(\\d|${NUMS.join('|')})`;
const PICTURE = 'picture|image|screenshot|shot';
const DESIGN = 'design|mockup|mock-up|version|look|variant|layout|page';
const NOUN = `${PICTURE}|${DESIGN}|option|one`;
// Words in file names that say nothing about which picture it is.
const BLAND = new Set(['final', 'image', 'picture', 'screenshot', 'screen', 'shot', 'design', 'option', 'version', 'draft', 'mockup', 'copy', 'html', 'jpeg', 'with', 'from', 'this', 'that', 'page']);

const number = (w) => (/^\d$/.test(w) ? Number(w) : NUMS.indexOf(w.toLowerCase()) + 1);

/**
 * `said`: Neo's words so far. `pictures`: the latest message's pictures, in
 * Neo's numbering. `files`: its design pages. `options`: how many numbered
 * options the thread offers. Returns { kind: 'picture' | 'file', n } or null.
 */
export function followTarget(said, { pictures = [], files = [], options = 0 } = {}) {
  const text = String(said ?? '');
  const hits = [];
  const hit = (at, kind, n) => hits.push({ at, kind, n });

  for (const m of text.matchAll(new RegExp(`\\b(${PICTURE}|${DESIGN}|option)s?\\s+(?:number\\s+)?${NUM}\\b`, 'gi'))) {
    hit(m.index, nounKind(m[1]), number(m[2]));
  }
  for (const m of text.matchAll(new RegExp(`\\b(${ORDS.join('|')}|last)\\s+(${NOUN})\\b`, 'gi'))) {
    const kind = m[2].toLowerCase() === 'one' ? 'any' : nounKind(m[2]);
    const n = m[1].toLowerCase() === 'last' ? 0 : ORDS.indexOf(m[1].toLowerCase()) + 1;
    hit(m.index, kind, n);
  }
  // A spoken list: "1, keep the window. 2, switch to centered." or "2 is calm."
  for (const m of text.matchAll(new RegExp(`(?:^|[.;:!?]\\s+|\\b(?:and|or|then)\\s+)(?:number\\s+)?${NUM}(?:[,:)]\\s|\\s+(?:is|was|has|keeps|makes|uses|shows|goes|adds|would|will|does|glows)\\b)`, 'gi'))) {
    // "1 is up now" repeats what the app said it put up; it names nothing new.
    if (/^\s*(?:up|showing|on screen|beside)\b/i.test(text.slice(m.index + m[0].length))) continue;
    hit(m.index + m[0].search(/\S/), 'option', number(m[1]));
  }
  // A picture's own telling name: "Instrument" for instrument.png.
  pictures.forEach((name, i) => {
    for (const token of telling(name, pictures)) {
      const at = text.toLowerCase().lastIndexOf(token);
      if (at >= 0 && new RegExp(`\\b${token}\\b`, 'i').test(text.slice(at, at + token.length + 1))) hit(at, 'picture', i + 1);
    }
  });

  for (const h of hits.sort((a, b) => b.at - a.at)) {
    const target = resolve(h, { pictures, files, options });
    if (target) return target;
  }
  return null;
}

function nounKind(noun) {
  const w = noun.toLowerCase();
  if (w === 'option') return 'option';
  return new RegExp(`^(${PICTURE})$`).test(w) ? 'picture' : 'design';
}

function resolve({ kind, n }, { pictures, files, options }) {
  const p = pictures.length;
  const f = files.length;
  const last = (count) => (n === 0 ? count : n);
  if (kind === 'picture') return n <= p && last(p) >= 1 ? { kind: 'picture', n: last(p) } : null;
  if (kind === 'design' || kind === 'any') {
    if (p && last(p) <= p) return { kind: 'picture', n: last(p) };
    if (f && last(f) <= f) return { kind: 'file', n: last(f) };
    return null;
  }
  // An option stands for a picture only when there is one picture per option.
  if (p && p === options && last(p) <= p) return { kind: 'picture', n: last(p) };
  if (!p && f && f === options && last(f) <= f) return { kind: 'file', n: last(f) };
  return null;
}

// The words in one picture's name that no other picture shares.
function telling(name, all) {
  const words = (s) => String(s).toLowerCase().replace(/\.[a-z0-9]+$/, '').split(/[^a-z]+/).filter((w) => w.length >= 4 && !BLAND.has(w));
  const others = new Set(all.filter((x) => x !== name).flatMap(words));
  return words(name).filter((w) => !others.has(w));
}
