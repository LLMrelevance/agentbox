// PICTURES AND DESIGN PAGES ON A PHONE.
//
// The desktop draws them from two addresses only its own window can open
// (main/img-scheme.mjs, main/doc-scheme.mjs). A phone cannot open either, so
// they came up blank on a real iPhone (2026-10-11). The phone's server hands
// the same files out under /f/<file key>/ (main/serve.mjs), and this points
// every such address the screen draws at it, in one place rather than in each
// of the components that draw a picture, a page, a sound or a film.
import { DOC_SCHEMES, IMG_SCHEMES } from '../../shared/schemes.mjs';

const KINDS: [readonly string[], 'doc' | 'img'][] = [[DOC_SCHEMES, 'doc'], [IMG_SCHEMES, 'img']];

/** The phone's address for one of the desktop's, or the address unchanged. */
export function phoneFileUrl(url: string, key: string): string {
  if (!url) return url;
  for (const [schemes, kind] of KINDS) {
    for (const scheme of schemes) {
      const prefix = `${scheme}://file/`;
      if (url.startsWith(prefix)) return `/f/${key}/${kind}/${url.slice(prefix.length)}`;
    }
  }
  return url;
}

const ATTRS = ['src', 'poster'];

/** Rewrite every address already drawn and every one drawn from now on. */
export function installPhoneFiles(key: string, root: Node = document) {
  const fix = (el: Element) => {
    for (const attr of ATTRS) {
      const was = el.getAttribute(attr);
      if (!was) continue;
      const now = phoneFileUrl(was, key);
      if (now !== was) el.setAttribute(attr, now);
    }
  };
  const sweep = (node: Node) => {
    if (!(node instanceof Element)) return;
    fix(node);
    for (const el of node.querySelectorAll(ATTRS.map((a) => `[${a}*="://file/"]`).join(','))) fix(el);
  };
  sweep(root instanceof Document ? root.documentElement : root);
  const watch = new MutationObserver((changes) => {
    for (const change of changes) {
      if (change.type === 'attributes') fix(change.target as Element);
      else for (const node of change.addedNodes) sweep(node);
    }
  });
  watch.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ATTRS });
  return () => watch.disconnect();
}
