// A picture in a thread, opened large over it. The side pane is still one
// press away ("Open beside"), and so is Preview.
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { clickZoom, fitScale, moveFrame, panToKeep, stepTo, zoomBy, type Frame } from '../picture-view';

export type PictureLook = 'centered' | 'window' | 'full';
export type Picture = { path: string; url: string | null };

const LOOK_KEY = 'zero.pictureLook';
export function pictureLook(): PictureLook {
  const v = typeof localStorage !== 'undefined' ? localStorage.getItem(LOOK_KEY) : null;
  return v === 'window' || v === 'full' ? v : 'centered';
}

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

export function PictureView({ look, pictures, start, resolve, onClose, onBeside, onPreview }: {
  look: PictureLook;
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
  const stage = useRef<HTMLDivElement | null>(null);
  const dialog = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number; moved: boolean } | null>(null);
  // The floating window's own place and size, which the person can change.
  const [frame, setFrame] = useState<Frame | null>(null);

  useEffect(() => {
    setZoom(1); setPan({ x: 0, y: 0 }); setNatural({ w: 0, h: 0 });
    if (!shown) return;
    if (shown.url) { setUrl(shown.url); return; }
    let live = true;
    setUrl(null);
    resolve(shown.path).then((u) => { if (live) setUrl(u); }).catch(() => {});
    return () => { live = false; };
  }, [index]);

  useLayoutEffect(() => {
    if (look !== 'window' || frame) return;
    const w = Math.round(window.innerWidth * 0.78), h = Math.round(window.innerHeight * 0.84);
    setFrame({ x: Math.round((window.innerWidth - w) / 2), y: Math.round((window.innerHeight - h) / 2), w, h });
  }, [look]);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [frame === null]);

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

  // Moving and resizing the floating window.
  const frameDrag = (e: ReactPointerEvent, mode: 'move' | 'size') => {
    if (!frame || e.button !== 0) return;
    e.preventDefault();
    const from = frame, px = e.clientX, py = e.clientY;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const onMove = (m: PointerEvent) => {
      setFrame(moveFrame(from, mode, m.clientX - px, m.clientY - py));
    };
    const onUp = () => { target.removeEventListener('pointermove', onMove); target.removeEventListener('pointerup', onUp); };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
  };

  if (!shown) return null;
  const name = shown.path.split('/').pop() ?? shown.path;
  const many = pictures.length > 1;
  const picture = (
    <div
      ref={stage}
      className="pv-stage"
      onWheel={wheel}
      onClick={(e) => { if (e.target === e.currentTarget && look !== 'window') onClose(); }}
    >
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
      {look === 'full' && many && (
        <>
          <button type="button" className="pv-step pv-prev" disabled={index === 0} onClick={() => setIndex(stepTo(index, pictures.length, -1))} aria-label="Previous picture">‹</button>
          <button type="button" className="pv-step pv-next" disabled={index === pictures.length - 1} onClick={() => setIndex(stepTo(index, pictures.length, 1))} aria-label="Next picture">›</button>
        </>
      )}
    </div>
  );
  const actions = (
    <span className="pv-actions">
      <button type="button" onClick={() => onBeside(shown.path)}>Open beside</button>
      <button type="button" onClick={() => onPreview(shown.path)}>Open in Preview</button>
    </span>
  );
  const count = many ? <span className="pv-count">{index + 1} of {pictures.length}</span> : null;
  const close = <button type="button" className="pv-close" onClick={onClose} aria-label="Close">×</button>;

  let body;
  if (look === 'window' && frame) {
    body = (
      <div className="pv-win" style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }}>
        <div className="pv-bar" onPointerDown={(e) => { if ((e.target as HTMLElement).closest('button')) return; frameDrag(e, 'move'); }}>
          <span className="pv-name">{name}</span>
          {count}
          {actions}
          {close}
        </div>
        {picture}
        <span className="pv-grip" onPointerDown={(e) => frameDrag(e, 'size')} aria-hidden="true" />
      </div>
    );
  } else if (look === 'full') {
    body = (
      <>
        <div className="pv-top">
          <span className="pv-name">{name}</span>
          {count}
          <span className="pv-spacer" />
          {actions}
          {close}
        </div>
        {picture}
        {many && (
          <div className="pv-strip">
            {pictures.map((p, i) => (
              <button key={p.path} type="button" className={`pv-thumb${i === index ? ' is-on' : ''}`} onClick={() => setIndex(i)} title={p.path}>
                {p.url && <img src={p.url} alt="" crossOrigin="anonymous" />}
              </button>
            ))}
          </div>
        )}
      </>
    );
  } else {
    body = (
      <>
        {picture}
        <div className="pv-caption">
          <span className="pv-name">{name}</span>
          {count}
          {actions}
          <span className="pv-hint">esc</span>
        </div>
      </>
    );
  }
  return createPortal(
    <div
      ref={dialog}
      tabIndex={-1}
      role="dialog"
      aria-label={name}
      className={`picture-view pv-${look}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >{body}</div>,
    document.body,
  );
}
