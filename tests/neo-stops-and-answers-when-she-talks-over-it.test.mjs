// "it won't let me interrupt it—if it's talking too long and I say
// something, it just keeps on going" (2026-10-17). Measured on the app's own
// voice path (WebRTC in Electron, a recording as her microphone, muted,
// scripts/scratch/neo/rtc/): the service hears her and stops, but after
// answering it went back to what it had been saying (1 of 2 runs: "The card
// would sit at the top ... they need you to say go"), and in her 19:00
// session it carried on with the brief. Told once, as a general rule, it
// answered and stopped 5 of 5 times.
import { describe, expect, it } from 'vitest';
import { neoSession } from '../shared/neo-tools.mjs';

describe('talking over Neo', () => {
  it.each(['decisions', 'tools'])('the %s session tells the voice to answer her and not pick up where it was', (engine) => {
    const said = neoSession({ engine }).instructions;
    expect(said).toMatch(/When the person talks while you are speaking, stop and answer what they said/);
    expect(said).toMatch(/Do not go back to what you were saying unless they ask/);
  });
});
