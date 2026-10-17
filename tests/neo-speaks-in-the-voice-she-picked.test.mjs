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
