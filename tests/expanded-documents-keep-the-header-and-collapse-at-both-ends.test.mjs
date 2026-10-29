// Expanding HTML opened a reader that lost the file's header. The expanded
// document must keep its top actions and a second collapse control below it.
import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FilePreviewHeader } from '../renderer/src/components/OneThingAtATime.tsx';
import { DocumentPreview } from '../renderer/src/components/DocumentPreview.tsx';

const noop = () => {};
const words = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const header = (expanded, folded = false) => renderToStaticMarkup(h(FilePreviewHeader, {
  path: 'reports/release-plan.md', expanded, folded,
  onFold: noop, onCondense: noop, onOpen: noop,
}));

describe('an expanded document', () => {
  it('keeps its name, collapse action and full-screen action at the top', () => {
    const html = header(true);
    expect(words(html)).toBe('release-plan.md Show preview Open full screen');
    expect(html).toContain('class="one-filefold" aria-expanded="true"');
  });

  it('keeps the whole content and a collapse button at the bottom', () => {
    const html = renderToStaticMarkup(h(DocumentPreview, {
      expanded: true, onExpandedChange: noop,
    }, h('p', null, 'The end of the complete document.')));
    expect(words(html)).toBe('The end of the complete document. Show preview');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('document-preview-frame is-expanded');
  });
});

describe('a compact document', () => {
  it('keeps the name and full-screen action without an extra collapse button', () => {
    expect(words(header(false))).toBe('release-plan.md Open full screen');
  });

  it('offers the side before full screen when it can open there', () => {
    const html = renderToStaticMarkup(h(FilePreviewHeader, {
      path: 'reports/release-plan.md', expanded: false, folded: false,
      onFold: noop, onCondense: noop, onOpen: noop, onSide: noop,
    }));
    expect(words(html)).toBe('release-plan.md Open on the side Open full screen');
  });

  it('can still fold down to its header', () => {
    expect(header(false, true)).toContain('class="one-filefold" aria-expanded="false"');
  });
});
