// A PAGE OFF THE WEB, DRAWN BESIDE THE THREAD.
//
// Every other thing the pane draws is a file of ours. This one is somebody
// else's running code, so it gets a browser of its own rather than a corner of
// the app's page:
//
//   on the desktop   Electron's `<webview>`, a separate process on its own
//                    session partition (shared/websites.mjs). Sites refuse to
//                    be drawn in a frame all the time — X-Frame-Options and
//                    frame-ancestors are the norm on anything with a sign-in —
//                    and a webview is not a frame, so they draw. What it may
//                    do is pinned in the main process, below the tag, by
//                    main/webview-guard.mjs: no preload, sandboxed, isolated.
//
//   in a tab         an ordinary iframe, because nothing registers the tag
//                    outside Electron. It is opaque to the app (no
//                    allow-same-origin) and many sites will refuse it. The
//                    mark in the header is the way out, and it is always there.
//
// NO AGENT EVER DRIVES THIS. It is a pane a person reads. The browser an agent
// may be pointed at is the other one, the `persist:junk` partition that
// carries nothing, and these two stores never meet.
import { useEffect, useRef } from 'react';
import { WEBSITE_PARTITION } from '../../../shared/websites.mjs';

// `<webview>` is Electron's own element, so React has no type for it and the
// DOM has no interface for it. Both are declared here, narrowly: the three
// attributes we set and the two events we listen to.
declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        partition?: string;
        useragent?: string;
      };
    }
  }
}

type Guest = HTMLElement & { getURL?: () => string };

/**
 * `webview` is whether this page can draw one; the caller asks
 * `canFrameAWebsite(document)` so a test can hold both branches.
 * `onNavigate` is how the header follows the page: a webview navigates inside
 * itself, so after one click the thread's address is no longer where you are.
 */
export function WebsitePane({ url, webview, ready = true, onNavigate, onReady, onFailed }: {
  url: string;
  webview: boolean;
  // Held invisible until the page says it is drawn, so a site that takes a
  // second shows the pane's own quiet cover rather than a white rectangle.
  ready?: boolean;
  onNavigate: (here: string) => void;
  onReady?: () => void;
  onFailed?: (why: string) => void;
}) {
  const guest = useRef<Guest | null>(null);

  useEffect(() => {
    const node = guest.current;
    if (!node || !webview) return;
    const walked = () => onNavigate(node.getURL?.() ?? url);
    const ready = () => { onReady?.(); walked(); };
    // A page that cannot be reached at all. -3 is Chromium's "the load was
    // aborted", which every ordinary in-page navigation also reports, so it is
    // not a failure and must not replace the page with a sentence.
    const failed = (e: Event) => {
      const { errorCode, errorDescription, isMainFrame } = e as Event & { errorCode?: number; errorDescription?: string; isMainFrame?: boolean };
      if (isMainFrame === false || errorCode === -3) return;
      onFailed?.(errorDescription || 'That page could not be loaded.');
    };
    node.addEventListener('dom-ready', ready);
    node.addEventListener('did-navigate', walked);
    node.addEventListener('did-navigate-in-page', walked);
    node.addEventListener('did-fail-load', failed);
    return () => {
      node.removeEventListener('dom-ready', ready);
      node.removeEventListener('did-navigate', walked);
      node.removeEventListener('did-navigate-in-page', walked);
      node.removeEventListener('did-fail-load', failed);
    };
    // `url` is deliberately not a dependency: the webview keeps its own
    // history, and re-running this on every step would tear the listeners off
    // and back on mid-navigation.
  }, [webview, onNavigate, onReady, onFailed]);

  if (webview) {
    return <webview
      ref={guest as React.Ref<HTMLElement>}
      className="doc-view doc-website-view"
      style={{ opacity: ready ? 1 : 0 }}
      src={url}
      partition={WEBSITE_PARTITION}
    />;
  }

  // THE FALLBACK IN A TAB. Opaque to the app on purpose: `allow-same-origin`
  // alongside `allow-scripts` would let a page escape its own sandbox, and the
  // app is served from this very origin on the phone door (main/serve.mjs).
  return <iframe
    className="doc-view doc-website-view"
    style={{ opacity: ready ? 1 : 0 }}
    src={url}
    title={url}
    sandbox="allow-scripts allow-forms"
    referrerPolicy="no-referrer"
    onLoad={() => onReady?.()}
  />;
}
