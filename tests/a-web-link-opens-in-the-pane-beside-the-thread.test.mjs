// A WEB LINK OPENS IN THE PANE BESIDE THE THREAD.
//
// What was missing: the pane on the right drew a file of ours and nothing
// else. An ordinary https link in a worker's message went straight out to the
// browser (`zero:open-artifact` calls shell.openExternal for anything http),
// so reading what an agent linked meant leaving the app, and coming back meant
// finding the thread again. Counted over the designs this came from
// (designs/w-3f27e92b80/9-website-preview.png, approved 2026-10-15): the pane
// draws the page where the file would have been, and one mark hands it to the
// browser you actually use.
//
// The cases here are the rule that decides which address that is, the kind the
// pane then draws, the crumb the header prints for it, and the one case that
// must NOT match: a local address, which already has its own path through the
// pane (an iframe plus the liveness check in renderer/src/local-preview.ts) and
// must not be stolen by this.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { isWebsiteAddress, websiteCrumb, canFrameAWebsite, WEBSITE_PARTITION } from '../shared/websites.mjs';
import { docKind, opensInPane } from '../renderer/src/doc-pane.ts';
import { WebsitePane } from '../renderer/src/components/WebsitePane.tsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

describe('which address the pane treats as a website', () => {
  it('is an ordinary http or https address out on the web', () => {
    for (const url of [
      'https://en.wikipedia.org/wiki/Kestrel',
      'http://example.com',
      'https://github.com/savannahfeder/agentbox/pull/31',
      'https://example.com:8443/a?b=1#c',
    ]) expect(isWebsiteAddress(url), url).toBe(true);
  });

  it('is never a local app, which the pane already draws its own way', () => {
    for (const url of [
      'http://localhost:3006/',
      'http://127.0.0.1:48765/x?y=1',
      'http://[::1]:3000/',
      'https://localhost:8443/',
    ]) expect(isWebsiteAddress(url), url).toBe(false);
  });

  it('is never a file, a scheme of ours, or a path a worker typed', () => {
    for (const src of [
      'file:///tmp/x.html',
      'astral-doc://abc/designs/round19.html',
      'agentbox-agent:reviewer',
      'mailto:someone@example.com',
      'designs/w-3f27e92b80/9-website-preview.png',
      'STATE.md',
      'javascript:alert(1)',
      'not a url',
      '',
      null,
      undefined,
    ]) expect(isWebsiteAddress(src), String(src)).toBe(false);
  });
});

describe('what the pane does with one', () => {
  it('calls it a website, so the pane opens it instead of the browser', () => {
    expect(docKind('https://en.wikipedia.org/wiki/Kestrel')).toBe('website');
    expect(opensInPane('https://en.wikipedia.org/wiki/Kestrel')).toBe(true);
  });

  it('reads the address before the extension, so a page on the web is not looked for on disk', () => {
    // Both of these end in an extension the pane knows. They are still
    // websites: resolving them against the product's folders finds nothing.
    expect(docKind('https://example.com/report.html')).toBe('website');
    expect(docKind('https://example.com/shot.png')).toBe('website');
    expect(docKind('https://example.com/readme.md')).toBe('website');
  });

  it('leaves every file the pane already drew exactly as it was', () => {
    expect(docKind('designs/round19.html')).toBe('html');
    expect(docKind('STATE.md')).toBe('markdown');
    expect(docKind('attachments/shot.png')).toBe('image');
    expect(docKind('runs/w-1.change')).toBe('code');
    expect(docKind('reports/audit.pdf')).toBeNull();
    // A local app keeps no kind of its own: DocPane falls back to a frame.
    expect(docKind('http://localhost:3006/')).toBeNull();
  });
});

describe('what the header says you are looking at', () => {
  it('is the site and the way through it, not the scheme', () => {
    expect(websiteCrumb('https://en.wikipedia.org/wiki/Kestrel')).toEqual(['en.wikipedia.org', 'wiki', 'Kestrel']);
    expect(websiteCrumb('https://example.com')).toEqual(['example.com']);
    expect(websiteCrumb('https://example.com/')).toEqual(['example.com']);
  });

  it('drops www, and drops a query and a fragment, which are not places', () => {
    expect(websiteCrumb('https://www.example.com/a/b?c=1#d')).toEqual(['example.com', 'a', 'b']);
  });

  it('keeps the tail of a long path, because the end is the page you are on', () => {
    const crumb = websiteCrumb('https://example.com/one/two/three/four/five');
    expect(crumb[0]).toBe('example.com');
    expect(crumb[crumb.length - 1]).toBe('five');
    expect(crumb.length).toBeLessThanOrEqual(4);
  });

  it('says the address back verbatim when it cannot be read as one', () => {
    expect(websiteCrumb('not a url')).toEqual(['not a url']);
  });
});

describe('the browser the pane draws it in', () => {
  const fakeDoc = (made) => ({ createElement: () => made });

  it('is Electron\'s own on the desktop, where the tag is registered', () => {
    expect(canFrameAWebsite(fakeDoc({ partition: '' }))).toBe(true);
  });

  it('is an ordinary frame in a tab or on a phone, where it is not', () => {
    expect(canFrameAWebsite(fakeDoc({}))).toBe(false);
    expect(canFrameAWebsite(null)).toBe(false);
    expect(canFrameAWebsite({ createElement() { throw new Error('no'); } })).toBe(false);
  });

  it('keeps its sign-ins in a store of its own, never the agent browser\'s', () => {
    const markup = renderToStaticMarkup(h(WebsitePane, { url: 'https://example.com/', webview: true, onNavigate: () => {} }));
    expect(markup).toContain(`partition="${WEBSITE_PARTITION}"`);
    expect(WEBSITE_PARTITION).not.toBe('persist:junk');
    // A webview carries nothing of ours into the page: no preload, and no
    // leave to open windows of its own.
    expect(markup).not.toContain('preload');
    expect(markup).not.toContain('allowpopups');
    expect(markup).not.toContain('nodeintegration');
  });

  it('falls back to a plain frame that can reach nothing of the app\'s', () => {
    const markup = renderToStaticMarkup(h(WebsitePane, { url: 'https://example.com/', webview: false, onNavigate: () => {} }));
    expect(markup).toContain('<iframe');
    expect(markup).not.toContain('<webview');
    expect(markup).toMatch(/sandbox="[^"]*allow-scripts/);
    expect(markup).not.toMatch(/sandbox="[^"]*allow-same-origin/);
  });
});

describe('the thread hands a web link to the pane', () => {
  it('no longer refuses an http address at the door', () => {
    const focus = read('renderer/src/components/Focus.tsx');
    // The old test was `!/^https?:/.test(href) && opensInPane(href)`: every
    // web address was excluded before the kind was ever asked for.
    expect(focus).not.toMatch(/!\/\^https\?:\/\.test\(href\) && opensInPane/);
    expect(focus).toMatch(/opensInPane\(href\) \|\| isLocalPreview\(href\)/);
  });

  it('still hands a pdf and a source file to the app that owns them', () => {
    expect(opensInPane('reports/audit.pdf')).toBe(false);
    expect(opensInPane('main/ipc.mjs')).toBe(false);
  });
});

describe('the mark that takes the page out to your own browser', () => {
  it('is the pane\'s own open mark, named for where it goes', () => {
    const pane = read('renderer/src/components/DocPane.tsx');
    expect(pane).toContain("'Open in your browser'");
  });

  it('can actually be pressed, because the header is never hidden under the page', () => {
    // MEASURED IN THE REAL APP, 2026-10-15. The pane carries `doc-html`, which
    // is right: it is the class for a card holding a page whose colour the app
    // cannot see into. That class ALSO turns the header into a toolbar that
    // fades in under the pointer, and a `<webview>` is a separate compositing
    // layer that paints over everything the card draws, so the crumb and both
    // marks sat at 1278,146 118x42 in the DOM with not one pixel of them on
    // the screen. The way out to your own browser could never be pressed.
    const pane = read('renderer/src/components/DocPane.tsx');
    expect(pane).toMatch(/if \(kind === 'website'\) return 'doc-html doc-website';/);

    // So the floating toolbar is put back in the flow for a website, with its
    // address visible, in the file that floats it.
    const toolbar = read('renderer/src/workspace-navigation.css');
    const back = toolbar.slice(toolbar.indexOf('.doc-html.doc-website .doc-head'));
    expect(back).toContain('position:static');
    expect(back).toContain('opacity:1');
    expect(back).toContain('pointer-events:auto');
    expect(toolbar).toContain('.doc-html.doc-website .doc-crumb { display:flex; }');
  });

  it('still gets the dark header an opaque page needs, in every theme', () => {
    // doc-html is what carries it, and a website keeps that class for exactly
    // this. The block itself is pinned by tests/theme-tokens.test.mjs.
    const styles = read('renderer/src/styles.css');
    expect(styles).toContain(':root:not([data-theme="light"]) .doc-pane.doc-html {');
  });

  it('opens the page you have walked to, not the one the thread named', () => {
    // A webview navigates inside itself, so the address the mark hands over is
    // the one the pane is showing, kept in `here`.
    const pane = read('renderer/src/components/DocPane.tsx');
    expect(pane).toMatch(/kind === 'website'/);
    expect(pane).toMatch(/here/);
  });
});
