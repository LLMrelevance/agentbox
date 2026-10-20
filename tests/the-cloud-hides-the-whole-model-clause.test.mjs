// THE CLOUD HIDES THE WHOLE MODEL CLAUSE, NOT JUST THE MODEL.
//
// On the cloud web app the reply box read "Medium priority. In Auto Mode. On ."
// (w-d66fd3175c): styles.css hid `.model-pick` under `:root[data-via="cloud"]`,
// which is the model word alone, and left the "On " before it and the full stop
// after it. Measured by reading the rule and the markup: in Focus.tsx the "On "
// and the "." were bare text beside <ModelPicker>, in no element the rule could
// reach.
//
// So the rule now hides a clause, and every "On <model>." has to sit inside one.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const css = read('renderer/src/styles.css').replace(/\/\*[\s\S]*?\*\//g, '');

// The classes the cloud rule hides, read off every `:root[data-via="cloud"] .x`
// rule whose body is `display: none`.
const hiddenOnCloud = () => {
  const out = new Set();
  for (const [, selectors, body] of css.matchAll(/([^{}]*data-via="cloud"[^{}]*)\{([^}]*)\}/g)) {
    if (!/display:\s*none/.test(body)) continue;
    for (const sel of selectors.split(',')) {
      const m = sel.trim().match(/^:root\[data-via="cloud"\]\s+\.([\w-]+)$/);
      if (m) out.add(m[1]);
    }
  }
  return out;
};

// The className of the nearest element that opens before `at` and has not
// closed by then.
const enclosingClass = (src, at) => {
  const before = src.slice(0, at);
  const stack = [];
  for (const m of before.matchAll(/<(\/?)span\b([^>]*?)(\/?)>/g)) {
    if (m[3]) continue;
    if (m[1]) stack.pop();
    else stack.push((m[2].match(/className="([^"]*)"/) ?? [])[1] ?? '');
  }
  return stack.at(-1) ?? null;
};

const modelClauses = (file) => {
  const src = read(file);
  const found = [...src.matchAll(/\{'On '\}\s*<ModelPicker/g)].map((m) => m.index);
  expect(found.length, `${file} has no "On <model>" clause`).toBeGreaterThan(0);
  return found.map((at) => {
    const after = src.slice(at);
    const pickerEnd = after.indexOf('/>', after.indexOf('<ModelPicker'));
    const tail = after.slice(pickerEnd + 2).trimStart();
    return { cls: enclosingClass(src, at), endsWithStop: tail.startsWith("{'.'}") };
  });
};

describe('on the cloud, the model clause goes whole', () => {
  for (const [file, name] of [
    ['renderer/src/components/Focus.tsx', 'the reply box'],
    ['renderer/src/components/Compose.tsx', 'the new task card'],
  ]) {
    it(`${name}: "On", the model and the full stop share one element the cloud hides`, () => {
      const hidden = hiddenOnCloud();
      for (const { cls, endsWithStop } of modelClauses(file)) {
        expect(endsWithStop).toBe(true);
        expect(cls, `"On " in ${file} is not inside any span`).toBeTruthy();
        const classes = cls.split(/\s+/);
        expect(classes.some((c) => hidden.has(c)), `${file}: "${cls}" is not hidden on the cloud`).toBe(true);
      }
    });
  }

  it('still hides the model word on the folded reply pill', () => {
    expect(hiddenOnCloud().has('ts-model')).toBe(false);
    expect(css).toMatch(/:root\[data-via="cloud"\]\s+\.dock-pill\s+\.ts-model[^{]*\{[^}]*display:\s*none/);
  });

  it('leaves the priority and the mode on screen', () => {
    const hidden = hiddenOnCloud();
    for (const kept of ['compose-sentence', 'compose-word', 'compose-word-wrap', 'clause', 'clause-priority']) {
      expect(hidden.has(kept), `.${kept} is hidden on the cloud`).toBe(false);
    }
  });
});
