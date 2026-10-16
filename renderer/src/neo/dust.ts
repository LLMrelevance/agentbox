// The gold dust sphere (approved in round one, designs/w-e85fd9144f/src/dust.js).
// `level` (0 to 1) is how loud Neo is speaking right now; it makes the dust breathe.

const TAU = Math.PI * 2;

function rand(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

type Mote = { t: [number, number, number]; x: number; y: number; z: number; ph: number; s: number };

export function dustOrb(canvas: HTMLCanvasElement, { n = 900, size = 0.95 } = {}) {
  const g = canvas.getContext('2d')!;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  g.scale(dpr, dpr);
  const R = Math.min(w, h) * 0.36 * size;
  const r = rand(11);
  const motes: Mote[] = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const rr = Math.sqrt(1 - y * y);
    const th = i * 2.399963;
    const loose = r() < 0.07;
    const shell = loose ? 1.15 + r() * 0.45 : 0.9 + r() * 0.12;
    const t: [number, number, number] = [Math.cos(th) * rr * shell, y * shell, Math.sin(th) * rr * shell];
    motes.push({ t, x: t[0], y: t[1], z: t[2], ph: r() * TAU, s: 0.45 + r() * 0.9 });
  }
  let level = 0;
  let running = true;
  const t0 = performance.now();
  const color = [255, 176, 120];

  function frame(now: number) {
    if (!running) return;
    const t = (now - t0) / 1000;
    g.clearRect(0, 0, w, h);
    const glow = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, R * 1.5);
    glow.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},${0.16 + level * 0.08})`);
    glow.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},0)`);
    g.fillStyle = glow;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';
    const rot = t * 0.25;
    const cr = Math.cos(rot), sr = Math.sin(rot), ct = Math.cos(0.35), st = Math.sin(0.35);
    for (const q of motes) {
      let [tx, ty, tz] = q.t;
      const puff = 1 + 0.035 * Math.sin(t * 1.3 * q.s + q.ph) + level * 0.14 * Math.sin(q.ph * 5 + t * 8);
      tx *= puff; ty *= puff; tz *= puff;
      q.x += (tx - q.x) * 0.06; q.y += (ty - q.y) * 0.06; q.z += (tz - q.z) * 0.06;
      const x = q.x * cr + q.z * sr;
      let z = -q.x * sr + q.z * cr;
      const y = q.y * ct - z * st;
      z = q.y * st + z * ct;
      const depth = (z + 1.4) / 2.8;
      const px = w / 2 + x * R, py = h / 2 + y * R;
      const a = 0.18 + depth * 0.75;
      const sz = (0.35 + depth * 0.85) * q.s * Math.max(0.8, Math.min(1.8, R / 90));
      g.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${a * 0.12})`;
      g.beginPath(); g.arc(px, py, sz * 2.6, 0, TAU); g.fill();
      g.fillStyle = `rgba(255,226,180,${a})`;
      g.beginPath(); g.arc(px, py, sz, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return {
    setLevel(v: number) { level = Math.max(0, Math.min(1, v)); },
    stop() { running = false; },
  };
}
