// PURE. The picture that opens large over the thread (PictureView.tsx): which
// clicks open it, how big it is drawn, and how it zooms and steps.
import { docKind } from './doc-pane';

/** Zoom is counted from the fitted size, so 1 is "all of it on screen". */
export const MAX_ZOOM = 8;

export function opensAsPicture(path: string | undefined | null): boolean {
  return docKind(path) === 'image';
}

/** The scale that shows the whole picture in the box. Never above 1, which would blur it. */
export function fitScale(natural: { w: number; h: number }, box: { w: number; h: number }): number {
  if (!(natural.w > 0 && natural.h > 0)) return 1;
  return Math.min(1, box.w / natural.w, box.h / natural.h);
}

/**
 * Where a click takes the zoom. From fitted it goes to the picture's real
 * pixels, which is what a screenshot is opened for; a picture already shown at
 * its real size has nothing to gain from that, so it doubles.
 */
export function clickZoom(zoom: number, fit: number): number {
  if (zoom > 1.01) return 1;
  const real = fit > 0 ? 1 / fit : 2;
  return real > 1.25 ? Math.min(MAX_ZOOM, real) : 2;
}

/**
 * The pan that keeps the point under the pointer still while the zoom changes.
 * `at` is the pointer's offset from the middle of the stage, where the picture's
 * transform is anchored.
 */
export function panToKeep(at: { x: number; y: number }, pan: { x: number; y: number }, zoom: number, next: number) {
  const k = next / zoom;
  return { x: at.x - (at.x - pan.x) * k, y: at.y - (at.y - pan.y) * k };
}

export function zoomBy(zoom: number, factor: number): number {
  return Math.min(MAX_ZOOM, Math.max(1, zoom * factor));
}

export type Frame = { x: number; y: number; w: number; h: number };
export const MIN_FRAME = { w: 320, h: 220 };

/** The floating window after a drag of its bar ('move') or its corner ('size'). Returns only the frame, never the pointer. */
export function moveFrame(from: Frame, mode: 'move' | 'size', dx: number, dy: number): Frame {
  const { x, y, w, h } = from;
  return mode === 'move'
    ? { x: x + dx, y: Math.max(0, y + dy), w, h }
    : { x, y, w: Math.max(MIN_FRAME.w, w + dx), h: Math.max(MIN_FRAME.h, h + dy) };
}

export function stepTo(index: number, count: number, by: number): number {
  return Math.max(0, Math.min(count - 1, index + by));
}
