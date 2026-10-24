// THE TOAST KEEPS CLEAR OF THE APPROVAL CARD'S BUTTONS.
//
// Found by a tester on the Linux box, 2026-10-23 (F-30): file a task whose
// agent asks for permission straight away, and the "Started in ..." toast lands
// on top of Allow and Deny until it goes. Both sit in the bottom right corner,
// and the toast is at z-index 310 against the card's 90, so the toast wins and
// the two buttons you are reaching for are under it. Photographed on this
// branch: the card at 440px wide, right 22 / bottom 22, and the toast at 360px
// wide, right 30 / bottom 30.
//
// It is the same fault the composer already has a rule for, and the same fix:
// the toast goes to the top of the window, which is clear whatever height the
// card has grown to.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const css = read('renderer/src/styles.css');
const app = read('renderer/src/App.tsx');

describe('the toast while an approval is waiting', () => {
  it('is lifted out of the corner the card sits in', () => {
    const rule = css.match(/\n\.app\.asking \.toast \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/bottom:\s*auto/);
    expect(rule).toMatch(/top:/);
  });

  it('is lifted by the same rule the composer uses, so there is one answer', () => {
    const composing = css.match(/\n\.app\.composing \.toast \{[^}]*\}/)?.[0] ?? '';
    const asking = css.match(/\n\.app\.asking \.toast \{[^}]*\}/)?.[0] ?? '';
    expect(asking.replace('asking', 'composing')).toBe(composing);
  });

  it('wears that class exactly while a card is on screen', () => {
    expect(app).toMatch(/cardOnScreen \? ' asking' : ''/);
    // Off the same queue the card itself is drawn from, so the two cannot
    // disagree about whether anything is being asked.
    expect(app).toMatch(/const stage = approvalStage\(/);
    expect(app).toMatch(/const cardOnScreen = !!stage\.card/);
    expect(app).toMatch(/const \{ card: a, verdict, waiting \} = stage;/);
  });
});
