// THE FIRST RUN'S RULES, with no window in them (w-fadbbea8ef). The screens are
// components/FirstRun.tsx; tests/the-first-run-starts-on-real-work.test.mjs
// holds what each rule is for.

import { checkProjectFolder } from '../../shared/project-folder-check.mjs';
import { projectNameFor } from './agent-import-card';
import { shortPath } from './onboarding';

export type Step = 'folders' | 'chats' | 'task';
export type ListKey = 'up' | 'down' | 'toggle' | 'next' | 'skip' | 'rename' | null;

type KeyLike = { key: string; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean };

/** Enter acts on the row you are on; ⌘↵ or Ctrl+Enter moves on. */
export function listKey(e: KeyLike): ListKey {
  if (e.key === 'Enter') {
    if (e.shiftKey || e.altKey) return null;
    return e.metaKey || e.ctrlKey ? 'next' : 'toggle';
  }
  if (e.key === 'ArrowUp') return 'up';
  if (e.key === 'ArrowDown') return 'down';
  if (e.key === 'Tab') return 'rename';
  if (e.key === 'Escape') return 'skip';
  return null;
}

/** Whether a key press is ⌘↵ or Ctrl+Enter, which sends from a text field. */
export const isSend = (e: KeyLike): boolean => e.key === 'Enter' && !!(e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey;

type ThreadLike = { folder?: string; short?: string; when?: number; imported?: boolean };

export interface FolderChoice {
  folder: string;
  name: string;
  short: string;
  chats: number;
  when: number;
}

const bare = (folder: string) => folder.replace(/\/+$/, '');

/** The folders your agents already ran in, busiest first. */
export function folderChoices(threads: ThreadLike[], { home = '', max = 5 }: { home?: string; max?: number } = {}): FolderChoice[] {
  const by = new Map<string, FolderChoice>();
  for (const t of threads) {
    const folder = bare(String(t.folder ?? ''));
    if (!folder || folder === '/') continue;
    // The chat's own `~/` path answers before the app has said where home is.
    if (!checkProjectFolder(folder, { home }).ok || (t.short && !checkProjectFolder(t.short, { home }).ok)) continue;
    const had = by.get(folder);
    if (had) {
      had.chats += 1;
      had.when = Math.max(had.when, t.when ?? 0);
      continue;
    }
    by.set(folder, {
      folder,
      name: projectNameFor({ name: folder.split('/').pop() ?? '' }),
      short: t.short ? bare(t.short) : shortPath(folder, home),
      chats: 1,
      when: t.when ?? 0,
    });
  }
  return [...by.values()].sort((a, b) => b.chats - a.chats || b.when - a.when).slice(0, max);
}

/** The newest chats in the folders picked, leaving out any already in the inbox. */
export function chatChoices<T extends ThreadLike>(threads: T[], folders: string[], { max = 8 }: { max?: number } = {}): T[] {
  const picked = new Set(folders.map(bare));
  return threads
    .filter((t) => !t.imported && picked.has(bare(String(t.folder ?? ''))))
    .sort((a, b) => (b.when ?? 0) - (a.when ?? 0))
    .slice(0, max);
}

export function stepsFor({ chats }: { chats: number }): Step[] {
  return chats > 0 ? ['folders', 'chats', 'task'] : ['folders', 'task'];
}

export function foldersLabel(n: number): string {
  if (n <= 0) return 'Use a folder';
  return n === 1 ? 'Use 1 folder' : `Use ${n} folders`;
}

/** The first one only reads the code, so nothing changes unless you want it to. */
export function ideasFor(name: string): string[] {
  return [
    `Explain how ${name} is put together`,
    `Find a bug in ${name} and fix it`,
    `Add tests where ${name} has none`,
  ];
}

/** The one-time lessons left after the first run: the key beside the first thread, and the lit 1. */
export const TEACH_KEY = 'zero.firstRun.teach';
export type Lesson = 'open' | 'pick';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function lessonsLeft(store: Store): Lesson[] {
  try {
    const raw = store.getItem(TEACH_KEY);
    return raw ? raw.split(',').filter((l): l is Lesson => l === 'open' || l === 'pick') : [];
  } catch { return []; }
}

export function setLessons(store: Store, lessons: Lesson[]): void {
  try { store.setItem(TEACH_KEY, lessons.join(',')); } catch { /* a lesson missed is not worth a failure */ }
}
