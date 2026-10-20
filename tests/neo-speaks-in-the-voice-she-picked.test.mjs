// "what I would really really love would be the ability to hear different
// voices and choose them" (2026-10-17). GPT-Live took these ten names and
// refused others (scripts/scratch/neo/voices-probe.mjs); an unknown name
// failed the whole session ("Voice session access denied"), so only these go.
import { describe, expect, it } from 'vitest';
import { neoSession, VOICES } from '../shared/neo-tools.mjs';

describe('the voice Neo speaks in', () => {
  it('is one of the ten the service takes', () => {
    expect(VOICES).toEqual(['marin', 'cedar', 'alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse']);
  });

  it('goes into the session when she has picked one', () => {
    expect(neoSession({ voice: 'cedar' }).audio).toEqual({ output: { voice: 'cedar' } });
  });

  it('a name the service does not take is left out, so the session still starts', () => {
    expect(neoSession({ voice: 'zzz' }).audio).toBeUndefined();
  });
});

// "I want to keep our voice and then give people a way to maybe choose between
// the other voices." Marin stays the default; Settings › Neo lists the ten,
// each with a sample to hear, and the pick is kept for the next session.
describe('choosing a voice in Settings', async () => {
  const fs = await import('node:fs');
  it('every voice has a sample to hear', () => {
    for (const v of VOICES) expect(fs.existsSync(new URL(`../renderer/src/neo/voices/${v}.m4a`, import.meta.url)), v).toBe(true);
  });

  it('marin is the default, and is first', () => {
    expect(VOICES[0]).toBe('marin');
  });
});
