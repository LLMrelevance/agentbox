// PURE. WHAT COUNTS AS A WEBSITE, AND WHERE ITS SIGN-INS LIVE.
//
// The pane on the right of a thread draws a page off the open web, so three
// facts have to be agreed on by the main process (which pins what an embedded
// page may do) and by the screen (which decides what to draw). They are here
// rather than in either, so there is one copy of each.
//
// A LOCAL ADDRESS IS NOT A WEBSITE HERE. http://localhost:3006 is a dev server
// a worker started, and the pane has drawn one since 2026-10-09 in an ordinary
// frame, with a liveness check in front of it (renderer/src/local-preview.ts)
// and its framing headers rewritten below the page
// (main/local-app-frames.mjs). None of that applies to a site on the web, and
// none of this applies to a dev server, so the two rules stay apart.

/**
 * The store a website's cookies and sign-ins go into.
 *
 * IT IS NOT `persist:junk`, AND THAT IS THE POINT. The junk partition is the
 * store behind the browser pane an agent is allowed to drive, which is safe
 * precisely because it carries nothing. This one is the opposite: a person
 * reads pages here and may well sign into one, so it is a store of theirs and
 * it must never be a store an agent can be pointed at.
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

// How much of a path the header prints. The site itself and the last two steps
// of the way through it: the end of the path is the page you are standing on,
// and the middle of a long one is noise in a 12.5px line that already
// ellipsises.
const CRUMB_STEPS = 3;

/**
 * What the pane's header says you are looking at: the site, then the way
 * through it. No scheme, no query and no fragment, because none of those is a
 * place. An address that will not parse is printed back as it was, which is
 * more use than printing nothing.
 */
export function websiteCrumb(src) {
  const raw = String(src ?? '');
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./i, '');
    const steps = url.pathname.split('/').filter(Boolean).map((part) => {
      try { return decodeURIComponent(part); } catch { return part; }
    });
    return [host, ...steps.slice(-CRUMB_STEPS)];
  } catch {
    return [raw];
  }
}

/**
 * Can this page embed a website in a browser of its own?
 *
 * Only the desktop window can: `<webview>` is Electron's, switched on by
 * `webviewTag` in main/main.mjs, and nothing registers the tag in an ordinary
 * tab or on a phone. The probe is the tag's own property rather than a guess
 * about which door this is, because the answer is exactly "is the tag here".
 */
export function canFrameAWebsite(doc) {
  try {
    return !!doc && 'partition' in doc.createElement('webview');
  } catch {
    return false;
  }
}
