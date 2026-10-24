// "I also think it'd be really useful to be able to see what each character is
// doing, basically its job title, in the sidebar because I can't remember who
// Juno and Mira are functionally." The sidebar showed a teammate's name and
// what it was on, and its role only on its own page, in the agent's own
// casing ("video producer"). Now the role follows the name in the sidebar and
// in its hover label, with a capital first letter wherever it is drawn.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const { roleLabel } = await import('../renderer/src/teammates/chat-lines.ts');
const read = (f) => fs.readFileSync(new URL(`../renderer/src/teammates/${f}`, import.meta.url), 'utf8');

describe('a teammate\'s role', () => {
  it('starts with a capital and keeps the rest as written', () => {
    expect(roleLabel('video producer')).toBe('Video producer');
    expect(roleLabel('QA lead for iOS')).toBe('QA lead for iOS');
    expect(roleLabel('  growth marketer ')).toBe('Growth marketer');
  });

  it('is nothing when there is none, so no gap is drawn for it', () => {
    expect(roleLabel(null)).toBe('');
    expect(roleLabel('   ')).toBe('');
  });

  it('follows the name in the sidebar and in its hover label', () => {
    const rail = read('TeammatesRail.tsx');
    expect(rail).toMatch(/<b>\{t\.name\}<\/b>\{role && <i className="tq-role">\{role\}<\/i>\}/);
    expect(rail).toMatch(/title=\{role \? `\$\{t\.name\}, \$\{role\}` : t\.name\}/);
  });

  it('is drawn the same way at the top of its page and in the list of teammates', () => {
    const page = read('TeammatesPage.tsx');
    expect(page).toMatch(/<span className="tq-role">\{roleLabel\(t\.role\)\}<\/span>/);
    expect(page).toMatch(/<i className="r">\{roleLabel\(t\.role\)\}<\/i>/);
  });
});
