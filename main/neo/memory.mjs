// The file under Neo's memory (../../shared/neo-memory.mjs says what is in
// it): `<userData>/neo/memory.json`, beside prefs.json and the transcripts,
// so everything Neo keeps about one person sits in one folder.
//
// A read never throws. Losing what was remembered is a small thing; refusing
// to start a conversation over a half-written file is not.
import fs from 'node:fs';
import path from 'node:path';
import { EMPTY, addMemory, cleanMemory, forgetMemory, rememberedText, withInstructions } from '../../shared/neo-memory.mjs';

export function openMemory({ dir, now = Date.now } = {}) {
  const file = path.join(dir, 'memory.json');
  const read = () => {
    try { return cleanMemory(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return EMPTY; }
  };
  const write = (doc) => {
    fs.mkdirSync(dir, { recursive: true });
    const temporary = `${file}.tmp-${process.pid}`;
    fs.writeFileSync(temporary, `${JSON.stringify(doc, null, 1)}\n`, 'utf8');
    fs.renameSync(temporary, file);
    return doc;
  };
  return {
    read,
    remembered: () => rememberedText(read()),
    add(text) {
      const r = addMemory(read(), text, now());
      if (r.memory && !r.already) write(r.doc);
      return r;
    },
    forget(id) {
      const r = forgetMemory(read(), id);
      if (r.memory) write(r.doc);
      return r;
    },
    setInstructions(text) {
      return write(withInstructions(read(), text));
    },
  };
}
