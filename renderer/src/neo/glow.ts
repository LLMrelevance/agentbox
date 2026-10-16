// THE GLOW ON WHAT NEO JUST DID (approved 2026-10-15, designs/w-e85fd9144f
// round nine): the whole section blooms and is lit from within, at the softer
// strength, with a quiet halo of loose dust just outside it. Never an outline,
// and no stream of dust from the orb.
//
// It is drawn in a layer of its own over the app rather than as a class on the
// section, so no component's styles have to know about it, and it follows the
// section if the list moves under it.

const HOLD_MS = 3200;
const FADE_MS = 700;

let current: { stop(): void } | null = null;

function haloCanvas(layer: HTMLElement, band = 10, n = 70, opacity = 0.55) {
  const c = document.createElement('canvas');
  c.className = 'neo-halo';
  c.style.opacity = String(opacity);
  layer.appendChild(c);
  const g = c.getContext('2d')!;
  let s = 17;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const motes = Array.from({ length: n }, () => ({ u: r(), d: 4 + Math.pow(r(), 1.8) * band, ph: r() * 6.28, sp: 0.3 + r() * 0.9, s: 0.4 + r() * 0.9 }));
  const t0 = performance.now();
  return function draw(w: number, h: number, now: number) {
    const P = band + 30;
    const W = w + P * 2, H = h + P * 2;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      Object.assign(c.style, { left: `${-P}px`, top: `${-P}px`, width: `${W}px`, height: `${H}px` });
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const per = 2 * (w + h);
    const edge = (u: number): [number, number, number, number] => {
      u = ((u % per) + per) % per;
      if (u < w) return [u, 0, 0, -1]; u -= w;
      if (u < h) return [w, u, 1, 0]; u -= h;
      if (u < w) return [w - u, h, 0, 1]; u -= w;
      return [0, h - u, -1, 0];
    };
    const t = (now - t0) / 1000;
    g.clearRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    for (const m of motes) {
      const [ex, ey, nx, ny] = edge(m.u * per + t * 4 * m.sp);
      const d = m.d + Math.sin(t * m.sp + m.ph) * 3;
      const px = ex + nx * d + P, py = ey + ny * d + P;
      const a = (0.25 + 0.75 * Math.abs(Math.sin(t * m.sp * 1.4 + m.ph))) * (1 - m.d / (band + 6));
      g.fillStyle = `rgba(255,176,120,${a * 0.14})`; g.beginPath(); g.arc(px, py, m.s * 2.8, 0, 6.283); g.fill();
      g.fillStyle = `rgba(255,226,180,${a})`; g.beginPath(); g.arc(px, py, m.s, 0, 6.283); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  };
}

/** Lights up `el` for a few seconds. A new glow replaces the last one. */
export function glowOn(el: Element | null) {
  current?.stop();
  current = null;
  if (!el) return;
  const layer = document.createElement('div');
  layer.className = 'neo-glow';
  layer.innerHTML = '<div class="neo-glow-bloom"></div><div class="neo-glow-core"></div>';
  document.body.appendChild(layer);
  const draw = haloCanvas(layer);
  let raf = 0;
  let stopped = false;
  const frame = (now: number) => {
    if (stopped) return;
    const box = el.getBoundingClientRect();
    if (!el.isConnected || !box.width) { stop(); return; }
    Object.assign(layer.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    draw(box.width, box.height, now);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  const fade = window.setTimeout(() => layer.classList.add('neo-glow-out'), HOLD_MS);
  const end = window.setTimeout(() => stop(), HOLD_MS + FADE_MS);
  function stop() {
    stopped = true;
    cancelAnimationFrame(raf);
    clearTimeout(fade); clearTimeout(end);
    layer.remove();
  }
  current = { stop };
}
