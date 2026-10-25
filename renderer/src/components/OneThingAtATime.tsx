// The one-at-a-time page's own pieces (w-65bcefb857). The page is the thread page
// in a mode; these are the parts it adds: the summary on top, the answer under
// its headline, and the place in the queue with the arrows beside the menu.
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../api';
import { onPhone } from '../phone-screen';
import { clock, dayHeading } from '../thread-history';
import { splitHeadline, type Spot } from '../one-thing-at-a-time';
import '../one-thing-at-a-time.css';

/** What this page reads in place rather than as a tile: a page an agent made, or a note. */
export const readsInPlace = (path: string) => /\.(html?|md|markdown)$/i.test(path);

const when = (at: number) => `${dayHeading(at)} ${clock(at)}`;

export function QueueSummary({ context, you, earlier, steps = false, open, onToggle }: {
  context: string | null | undefined;
  you: { at: number; text: string } | null;
  /** Messages behind the fold. */
  earlier: number;
  /** Whether the fold holds the agent's steps even with no earlier message. */
  steps?: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const both = !!context && !!you;
  const toggle = earlier > 0
    ? (open ? 'Hide earlier messages' : `Show ${earlier} earlier ${earlier === 1 ? 'message' : 'messages'}`)
    : steps ? (open ? 'Hide what the agent did' : 'Show what the agent did') : null;
  return (
    <div className="one-sum">
      {(context || you) && (
        <div className={both ? 'one-cols' : 'one-cols one-single'}>
          {context && <div className="one-col"><span className="one-lab">Context</span>{context}</div>}
          {you && <div className="one-col one-you"><span className="one-lab">You, {when(you.at)}</span>{you.text}</div>}
        </div>
      )}
      {toggle && <button type="button" className="one-earlier" onClick={onToggle}>{toggle}</button>}
    </div>
  );
}

export function QueueAnswer({ text, md }: { text: string; md: (text: string) => ReactNode }) {
  const { headline, rest } = splitHeadline(text);
  return (
    <div className="outcome one-answer">
      {headline && <h1 className="one-q">{headline}</h1>}
      {rest.trim() && md(rest)}
    </div>
  );
}

/**
 * A page or a note the answer names, read in place under it at the page's full
 * width. The page is framed the way the side pane frames one (DocPane.tsx),
 * sandbox and all. A page with no address to frame (the browser copy gives
 * none) keeps its name and the way to open it; a note that cannot be read
 * draws nothing, and the answer still names it.
 */
export function QueueFile({ product, path, md, onOpen }: { product: string; path: string; md: (text: string) => ReactNode; onOpen: () => void }) {
  const page = /\.html?$/i.test(path);
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [text, setText] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setUrl(undefined); setText(undefined);
    if (page) {
      api.resolveDoc({ product, src: path })
        .then((r) => { if (live) setUrl(r.ok && r.url ? r.url : null); })
        .catch(() => { if (live) setUrl(null); });
    } else {
      api.readDoc({ product, src: path })
        .then((r) => { if (live) setText(r.ok ? r.text ?? '' : null); })
        .catch(() => { if (live) setText(null); });
    }
    return () => { live = false; };
  }, [product, path, page]);
  if (text === null) return null;
  return (
    <section className={page ? 'one-file one-page' : 'one-file one-note'}>
      <div className="one-filehead">
        <span className="one-filename">{path.split('/').pop()}</span>
        <button type="button" className="one-fileopen" onClick={onOpen}>Open full screen</button>
      </div>
      {page && url && <iframe className="one-frame" src={url} title={path} sandbox={onPhone() ? 'allow-scripts' : 'allow-scripts allow-same-origin'} />}
      {!page && text != null && <div className="markdown one-notebody">{md(text)}</div>}
    </section>
  );
}

const chevron = (up: boolean) => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={up ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'} />
  </svg>
);

export function QueueNav({ spot, onStep }: { spot: Spot; onStep: (dir: 1 | -1) => void }) {
  return (
    <span className="one-nav">
      <span className="one-pos">{spot.pos} of {spot.total}</span>
      <button type="button" className="ts-more one-step" aria-label="Previous thread (K)" title="Previous thread (K)" disabled={spot.index <= 0} onClick={() => onStep(-1)}>{chevron(true)}</button>
      <button type="button" className="ts-more one-step" aria-label="Next thread (J)" title="Next thread (J)" disabled={spot.pos >= spot.total} onClick={() => onStep(1)}>{chevron(false)}</button>
    </span>
  );
}
