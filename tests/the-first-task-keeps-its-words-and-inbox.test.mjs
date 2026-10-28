// First tasks lost single-line text and skipped drafts; the open hint caused a render loop.
import { expect, it } from 'vitest';
import fs from 'node:fs';

const first = fs.readFileSync(new URL('../renderer/src/components/FirstRun.tsx', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');

it('sends the complete body for single-line and multiline tasks, including repeats', () => {
  expect(first).toContain('const body = said;');
  expect(first).toMatch(/composeRepeat\(\{[^}]*body/);
  expect(first).toMatch(/api.compose\(\{[^}]*body/);
});

it('hands skipped words to a visible composer before onboarding unmounts', () => {
  expect(first).toContain('onDone(sent, when.runAt, sent ? undefined : text)');
  expect(app).toContain('setComposeInitial({ body: draft })');
  expect(app).toMatch(/if \(draft\?\.trim\(\)\) \{[\s\S]*?setModal\('compose'\)/);
});

it('retains the same hint state when the measured position is unchanged', () => {
  const setter = app.match(/setLessonAt\(\(had\) => ([^;]+)\);/);
  expect(setter).not.toBeNull();
  const update = new Function('had', 'next', `return ${setter?.[1]}`);
  const had = { left: 200, top: 100 };
  expect(update(had, { ...had })).toBe(had);
  expect(update(had, { left: 201, top: 100 })).toEqual({ left: 201, top: 100 });
  expect(update(null, had)).toBe(had);
});
