// THE BAR OVER A PAGE THE PANE IS BROWSING, AND IT IS ONE BAR FOR BOTH KINDS.
//
// A website off the web and a local app a worker started are the same thing to
// read: somebody else's page, inside our window. They had two different
// headers, both of them the document pane's — a breadcrumb built for a file on
// disk, and the file marks beside it. Their words on the first round: it takes
// a lot of space at the top, it loses valuable space, it looks a bit peeling,
// and it is not clear that it is a browser tab.
//
// So this is a browser's bar rather than a document's header, shared by both
// panes. Three layouts of it were built in the real app and photographed for
// the pick — this toolbar, a tab carrying the page's name, and a 26px line
// with no stepping controls — and the toolbar is the one that was chosen
// (2026-10-15). The other two are gone rather than kept behind a flag.
//
// NO FAVICON IS FETCHED, AND THAT IS DELIBERATE. A webview has the site's icon
// URL ready on `page-favicon-updated`, but drawing it here would make the
// APP's own page request a file from that domain, on the app's own session
// rather than the browsing one. That is this window reaching a third party on
// a partition that carries the person's other sign-ins, and the privacy page
// says nothing leaves the machine. The mark is drawn by us instead.
import type { ReactNode } from 'react';

// The app's own icon recipe (SearchIcon.tsx): a 24 grid, a hairline, round
// caps, no fill.
function Glyph({ children, size = 15 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >{children}</svg>
  );
}

const Back = () => <Glyph><path d="M14.5 5.5 8 12l6.5 6.5" /></Glyph>;
const Forward = () => <Glyph><path d="M9.5 5.5 16 12l-6.5 6.5" /></Glyph>;
const Reload = () => (
  <Glyph>
    <path d="M19 12a7 7 0 1 1-2.05-4.95" />
    <path d="M19.4 4.6v3.9h-3.9" />
  </Glyph>
);
/** A website: the globe every browser puts in front of an address. */
const Globe = () => (
  <Glyph size={13}>
    <circle cx="12" cy="12" r="8.2" />
    <path d="M3.8 12h16.4" />
    <path d="M12 3.8c2.1 2.2 3.2 5.1 3.2 8.2s-1.1 6-3.2 8.2c-2.1-2.2-3.2-5.1-3.2-8.2S9.9 6 12 3.8Z" />
  </Glyph>
);
/** A local app: the window on this machine, not out on the web. */
const Local = () => (
  <Glyph size={13}>
    <rect x="3.6" y="5" width="16.8" height="13" rx="2" />
    <path d="M3.6 9h16.8" />
  </Glyph>
);

export type WebChromeKind = 'website' | 'local';

/** Where the pane is, split so the host can be read and the rest can fade. */
export function addressParts(url: string): { host: string; rest: string } {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./i, '') + (u.port ? `:${u.port}` : '');
    const rest = `${u.pathname === '/' ? '' : u.pathname}${u.search}`;
    return { host, rest };
  } catch {
    return { host: String(url ?? ''), rest: '' };
  }
}

export function BrowserChrome({
  kind, url, canBack, canForward, loading,
  onBack, onForward, onReload, onOpenOutside, marks,
}: {
  kind: WebChromeKind;
  url: string;
  canBack?: boolean;
  canForward?: boolean;
  loading?: boolean;
  onBack?: () => void;
  onForward?: () => void;
  onReload?: () => void;
  onOpenOutside: () => void;
  // Focus and close, which the pane owns and every kind of document shares.
  marks?: ReactNode;
}) {
  const { host, rest } = addressParts(url);
  const mark = kind === 'local' ? <Local /> : <Globe />;
  return (
    <div className="web-bar" data-kind={kind} data-loading={loading ? 'yes' : 'no'}>
      <div className="web-bar-nav">
        <button type="button" className="web-bar-step" title="Back" aria-label="Back" disabled={!canBack} onClick={onBack}><Back /></button>
        <button type="button" className="web-bar-step" title="Forward" aria-label="Forward" disabled={!canForward} onClick={onForward}><Forward /></button>
        <button type="button" className="web-bar-step" title="Reload" aria-label="Reload" onClick={onReload}><Reload /></button>
      </div>
      <div className="web-bar-address" title={url}>
        <span className="web-bar-mark">{mark}</span>
        <span className="web-bar-host">{host}</span>
        <span className="web-bar-rest">{rest}</span>
      </div>
      <div className="web-bar-marks">
        <button type="button" className="web-bar-step web-bar-out" title="Open in your browser" aria-label="Open in your browser" onClick={onOpenOutside}>
          <Glyph>
            <path d="M14 4.8h5.2V10" />
            <path d="M19.2 4.8 11.6 12.4" />
            <path d="M18.4 14.2v3.6a1.6 1.6 0 0 1-1.6 1.6H6.2a1.6 1.6 0 0 1-1.6-1.6V7.2a1.6 1.6 0 0 1 1.6-1.6h3.6" />
          </Glyph>
        </button>
        {marks}
      </div>
    </div>
  );
}
