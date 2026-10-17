// A picture in a thread, opened full screen over it. The side pane is still one
// press away ("Open beside"), and so is Preview.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { clickZoom, fitScale, panToKeep, stepTo, zoomBy } from '../picture-view';
import { CrossIcon } from './CrossIcon';

export type Picture = { path: string; url: string | null };

/** How long the pointer has to rest before the controls fade and leave only the picture. */
const IDLE_MS = 2400;

/** Every picture drawn in this thread, in reading order, with the url it loaded from. */
export function picturesOnScreen(root: ParentNode | null): Picture[] {
  if (!root) return [];
  const seen = new Set<string>();
  const out: Picture[] = [];
  root.querySelectorAll<HTMLButtonElement>('.inline-image-open, .folder-preview-shot').forEach((b) => {
    const path = b.title;
    const img = b.querySelector('img');
    if (!path || !img || seen.has(path)) return;
    seen.add(path);
    out.push({ path, url: img.currentSrc || img.src });
  });
  return out;
}

// The cross's recipe: a 24 grid, a 1.1 hairline, round caps, no fill.
function Glyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
const CHEVRON_LEFT = 'M14.5 5.5 8 12l6.5 6.5';
const CHEVRON_RIGHT = 'M9.5 5.5 16 12l-6.5 6.5';
const BESIDE = 'M4.5 5.5h15v13h-15zM14 5.5v13';
const OUTSIDE = 'M13.5 4.5h6v6M19.5 4.5l-8 8M17.5 13.5v6h-13v-13h6';

export function PictureView({ pictures, start, resolve, onClose, onBeside, onPreview }: {
  pictures: Picture[];
  start: number;
  resolve: (path: string) => Promise<string | null>;
  onClose: () => void;
  onBeside: (path: string) => void;
  onPreview: (path: string) => void;
}) {
  const [index, setIndex] = useState(start);
  const shown = pictures[index];
  const [url, setUrl] = useState<string | null>(shown?.url ?? null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [idle, setIdle] = useState(false);
  const stage = useRef<HTMLDivElement | null>(null);
  const dialog = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number; moved: boolean } | null>(null);
  const idleTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setZoom(1); setPan({ x: 0, y: 0 }); setNatural({ w: 0, h: 0 });
    if (!shown) return;
    if (shown.url) { setUrl(shown.url); return; }
    let live = true;
    setUrl(null);
    resolve(shown.path).then((u) => { if (live) setUrl(u); }).catch(() => {});
    return () => { live = false; };
  }, [index]);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The controls stay while the pointer rests on one of them.
  const wake = (e?: { target: EventTarget | null }) => {
    setIdle(false);
    window.clearTimeout(idleTimer.current);
    if ((e?.target as HTMLElement | null)?.closest?.('.pv-chrome')) return;
    idleTimer.current = window.setTimeout(() => setIdle(true), IDLE_MS);
  };
  useEffect(() => { wake(); return () => window.clearTimeout(idleTimer.current); }, []);

  // Taken at the window before the app's own keys, so J, K and Esc act on the
  // picture and not on the thread behind it.
  useEffect(() => {
    dialog.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      e.stopImmediatePropagation();
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); setIndex((i) => stepTo(i, pictures.length, e.key === 'ArrowRight' ? 1 : -1)); }
      else if (e.key === '=' || e.key === '+') setZoom((z) => zoomBy(z, 1.5));
      else if (e.key === '-') { setZoom((z) => zoomBy(z, 1 / 1.5)); setPan({ x: 0, y: 0 }); }
      else if (e.key === '0') { setZoom(1); setPan({ x: 0, y: 0 }); }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [pictures.length]);

  const fit = fitScale(natural, box);
  const drawn = { w: natural.w * fit, h: natural.h * fit };
  const clampPan = (p: { x: number; y: number }, z: number) => {
    const lx = Math.max(0, (drawn.w * z - box.w) / 2);
    const ly = Math.max(0, (drawn.h * z - box.h) / 2);
    return { x: Math.max(-lx, Math.min(lx, p.x)), y: Math.max(-ly, Math.min(ly, p.y)) };
  };

  const down = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    drag.current = { px: e.clientX, py: e.clientY, x: pan.x, y: pan.y, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.px, dy = e.clientY - d.py;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (zoom > 1 && d.moved) setPan(clampPan({ x: d.x + dx, y: d.y + dy }, zoom));
  };
  const fromMiddle = (e: { clientX: number; clientY: number }) => {
    const r = stage.current?.getBoundingClientRect();
    return r ? { x: e.clientX - (r.left + r.width / 2), y: e.clientY - (r.top + r.height / 2) } : { x: 0, y: 0 };
  };
  const up = (e: ReactPointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    const next = clickZoom(zoom, fit);
    setZoom(next);
    setPan(next === 1 ? { x: 0, y: 0 } : clampPan(panToKeep(fromMiddle(e), pan, zoom, next), next));
  };
  const wheel = (e: ReactWheelEvent) => {
    if (e.ctrlKey) {
      const next = zoomBy(zoom, Math.exp(-e.deltaY * 0.01));
      const at = fromMiddle(e);
      setZoom(next);
      setPan((p) => (next === 1 ? { x: 0, y: 0 } : clampPan(panToKeep(at, p, zoom, next), next)));
    } else if (zoom > 1) {
      setPan((p) => clampPan({ x: p.x - e.deltaX, y: p.y - e.deltaY }, zoom));
    }
  };

  if (!shown) return null;
  const name = shown.path.split('/').pop() ?? shown.path;
  const many = pictures.length > 1;
  const go = (by: number) => setIndex(stepTo(index, pictures.length, by));

  return createPortal(
    <div
      ref={dialog}
      tabIndex={-1}
      role="dialog"
      aria-label={name}
      className={`picture-view${idle && zoom === 1 ? ' pv-idle' : ''}`}
      onPointerMove={wake}
      onPointerDown={wake}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {url && <div className="pv-glow" style={{ backgroundImage: `url("${url}")` }} aria-hidden="true" />}
      <div ref={stage} className="pv-stage" onWheel={wheel} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        {url && (
          <img
            key={url}
            src={url}
            alt={name}
            crossOrigin="anonymous"
            draggable={false}
            className={`pv-img${zoom > 1 ? ' pv-zoomed' : ''}`}
            style={{
              width: drawn.w || undefined, height: drawn.h || undefined,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              visibility: natural.w ? 'visible' : 'hidden',
            }}
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
          />
        )}
      </div>

      <header className="pv-top pv-chrome">
        <span className="pv-title">
          <span className="pv-name">{name}</span>
          {many && <span className="pv-count">{index + 1} / {pictures.length}</span>}
        </span>
        <span className="pv-tools">
          <button type="button" className="pv-icon" onClick={() => onBeside(shown.path)} title="Open beside the thread" aria-label="Open beside the thread"><Glyph d={BESIDE} /></button>
          <button type="button" className="pv-icon" onClick={() => onPreview(shown.path)} title="Open in Preview" aria-label="Open in Preview"><Glyph d={OUTSIDE} /></button>
          <span className="pv-rule" aria-hidden="true" />
          <button type="button" className="pv-icon pv-close" onClick={onClose} title="Close (esc)" aria-label="Close"><CrossIcon /></button>
        </span>
      </header>

      {many && (
        <>
          <button type="button" className="pv-step pv-prev pv-chrome" disabled={index === 0} onClick={() => go(-1)} aria-label="Previous picture"><Glyph d={CHEVRON_LEFT} /></button>
          <button type="button" className="pv-step pv-next pv-chrome" disabled={index === pictures.length - 1} onClick={() => go(1)} aria-label="Next picture"><Glyph d={CHEVRON_RIGHT} /></button>
        </>
      )}

      {many && (
        <div className="pv-strip pv-chrome">
          {pictures.map((p, i) => (
            <button key={p.path} type="button" className={`pv-thumb${i === index ? ' is-on' : ''}`} onClick={() => setIndex(i)} title={p.path.split('/').pop()}>
              {p.url && <img src={p.url} alt="" crossOrigin="anonymous" />}
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
