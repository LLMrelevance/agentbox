// "SHOW", the one action with four layouts (approved 2026-10-15, round eight):
// in place, lifted out, side by side, full screen. Neo shows pictures from the
// open thread without changing the thread: a layer over the app that Escape,
// a click outside the pictures, or Neo's "close" puts away.
import { glowOn } from './glow';

export type Layout = 'in_place' | 'lifted' | 'side_by_side' | 'full_screen' | 'close';

let layer: HTMLElement | null = null;
let offKey: (() => void) | null = null;

/** The pictures the open thread draws, in order (components/Focus.tsx ArtifactImg). */
export function threadPictures(root: ParentNode = document): HTMLImageElement[] {
  return [...root.querySelectorAll<HTMLImageElement>('img.inline-image')].filter((img) => img.isConnected && !img.closest('.neo-show'));
}

export function pictureName(img: HTMLImageElement, n: number): string {
  const path = img.closest('[title]')?.getAttribute('title') || img.getAttribute('alt') || '';
  return path.split('/').filter(Boolean).at(-1) || `picture ${n}`;
}

export function putAway() {
  offKey?.();
  offKey = null;
  layer?.remove();
  layer = null;
}

export async function show(numbers: number[], layout: Layout): Promise<boolean> {
  putAway();
  if (layout === 'close') return true;
  const all = threadPictures();
  const chosen = numbers.map((n) => ({ n, img: all[n - 1] })).filter((p) => p.img);
  if (!chosen.length) return false;

  if (layout === 'in_place') {
    const { img } = chosen[0];
    img.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(() => glowOn(img.closest('.inline-image-open') ?? img), 350);
    return true;
  }

  const many = layout === 'lifted' ? chosen.slice(0, 1) : chosen;
  layer = document.createElement('div');
  layer.className = `neo-show neo-show-${layout.replace(/_/g, '-')}`;
  const row = document.createElement('div');
  row.className = 'neo-show-row';
  for (const { n, img } of many) {
    const cell = document.createElement('figure');
    cell.className = 'neo-show-cell';
    const pic = document.createElement('img');
    pic.src = img.currentSrc || img.src;
    pic.alt = img.alt;
    const label = document.createElement('figcaption');
    label.textContent = many.length > 1 ? `${n} · ${pictureName(img, n)}` : pictureName(img, n);
    cell.append(pic, label);
    row.append(cell);
  }
  layer.append(row);
  layer.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest('img')) putAway(); });
  document.body.append(layer);
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); putAway(); } };
  window.addEventListener('keydown', key, true);
  offKey = () => window.removeEventListener('keydown', key, true);
  requestAnimationFrame(() => layer?.classList.add('in'));
  return true;
}
