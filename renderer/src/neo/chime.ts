// Neo's two sounds, made here rather than shipped as files so they can be
// tuned in code: a short warm rising chime on waking, the same falling on
// signing off. The same every time, so the ear learns them.

let ctx: AudioContext | null = null;

function note(at: number, freq: number, length: number, gain: number) {
  const c = ctx!;
  const osc = c.createOscillator();
  const shimmer = c.createOscillator();
  const env = c.createGain();
  osc.type = 'triangle';
  shimmer.type = 'sine';
  osc.frequency.value = freq;
  shimmer.frequency.value = freq * 2;
  const shimmerGain = c.createGain();
  shimmerGain.gain.value = 0.18;
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(gain, at + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(env);
  shimmer.connect(shimmerGain).connect(env);
  env.connect(c.destination);
  osc.start(at); shimmer.start(at);
  osc.stop(at + length + 0.05); shimmer.stop(at + length + 0.05);
}

export function chime(direction: 'wake' | 'sleep') {
  ctx ??= new AudioContext();
  void ctx.resume();
  const t = ctx.currentTime + 0.02;
  const [a, b] = direction === 'wake' ? [659.25, 987.77] : [987.77, 659.25];
  note(t, a, 0.32, 0.10);
  note(t + 0.11, b, 0.42, 0.09);
}
