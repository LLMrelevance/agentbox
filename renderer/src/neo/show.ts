// "SHOW", the one action with four layouts (approved 2026-10-15, round eight):
// in place, lifted out, side by side, full screen. Neo shows pictures from the
// open thread without changing the thread: a layer over the app that Escape,
// a click outside the pictures, or Neo's "close" puts away.
import { glowOn } from './glow';

// `peek` is the one Neo picks by itself: beside the thread, never over it.
export type Layout = 'in_place' | 'peek' | 'lifted' | 'side_by_side' | 'full_screen' | 'close';

let layer: HTMLElement | null = null;
let offKey: (() => void) | null = null;

// The same file drawn twice, or asked for again (?look=2), is one picture.
const sameFile = (src: string) => src.replace(/[?#].*$/, '');

/**
 * Which pictures Neo counts, and in what order: each file once, the latest
 * message's first in their own order, then older ones newest first. `block`
 * is the message a picture is drawn in, in thread order; `mine` marks one she
 * pasted herself, which is never the latest agent message's. `latestBlock` is
 * the agent's latest message: when it has no pictures, none are latest, so an
 * older message's never stand in for it.
 */
export function orderPictures(found: { src: string; block: unknown; mine?: boolean }[], latestBlock?: unknown): { order: number[]; srcs: string[]; latest: number } {
  if (!found.length) return { order: [], srcs: [], latest: 0 };
  const last = latestBlock ?? [...found].reverse().find((p) => !p.mine)?.block;
  const seen = new Set<string>();
  const latest: number[] = [];
  found.forEach((p, i) => {
    const key = sameFile(p.src);
    if (!p.mine && last !== undefined && p.block === last && !seen.has(key)) { seen.add(key); latest.push(i); }
  });
  const earlier: number[] = [];
  for (let i = found.length - 1; i >= 0; i--) {
    const key = sameFile(found[i].src);
    if (!seen.has(key)) { seen.add(key); earlier.push(i); }
  }
  return { order: [...latest, ...earlier], srcs: found.map((p) => p.src), latest: latest.length };
}

export const drew = (img: { complete: boolean; naturalWidth: number }) => img.complete && img.naturalWidth > 0;

/** The pictures the open thread draws (components/Focus.tsx ArtifactImg), as Neo numbers them. */
export function threadPictures(root: ParentNode = document): { pictures: HTMLImageElement[]; latest: number } {
  // Only pictures that drew: a file that is missing shows as its path, and once
  // went up beside the thread as "the picture".
  const all = [...root.querySelectorAll<HTMLImageElement>('.focus-scroll img.inline-image, .thread-block img.inline-image')]
    .filter((img, i, list) => img.isConnected && !img.closest('.neo-show') && list.indexOf(img) === i && drew(img));
  const got = orderPictures(all.map((img) => ({ src: img.getAttribute('src') ?? '', block: img.closest('.thread-block') ?? img.parentElement, mine: !!img.closest('.msg.yours') })), latestAgentBlock(root));
  return { pictures: got.order.map((i) => all[i]), latest: got.latest };
}

/** The films and sounds the open thread draws (components/Focus.tsx ArtifactMedia), ordered as pictures are. */
export function threadFilms(root: ParentNode = document): { films: HTMLElement[]; latest: number } {
  const all = [...root.querySelectorAll<HTMLElement>('.inline-media')].filter((el) => el.isConnected && !el.closest('.neo-show'));
  const key = (el: HTMLElement) => el.querySelector('video, audio')?.getAttribute('src') || el.querySelector('.mention-name')?.textContent?.trim() || '';
  const got = orderPictures(all.map((el) => ({ src: key(el), block: el.closest('.thread-block') ?? el.parentElement, mine: !!el.closest('.msg.yours') })), latestAgentBlock(root));
  return { films: got.order.map((i) => all[i]), latest: got.latest };
}

export function filmName(el: Element): string {
  return el.querySelector('.mention-name')?.textContent?.trim() || 'a film';
}

/** Whether the open thread has drawn an agent message yet, pictures or not. */
export function threadDrawn(root: ParentNode = document): boolean {
  return !!latestAgentBlock(root);
}

function latestAgentBlock(root: ParentNode): Element | undefined {
  const blocks = [...root.querySelectorAll('.focus-scroll .thread-block')].filter((b) => b.querySelector('.msg:not(.yours)'));
  return blocks.at(-1);
}

/** The latest message's files (components/MessageFiles.tsx), the tiles that open one beside the thread. */
export function latestFiles(root: ParentNode = document): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('.focus-scroll .message-file')].filter((b) => b.isConnected && !b.closest('.neo-show'));
}

export function fileName(tile: HTMLElement, n: number): string {
  return tile.querySelector('.message-file-name')?.textContent?.trim() || `file ${n}`;
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
  const all = threadPictures().pictures;
  const chosen = numbers.map((n) => ({ n, img: all[n - 1] })).filter((p) => p.img);
  if (!chosen.length) return false;

  if (layout === 'in_place') {
    const { img } = chosen[0];
    img.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(() => glowOn(img.closest('.inline-image-open') ?? img), 350);
    return true;
  }

  const many = layout === 'lifted' ? chosen.slice(0, 1) : chosen;
  const peek = layout === 'peek';
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
