// WHICH COMMANDS ARE HEAVY ON THIS MAC, LEARNED FROM WHAT THEY DID (w-3958c3753d).
//
// NOTHING HERE KNOWS WHAT ANY PROGRAM IS. The first proposal for holding heavy
// work back matched names (npm, pytest, xcodebuild) and the founder turned it
// down: another package manager, a script run directly, a training job, and a
// list of names is wrong. So a command is filed under what it is (its program
// and the first word after it that is not a flag) and judged by what it was
// measured using, here, the last few times it ran.
//
// THE ONE RULE THAT IS NOT NEGOTIABLE: missing evidence never makes a command
// light. Light means "measured light, more than once, and never heavy since".
// One heavy run is enough to make that exact command heavy. A program that has
// been light every time it was measured, across many different arguments, lends
// that to an argument it has not seen, and stops the moment one of its runs is
// measured as anything else.
//
// AND MISSING EVIDENCE DOES NOT MAKE A COMMAND HEAVY EITHER (w-b689e9fc0c). A
// run nothing measured is filed as `?` and read as nothing at all, rather than
// as a run that might have been big: see `measured` below for what that cost.
//
// A RUN THAT ENDED INSIDE 2 SECONDS AND WAS NEVER SEEN BIG COUNTS AS LIGHT.
// Measured on 2026-10-04 across 30 recent agent sessions (2006 commands): the
// median command ran 1.3 s, so most finish between two samples and would never
// be measured at all. A command that short cannot hold memory long enough to
// starve anything, which is the whole of what this gate is for. A command sent
// to the background is the exception: its tool call returns at once while its
// process carries on, so its quickness proves nothing.
//
// The five lines of shell knowledge below are about the SHELL, not about any
// program: builtins start nothing, and time/nice/env/timeout/nohup only run the
// command after them.

const BUILTINS = new Set(['cd', 'export', 'echo', 'printf', 'true', 'false', 'test', '[', '[[', ']]', 'set', 'unset',
  'pwd', 'read', 'exit', 'return', 'shift', 'wait', ':', 'alias', 'type', 'local', 'declare', 'pushd', 'popd', 'umask']);
const WRAPPERS = new Set(['time', 'nice', 'env', 'timeout', 'nohup', 'caffeinate', 'exec', 'command']);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const REDIRECT = /^\d*(>>?|<<?<?|&>>?|>&|<&)/;

/** Light below this many MB at its sampled peak, heavy at or above HEAVY_MB. */
export const LIGHT_MB = 150;
export const HEAVY_MB = 400;
/** A run this short, never seen big, counts as light. */
export const QUICK_MS = 2_000;

/**
 * Split a shell command into the programs it starts, as `program firstArg`
 * keys, without running or fully parsing it. `opaque` is true when part of it
 * is computed at run time ($(...) or backticks outside single quotes), which
 * this cannot see into.
 */
export function commandSegments(command) {
  const text = String(command ?? '');
  const segments = [];
  let words = [];
  let word = '';
  let inWord = false;
  let quote = null;
  let opaque = false;
  const heredocs = [];
  const endWord = () => {
    if (inWord) words.push(word);
    word = ''; inWord = false;
  };
  const endSegment = () => { endWord(); if (words.length) segments.push(words); words = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote === "'") {
      if (c === "'") quote = null; else word += c;
      continue;
    }
    if (c === '\\' && i + 1 < text.length) { word += text[++i]; inWord = true; continue; }
    if (quote === '"') {
      if (c === '"') quote = null;
      else {
        if (c === '`' || (c === '$' && text[i + 1] === '(')) opaque = true;
        word += c;
      }
      continue;
    }
    if (c === "'" || c === '"') { quote = c; inWord = true; continue; }
    if (c === '`' || (c === '$' && text[i + 1] === '(')) opaque = true;
    if (c === '<' && text[i + 1] === '<' && text[i + 2] !== '<') {
      // A here-document: its body is text handed to a program, not commands.
      endWord();
      let j = i + 2;
      if (text[j] === '-') j++;
      while (text[j] === ' ') j++;
      let delim = '';
      while (j < text.length && !/[\s;&|]/.test(text[j])) delim += text[j++];
      heredocs.push(delim.replace(/^['"]|['"]$/g, ''));
      i = j - 1;
      continue;
    }
    if (c === '\n') {
      endSegment();
      while (heredocs.length) {
        const delim = heredocs.shift();
        let end = text.indexOf('\n', i + 1);
        while (true) {
          const line = text.slice(i + 1, end === -1 ? text.length : end);
          i = end === -1 ? text.length : end;
          if (line.trim() === delim || end === -1) break;
          end = text.indexOf('\n', i + 1);
        }
      }
      continue;
    }
    if (c === ';' || c === '|' || (c === '&' && !/[<>]$/.test(word) && text[i + 1] !== '>')) {
      endSegment();
      if ((c === '|' || c === '&') && text[i + 1] === c) i++;
      continue;
    }
    if (c === ' ' || c === '\t') { endWord(); continue; }
    word += c; inWord = true;
  }
  endSegment();

  const keys = [];
  for (const seg of segments) {
    const key = keyOf(seg);
    if (key) keys.push(key);
  }
  return { keys, opaque };
}

function keyOf(segmentWords) {
  const words = [];
  for (let i = 0; i < segmentWords.length; i++) {
    const w = segmentWords[i];
    if (REDIRECT.test(w)) {
      // `> out.txt` carries its target as the next word; `>out.txt` does not.
      if (/^\d*(>>?|<|&>>?)$/.test(w)) i++;
      continue;
    }
    if (w === '(' || w === ')' || w === '{' || w === '}' || w === '!') continue;
    words.push(w);
  }
  let i = 0;
  while (i < words.length && ASSIGNMENT.test(words[i])) i++;
  while (i < words.length && WRAPPERS.has(basename(words[i]))) {
    i++;
    while (i < words.length && (words[i].startsWith('-') || /^\d+(\.\d+)?[smhd]?$/.test(words[i]) || ASSIGNMENT.test(words[i]))) i++;
  }
  if (i >= words.length) return null;
  const program = basename(words[i]);
  if (!program || BUILTINS.has(program)) return null;
  const arg = words.slice(i + 1).find((w) => !w.startsWith('-'));
  return arg ? `${program} ${arg.slice(0, 80)}` : program;
}

function basename(p) {
  const s = String(p);
  const at = s.lastIndexOf('/');
  return at === -1 ? s : s.slice(at + 1);
}

const programOf = (key) => key.split(' ')[0];

/**
 * The observations that are evidence, which is all of them but `?`.
 *
 * `?` IS THE ABSENCE OF EVIDENCE AND IS READ AS NOTHING AT ALL (w-b689e9fc0c).
 * It used to count against a command: `git branch` stood at "lllll?llll", nine
 * light runs and one that nothing measured, and the single `?` inside the last
 * five made every `git branch` command `unknown` — and because the command's own
 * record had answered, the `git` program record, ten light runs with nothing else
 * in it, was never reached. On a 16 GB M4 on 2026-10-07 that put
 * `git fetch -q origin | tail -2; git branch -r --contains <sha> | head -3`
 * behind one of two slots for 89 seconds to use 0 MB. One unmeasured run held
 * that command back for its next nine, and a loaded Mac is precisely where runs
 * go unmeasured, so the gate made itself hold more and more.
 *
 * The rule it must not break is the one above: missing evidence never makes a
 * command light. It cannot, because a `?` is dropped rather than counted, and
 * what is left still has to be light and still has to be more than one run.
 */
const measured = (list) => (list ?? []).filter((o) => o !== '?');

/**
 * Light, however it was learned. `l` is a run measured on its own; `c` is one
 * measured only as part of a chain (see `record`). THEY ARE READ THE SAME
 * EVERYWHERE, so writing `c` down moved no verdict; it is there to be counted
 * when the rule that distrusts it is chosen (w-0af52d5c86).
 */
const isLight = (o) => o === 'l' || o === 'c';

/**
 * The learned record. Each key and each program keeps its last ten
 * observations as letters: l light, c light but learned only as part of a
 * chain, m in between, h heavy, ? not measured. A BUILD OLDER THAN
 * w-0af52d5c86 DROPS c WHEN IT LOADS THIS, which costs those runs as evidence
 * and so holds a little more than it needs to; it cannot do the reverse and
 * call anything light that is not.
 * Both maps are kept in least-recently-seen-first order so the oldest falls off
 * first when either passes `maxKeys`.
 */
export class CommandHistory {
  constructor({ lightMb = LIGHT_MB, heavyMb = HEAVY_MB, maxKeys = 2_000 } = {}) {
    this.lightMb = lightMb;
    this.heavyMb = heavyMb;
    this.maxKeys = maxKeys;
    this.keys = new Map();
    this.programs = new Map();
  }

  /**
   * What one finished run tells us. `peakMb` null means it was never sampled.
   * Answers whether anything was filed.
   *
   * `onlyIfLight` is for a run whose memory reading belonged to several
   * commands at once: one `codex app-server` serves every Codex thread of a
   * login, so two Codex commands running together are measured together
   * (w-5601e99977). How long each took is still its own, so a quick one is
   * light on that alone — and anything else from such a run is dropped rather
   * than filed as "not measured", because that would un-learn a command this
   * app has seen light before, and missing evidence must never move a command
   * either way.
   */
  record(command, { peakMb = null, durationMs = null, background = false, onlyIfLight = false } = {}) {
    const { keys, opaque } = commandSegments(command);
    if (!keys.length) return false;
    let obs;
    if (typeof peakMb === 'number' && Number.isFinite(peakMb)) {
      obs = peakMb >= this.heavyMb ? 'h' : peakMb < this.lightMb ? 'l' : 'm';
    } else {
      obs = !background && typeof durationMs === 'number' && durationMs < QUICK_MS ? 'l' : '?';
    }
    if (onlyIfLight && obs !== 'l') return false;
    // A chain's memory belongs to the chain: `git status && npm test` measured
    // heavy says nothing bad about `git status`. Only a light chain vouches for
    // each of its parts.
    if (keys.length > 1 || opaque) {
      this._push(this.keys, chainKey(keys, opaque), obs);
      if (obs !== 'l') return true;
      // AND A CHAIN ONLY VOUCHES FOR THEM AS A CHAIN (w-0af52d5c86). Because
      // the line above returns early on anything but light, a segment key and a
      // program record are fed a LIGHT-ONLY sample of every chain they appear
      // in. Agents here nearly always run heavy work as a chain, so on a 16 GB
      // M4 on 2026-10-08 the program record `npx` stood at ten light runs and
      // no other letter, though `npx` runs every test suite in this repo, and
      // `npx vite build renderer 2>&1 | tail -5` was therefore called light.
      //
      // `c` is that light run, marked as learned only from a chain. EVERY RULE
      // READS `c` EXACTLY AS `l`, so nothing is classified differently for it;
      // the record is simply carrying the provenance, because without it the
      // cost of distrusting this evidence cannot be measured from any history
      // that exists. Choosing that rule is w-0af52d5c86's remaining question,
      // and it is not answered by writing the letter down.
      for (const key of keys) {
        this._push(this.keys, key, 'c');
        this._push(this.programs, programOf(key), 'c');
      }
      return true;
    }
    for (const key of keys) {
      this._push(this.keys, key, obs);
      this._push(this.programs, programOf(key), obs);
    }
    return true;
  }

  /** 'light' | 'unknown' | 'heavy' for a command about to run. */
  classify(command) {
    const { keys, opaque } = commandSegments(command);
    if (!keys.length && !opaque) return 'light';
    let verdict = 'light';
    const worse = (v) => {
      if (v === 'heavy' || verdict === 'heavy') verdict = 'heavy';
      else if (v === 'unknown') verdict = 'unknown';
    };
    // A COMMAND'S OWN RECORD OUTRANKS THE RECORDS OF ITS PARTS (w-0af52d5c86).
    // Its own record is the only one that ever covered everything the command
    // starts. Its parts are judged on a sample `record` feeds them only when a
    // chain came out light, so they drift light: `npx vitest` stood at ten
    // light runs while `npx vitest && tail` stood at `hmllllmmlm`, and the
    // suite was called light because the 'h' had aged past five and both parts
    // looked light.
    //
    // THIS KEY IS COARSER THAN THE COMMAND, and that is the price (Codex's
    // review). A key is `program firstArg`, so a full suite and one test file
    // are both `npx vitest`, and a chain keeps its segments but not which
    // separator joined them. An old heavy run therefore holds back the cheap
    // variants that share the key. Measured on this Mac's own history: of 86
    // keys the old rule had settled as light, the wider window newly holds
    // one, and that one is `npm run`, which earns it.
    //
    // A heavy run makes it heavy. A middling one (150-400 MB) only keeps it out
    // of `light`, which is the lane where `lightLane` of them run at once: four
    // middling runs in ten is not a reason to hold a command for minutes, and
    // is every reason not to let eight of it start together. `unknown` is that
    // answer, and `_holdsSlot` hands the slot back after `specWindowMs` once a
    // run has been measured under `heavyMb` — so it staggers when middling work
    // starts and does not cap how much of it runs at once.
    const own = measured(this.keys.get(keys.length > 1 || opaque ? chainKey(keys, opaque) : keys[0]));
    if (own.includes('h')) return 'heavy';
    if (own.includes('m')) worse('unknown');
    if (opaque) worse('unknown');
    for (const key of keys) worse(this._classifyKey(key));
    return verdict;
  }

  _classifyKey(key) {
    const own = this.keys.get(key);
    const recent = measured(own?.slice(-5));
    if (recent.includes('h')) return 'heavy';
    if (recent.length >= 2 && recent.every(isLight)) return 'light';
    if (recent.some((o) => !isLight(o))) return 'unknown';
    const prog = measured(this.programs.get(programOf(key))?.slice(-10));
    if (prog.length >= 5 && prog.every(isLight)) return 'light';
    return 'unknown';
  }

  _push(map, key, obs) {
    const list = map.get(key) ?? [];
    map.delete(key);
    list.push(obs);
    map.set(key, list.slice(-10));
    while (map.size > this.maxKeys) map.delete(map.keys().next().value);
  }

  toJSON() {
    return { v: 1, keys: [...this.keys], programs: [...this.programs] };
  }

  /** Anything unreadable is an empty history, which only means "unknown". */
  static fromJSON(raw, opts) {
    const h = new CommandHistory(opts);
    if (!raw || raw.v !== 1) return h;
    const load = (map, entries) => {
      if (!Array.isArray(entries)) return;
      for (const e of entries) {
        if (Array.isArray(e) && typeof e[0] === 'string' && Array.isArray(e[1])) {
          map.set(e[0], e[1].filter((o) => ['l', 'c', 'm', 'h', '?'].includes(o)).slice(-10));
        }
      }
    };
    load(h.keys, raw.keys);
    load(h.programs, raw.programs);
    return h;
  }
}

function chainKey(keys, opaque) {
  return `${opaque ? '$( ' : ''}${keys.join(' && ')}`;
}
