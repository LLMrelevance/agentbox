// Neo was to send the screenshot in her reply box with her feedback
// ("If a screenshot is present alongside feedback, it should probably be
// treated as an implicit request to send that screenshot", 2026-10-16). The
// bridge asked for it, but the app-side wrapper in useNeo.ts passed only the
// thread and the words on, so the ask never reached the reply box. Found by
// Codex reading the code.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../renderer/src/neo/useNeo.ts', import.meta.url), 'utf8');

describe('the screenshot ask reaches the reply box', () => {
  it('the wrapper passes the third argument on', () => {
    const line = src.split('\n').find((l) => /^\s*reply: /.test(l));
    expect(line).toBeTruthy();
    expect(line).toMatch(/reply: \(r, t, o\) => latest\.current\.reply\(r, t, o\)/);
  });
});
