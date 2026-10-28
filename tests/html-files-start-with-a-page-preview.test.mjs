// HTML files kept a tall, independently scrolling frame in chat. Their compact
// preview must offer the full reader without weakening the phone sandbox.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HtmlPreview } from '../renderer/src/components/HtmlPreview.tsx';

const screen = vi.hoisted(() => ({ phone: false }));
vi.mock('../renderer/src/phone-screen', () => ({ onPhone: () => screen.phone }));
afterEach(() => { screen.phone = false; });

const draw = (path = 'designs/review.html') => renderToStaticMarkup(h(HtmlPreview, {
  path, url: '/files/review.html', onOpen: () => {},
}));

describe('an HTML file preview', () => {
  it.each(['designs/review.html', 'designs/review.htm'])('bounds %s and offers the full reader', (path) => {
    const html = draw(path);
    expect(html).toContain('document-preview-frame');
    expect(html).toContain('scrolling="no"');
    expect(html).toContain('Show full document');
    expect(html).toContain(`title="${path}"`);
    expect(html).not.toContain('aria-expanded=');
  });

  it('keeps the desktop sandbox and the resolved address', () => {
    const html = draw();
    expect(html).toContain('src="/files/review.html"');
    expect(html).toContain('sandbox="allow-scripts allow-same-origin"');
  });

  it('keeps a phone page isolated from the inbox', () => {
    screen.phone = true;
    expect(draw()).toContain('sandbox="allow-scripts"');
    expect(draw()).not.toContain('allow-same-origin');
  });
});
