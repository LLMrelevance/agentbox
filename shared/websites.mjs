// PURE. What counts as a website, and where its sign-ins live. Shared because
// the main process pins what an embedded page may do and the screen decides
// what to draw, and the two must agree.
//
// A local address is NOT a website here. A dev server is drawn in an ordinary
// frame with a liveness check in front of it (renderer/src/local-preview.ts)
// and its framing headers rewritten below the page (main/local-app-frames.mjs);
// none of that applies to a site on the web.

/**
 * The store a website's cookies and sign-ins go into. Not `persist:junk`:
 * that one is safe for an agent to drive precisely because it carries
 * nothing, and a person may sign into a page here.
 */
export const WEBSITE_PARTITION = 'persist:websites';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Is this an ordinary page on the web, the kind the pane opens in a browser? */
export function isWebsiteAddress(src) {
  if (typeof src !== 'string' || !src) return false;
  try {
    const url = new URL(src);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return !LOOPBACK.has(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Can this page embed a website in a browser of its own? Only the desktop
 * window can: `<webview>` is Electron's, and nothing registers the tag in an
 * ordinary tab or on a phone. Asking the tag beats guessing which door this is.
 */
export function canFrameAWebsite(doc) {
  try {
    return !!doc && 'partition' in doc.createElement('webview');
  } catch {
    return false;
  }
}
