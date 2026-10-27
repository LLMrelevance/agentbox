// THE LIST KEEPS OUT FROM UNDER THE APPROVAL CARD.
//
// The card is fixed to the bottom-right corner, above everything, because a
// worker is frozen until it is answered, and the inbox scrolled underneath it:
// the last rows of Needs you sat behind the card with nothing below them left
// to scroll.
//
// A number in the stylesheet would be a guess. The card is 149px with a bare
// command and half as tall again once it carries a description, a folder and a
// host, so this measures the card and writes what it found; styles.css reads
// `--approval-room` and leaves the list that much room at its foot.

const ROOM = '--approval-room';

/**
 * Keep the foot of the list clear of `el` for as long as it is on screen.
 * Returns the undo, which the caller runs when the card goes.
 */
export function roomForTheCard(el: HTMLElement): () => void {
  const root = document.documentElement;
  const write = () => root.style.setProperty(ROOM, `${Math.round(el.getBoundingClientRect().height)}px`);
  write();
  // A card grows when a worker sends a long description, and the stack behind
  // it grows with the queue.
  const watch = typeof ResizeObserver === 'function' ? new ResizeObserver(write) : null;
  watch?.observe(el);
  return () => {
    watch?.disconnect();
    root.style.removeProperty(ROOM);
  };
}
