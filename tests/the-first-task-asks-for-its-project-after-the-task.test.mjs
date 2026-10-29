// The first task screen asked for a project folder and a task at once. Send
// was dead until a folder was chosen, so somebody who typed a task and pressed
// Send got nothing, and the folder window that followed came with no reason.
// Which project is right often depends on the task, so the task is asked
// first and the project on a screen of its own after it. Found walking the
// onboarding as a new user, 2026-10-29.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { previousScreen, stepsFor } from '../renderer/src/first-run';

const source = fs.readFileSync(new URL('../renderer/src/components/FirstRun.tsx', import.meta.url), 'utf8');
const between = (from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));

describe('the steps', () => {
  it('end on the project, after the task', () => {
    expect(stepsFor({ chats: 0 })).toEqual(['task', 'where']);
    expect(stepsFor({ chats: 2 })).toEqual(['chats', 'task', 'where']);
  });

  it('go back from the project to the task, keeping what was typed', () => {
    expect(previousScreen('where', { chats: 0 })).toBe('task');
    expect(previousScreen('where', { chats: 2 })).toBe('task');
    expect(previousScreen('task', { chats: 0 })).toBe('welcome');
  });
});

describe('the task screen', () => {
  const task = between("{screen === 'task' && (", "{screen === 'where' && (");

  it('asks only for the task', () => {
    expect(task).toContain('What’s the first task you want to give your agent?');
    expect(task).not.toContain('chooseAnother');
    expect(task).not.toContain('Choose project folder');
  });

  it('moves on as soon as there is a task, with no folder needed', () => {
    expect(task).toMatch(/disabled=\{!text\.trim\(\) \|\| busy\}/);
    expect(between('const next = useCallback', '}, [')).toContain("go('where')");
  });
});

describe('the project screen', () => {
  const where = between("{screen === 'where' && (", '</div>\n  );\n}');

  it('asks which project the task is for, and shows the task', () => {
    expect(where).toContain('Which project is it for?');
    expect(where).toContain('{text.trim()}');
  });

  it('draws one list, recent folders or not, ending on the row that opens the folder window', () => {
    expect(where).not.toContain('places.length > 0 ? (');
    expect(where).not.toContain('className="ob-btn"');
    expect(where).toContain("places.length ? 'Choose another folder' : 'Choose its folder'");
    expect(where).toContain('onClick={() => pickPlace(places.length)}');
    expect(between('const pickPlace = useCallback', '}, [')).toContain('void chooseAnother()');
  });

  it('sends the task to the folder just chosen, with nothing more to press', () => {
    expect(between('const chooseFolder = useCallback', '}, [')).toContain('void sendTo(folder)');
  });
});
