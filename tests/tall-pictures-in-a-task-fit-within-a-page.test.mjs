// Tall screenshots could fill several screens in an agent task. Bound their
// preview while preserving the full-image opener and the smaller chat layout.
import { expect, it } from 'vitest';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../renderer/src/${file}`, import.meta.url), 'utf8');

it('limits clickable pictures only on task pages', () => {
  const css = read('document-preview.css');
  expect(css).toMatch(/\.focus-pane\[data-file-previews="page"\] \.inline-image-open\s*\{[^}]*max-height:\s*min\(560px, 60vh\)[^}]*overflow:\s*hidden/);
  expect(read('components/Focus.tsx')).toContain('data-file-previews={page && !inChats ? \'page\' : undefined}');
});

it('keeps the existing full-image opener', () => {
  const focus = read('components/Focus.tsx');
  expect(focus).toContain('onClick={(e) => onOpen(path, e.currentTarget)}');
});
