// THE FIRST RUN STARTS ON REAL WORK (w-fadbbea8ef, 2026-10-26).
//
// What broke: of 115 installs, 72% replied to an agent during setup, but those
// replies went to the practice tasks; only 17 sent three replies to real agents
// on their first day. The new first run (components/FirstRun.tsx) skips the
// practice round and goes from your own folders and your own Claude Code chats
// to a first real task.
//
// These are its rules, which have no window in them:
//  - Enter ticks the row you are on and ⌘↵ (Ctrl+Enter) moves on. The founder,
//    on the folder screen: "Everyone would assume that Enter selects and
//    deselects a folder", and ⌘↵ is the key "when you're doing multiple things".
//  - The folders offered are the ones your agents already ran in, busiest first,
//    never the home folder or a folder macOS guards.
//  - The chats offered are the newest in the folders you picked, never one that
//    is already in the inbox.
//  - The chats step is skipped when there is nothing to bring in.
import { describe, it, expect } from 'vitest';
import { listKey, folderChoices, chatChoices, stepsFor, foldersLabel, ideasFor } from '../renderer/src/first-run.ts';

const key = (k, mods = {}) => ({ key: k, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods });

describe('the keys on a list screen', () => {
  it('Enter ticks or unticks the row you are on', () => {
    expect(listKey(key('Enter'))).toBe('toggle');
  });
  it('Command or Control with Enter moves on', () => {
    expect(listKey(key('Enter', { metaKey: true }))).toBe('next');
    expect(listKey(key('Enter', { ctrlKey: true }))).toBe('next');
  });
  it('Shift or Option with Enter does neither', () => {
    expect(listKey(key('Enter', { shiftKey: true }))).toBe(null);
    expect(listKey(key('Enter', { altKey: true }))).toBe(null);
  });
  it('Space is not the tick any more', () => {
    expect(listKey(key(' '))).toBe(null);
  });
  it('the arrows move, Tab renames and Escape skips', () => {
    expect(listKey(key('ArrowUp'))).toBe('up');
    expect(listKey(key('ArrowDown'))).toBe('down');
    expect(listKey(key('Tab'))).toBe('rename');
    expect(listKey(key('Escape'))).toBe('skip');
  });
});

const HOME = '/Users/you';
const thread = (folder, when, extra = {}) => ({
  id: `t-${folder}-${when}`, source: 'terminal', folder, folderName: folder.split('/').pop(),
  short: folder.replace(HOME, '~'), title: `chat in ${folder} at ${when}`, when, path: `${folder}/${when}.jsonl`, ...extra,
});

describe('the folders offered', () => {
  const threads = [
    thread(`${HOME}/dev/northwind`, 50), thread(`${HOME}/dev/northwind`, 40), thread(`${HOME}/dev/northwind`, 30),
    thread(`${HOME}/dev/website`, 90),
    thread(`${HOME}/dev/api`, 20), thread(`${HOME}/dev/api`, 10),
    thread(HOME, 99),
    thread(`${HOME}/Downloads`, 98),
    thread('', 97),
  ];
  const got = folderChoices(threads, { home: HOME });

  it('are where your chats ran, busiest first, newest breaking a tie', () => {
    expect(got.map((f) => f.short)).toEqual(['~/dev/northwind', '~/dev/api', '~/dev/website']);
    expect(got.map((f) => f.chats)).toEqual([3, 2, 1]);
  });
  it('are named the way a person would name the project', () => {
    expect(got[0].name).toBe('Northwind');
    expect(folderChoices([thread(`${HOME}/dev/agentbox-v2`, 1)], { home: HOME })[0].name).toBe('Agentbox V2');
  });
  it('never offer the home folder, a guarded folder or a chat with no folder', () => {
    const shorts = got.map((f) => f.short);
    expect(shorts).not.toContain('~');
    expect(shorts).not.toContain('~/Downloads');
    expect(got).toHaveLength(3);
  });
  it('stop at five', () => {
    const many = Array.from({ length: 9 }, (_, i) => thread(`${HOME}/dev/p${i}`, i));
    expect(folderChoices(many, { home: HOME })).toHaveLength(5);
  });
  it('still read as ~/ and still refuse a guarded folder before the app knows the home folder', () => {
    const early = folderChoices(threads, { home: '' });
    expect(early.map((f) => f.short)).toEqual(['~/dev/northwind', '~/dev/api', '~/dev/website']);
  });
  it('count each chat once even when a folder is written with a trailing slash', () => {
    const two = [thread(`${HOME}/dev/x`, 1), { ...thread(`${HOME}/dev/x/`, 2), folder: `${HOME}/dev/x/` }];
    expect(folderChoices(two, { home: HOME })).toEqual([expect.objectContaining({ chats: 2 })]);
  });
});

describe('the chats offered', () => {
  const threads = [
    thread(`${HOME}/dev/northwind`, 10), thread(`${HOME}/dev/northwind`, 30),
    thread(`${HOME}/dev/northwind`, 20, { imported: true }),
    thread(`${HOME}/dev/website`, 40),
  ];
  it('are the newest in the folders you picked', () => {
    expect(chatChoices(threads, [`${HOME}/dev/northwind`]).map((t) => t.when)).toEqual([30, 10]);
  });
  it('leave out a chat already in the inbox and a folder you did not pick', () => {
    const got = chatChoices(threads, [`${HOME}/dev/northwind`]);
    expect(got.some((t) => t.imported)).toBe(false);
    expect(got.some((t) => t.folder.endsWith('website'))).toBe(false);
  });
  it('stop at eight', () => {
    const many = Array.from({ length: 12 }, (_, i) => thread(`${HOME}/dev/n`, i));
    expect(chatChoices(many, [`${HOME}/dev/n`])).toHaveLength(8);
  });
});

describe('the steps', () => {
  it('are folders, chats and a first task when there are chats to bring in', () => {
    expect(stepsFor({ chats: 3 })).toEqual(['folders', 'chats', 'task']);
  });
  it('skip the chats when there are none', () => {
    expect(stepsFor({ chats: 0 })).toEqual(['folders', 'task']);
  });
});

describe('the words', () => {
  it('count the folders on the button', () => {
    expect(foldersLabel(1)).toBe('Use 1 folder');
    expect(foldersLabel(2)).toBe('Use 2 folders');
    expect(foldersLabel(0)).toBe('Use a folder');
  });
  it('offer a first task that only reads the code first', () => {
    expect(ideasFor('Northwind')[0]).toBe('Explain how Northwind is put together');
    expect(ideasFor('Northwind')).toHaveLength(3);
  });
});
