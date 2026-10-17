// THE PICTURES, FILMS, SOUNDS AND PAGES A THREAD NAMES, FOR HER PHONE WITH THE
// MAC SHUT.
//
// A thread's copy online is its words (shared/phone-snapshot.mjs), and a path
// in those words is a file on this Mac that the hosted phone site cannot open.
// So for each thread carried, this finds the files its words name, inside that
// project's own folders only, uploads each once to her own private storage
// (named by what is in it, so the same file twice is one upload), and lists
// them in the thread's copy: the path as the screens ask for it, and the name
// online. A page brings the files it draws with it.
//
// What goes up is bounded three ways (per file, per thread, all together), and
// newest threads go first; a file over the per-file bound is listed as too big,
// so the phone can say so instead of drawing nothing. A file no thread names
// any more is deleted after a few days.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { hideSecrets } from '../shared/phone-snapshot.mjs';

// Under the database plan's smallest storage (1 GB), with room.
export const UPLOAD_LIMITS = { fileBytes: 25 * 1024 * 1024, threadBytes: 100 * 1024 * 1024, totalBytes: 900 * 1024 * 1024, files: 60, days: 7 };
const KEEP_UNNAMED_MS = 3 * 24 * 3600_000;
const LOOK_AGAIN_MS = 5 * 60_000;

const TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/mp4', '.webm': 'video/webm',
  '.html': 'text/html', '.htm': 'text/html', '.pdf': 'application/pdf', '.md': 'text/markdown', '.markdown': 'text/markdown', '.csv': 'text/csv',
};
// What a page may bring with it, besides the kinds above.
const PAGE_PARTS = { '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };
const PICTURE = /\.(png|jpe?g|gif|webp|avif)$/i;
const EXT = Object.keys(TYPES).map((e) => e.slice(1)).join('|');
// A path as a worker writes one: bare, after ~/ or /, or in quotes with spaces.
const NAMED = new RegExp(String.raw`(?:["“'‘]((?:~\/|\/)?[^"”'’\r\n]+\.(?:${EXT}))["”'’])|((?:~\/|\/)?[\w@%+=,.\/-]*[\w-]\.(?:${EXT}))(?![\w])`, 'gi');
const FOLDER_LINE = /(?:^|\n)[ \t]*((?:~\/|\/)[\w./-]*[\w-])\/?[ \t]*(?=\n|$)/g;
const SKIP_SEGMENTS = new Set(['node_modules', '.git']);
// A file whose name says it holds a secret never goes, whatever its kind.
const SECRET_NAME = /(secret|credential|passw|token|private[-_.]?key|(^|[/.])env($|[/.]))/i;
// Words, not pictures: what goes up is the text with its keys hidden, as a thread's words are.
const TEXT = /\.(html?|md|markdown|csv|css|svg)$/i;
// A page or stylesheet bigger than this is listed but not read for what it draws.
const PAGE_READ_MAX = 2 * 1024 * 1024;

export const typeOf = (file) => TYPES[path.extname(file).toLowerCase()] ?? PAGE_PARTS[path.extname(file).toLowerCase()] ?? null;

// Newest first, so a long thread's latest messages are the ones its bound keeps.
function textsOf(snapshot) {
  const out = [];
  const add = (v) => { if (typeof v === 'string' && v) out.push(v); };
  for (const v of Object.values(snapshot?.item ?? {})) add(v);
  for (const l of [...(snapshot?.history ?? [])].reverse()) for (const v of Object.values(l?.patch ?? {})) add(v);
  return out;
}

const real = (p) => { try { return fs.realpathSync(p); } catch { return null; } };
const within = (root, file) => !!root && (file === root || file.startsWith(root + path.sep));

/**
 * Where a file is, as the phone knows it: relative to the project's documents
 * folder, or `@repo/` and relative to its code. Null outside both.
 */
export function keyOf(file, { docs, repo }) {
  if (docs && within(docs, file)) return path.relative(docs, file).split(path.sep).join('/');
  if (repo && within(repo, file)) return `@repo/${path.relative(repo, file).split(path.sep).join('/')}`;
  return null;
}

/**
 * The files a thread's copy names, as [{ key, file }], inside the project's
 * own folders only. A bare name is looked for where the screens look for it
 * (renderer/src/message-folders.ts pictureRoots), in that order.
 */
export function filesNamed(snapshot, { dir, repoPath = null, home }) {
  const docs = dir && real(dir);
  if (!docs) return [];
  const repo = repoPath ? real(repoPath) : null;
  const id = snapshot?.item?.id;
  const found = new Map();
  const take = (abs) => {
    const file = real(abs);
    if (!file || file.split(path.sep).some((seg) => SKIP_SEGMENTS.has(seg)) || SECRET_NAME.test(path.basename(file))) return false;
    const key = keyOf(file, { docs, repo });
    if (!key) return false;
    let st;
    try { st = fs.statSync(file); } catch { return false; }
    if (!st.isFile() || !typeOf(file)) return false;
    if (!found.has(key)) found.set(key, file);
    return true;
  };
  const full = (p) => path.resolve(p.startsWith('~/') ? path.join(home, p.slice(2)) : p);
  const texts = textsOf(snapshot);
  const named = [];
  for (const text of texts) for (const m of text.matchAll(NAMED)) named.push((m[1] ?? m[2]).trim());
  // The folders the words name come first, as they do on the screens.
  const folders = [];
  for (const n of named) if (n.includes('/')) folders.push(path.dirname(n.startsWith('/') || n.startsWith('~/') ? full(n) : path.join(docs, n)));
  for (const text of texts) for (const m of text.matchAll(FOLDER_LINE)) folders.push(full(m[1]));
  const roots = [...new Set([
    ...folders, id && path.join(docs, 'designs', id), repo && id && path.join(repo, '.claude', 'worktrees', id),
    docs, path.join(docs, 'designs'), path.join(docs, 'attachments'), repo, repo && path.join(repo, 'designs'),
  ].filter(Boolean))];
  for (const n of named) {
    if (/^[a-z]+:\/\//i.test(n)) continue;
    if (n.startsWith('/') || n.startsWith('~/')) { take(full(n)); continue; }
    const rel = n.replace(/^\.\//, '');
    if (rel.split('/').includes('..')) continue;
    for (const root of roots) if (fs.existsSync(path.join(root, rel)) && take(path.join(root, rel))) break;
  }
  return [...found].map(([key, file]) => ({ key, file }));
}

/** The folders a thread's copy names on a line of their own, as [{ key, pictures: [{ key, file }] }], newest pictures first. */
export function foldersNamed(snapshot, { dir, repoPath = null, home, limit = 6 }) {
  const docs = dir && real(dir);
  if (!docs) return [];
  const repo = repoPath ? real(repoPath) : null;
  const out = [];
  for (const text of textsOf(snapshot)) {
    for (const m of text.matchAll(FOLDER_LINE)) {
      const named = m[1];
      if (/\.[a-z0-9]{1,8}$/i.test(named)) continue;
      const folder = real(path.resolve(named.startsWith('~/') ? path.join(home, named.slice(2)) : named));
      const key = folder && keyOf(folder, { docs, repo });
      if (!key || out.some((f) => f.key === `${key}/`)) continue;
      let entries = [];
      try { entries = fs.readdirSync(folder, { withFileTypes: true }).filter((e) => e.isFile() && PICTURE.test(e.name)); } catch { continue; }
      const pictures = entries
        .map((e) => ({ key: `${key}/${e.name}`, file: path.join(folder, e.name), m: fs.statSync(path.join(folder, e.name)).mtimeMs }))
        .sort((a, b) => b.m - a.m || a.key.localeCompare(b.key))
        .slice(0, limit)
        .map(({ key: k, file }) => ({ key: k, file }));
      out.push({ key: `${key}/`, pictures });
    }
  }
  return out;
}

// What a page draws from beside it: src, href, poster, srcset and url() that
// name a file next to it rather than a site. A stylesheet's own url()s too.
const REFS = /\b(?:src|href|poster|data-src)\s*=\s*["']([^"'#?]+)[^"']*["']|\bsrcset\s*=\s*["']([^"']+)["']|url\(\s*["']?([^"')#?]+)[^"')]*["']?\s*\)/gi;
export function partsOf(text) {
  const out = new Set();
  for (const m of String(text).matchAll(REFS)) {
    const list = m[2] ? m[2].split(',').map((s) => s.trim().split(/\s+/)[0]) : [m[1] ?? m[3]];
    for (const ref of list) {
      if (!ref || /^(?:[a-z][a-z0-9+.-]*:|\/\/|\/|#)/i.test(ref)) continue;
      out.add(decodeURIComponent(ref));
    }
  }
  return [...out];
}

/** A page's own files, as [{ key, file }], one stylesheet deep, inside the project's folders only. */
export function pageParts(page, { docs, repo }) {
  const out = new Map();
  const visit = (file, depth) => {
    let text;
    try {
      if (fs.statSync(file).size > PAGE_READ_MAX) return;
      text = fs.readFileSync(file, 'utf8');
    } catch { return; }
    for (const ref of partsOf(text)) {
      const part = real(path.join(path.dirname(file), ref));
      const key = part && keyOf(part, { docs, repo });
      if (!key || out.has(key) || !typeOf(part) || SECRET_NAME.test(path.basename(part)) || part.split(path.sep).some((seg) => SKIP_SEGMENTS.has(seg))) continue;
      try { if (!fs.statSync(part).isFile()) continue; } catch { continue; }
      out.set(key, part);
      if (depth < 1 && /\.css$/i.test(part)) visit(part, depth + 1);
    }
  };
  visit(page.file, 0);
  return [...out].map(([key, file]) => ({ key, file }));
}

/**
 * The uploader. `manifest(...)` says what a thread's copy lists now (only what
 * is already online, so the phone never asks for a file that is not there yet)
 * and queues the rest; `kick()` uploads what is queued, one file at a time, in
 * the background; `sweep()` deletes what nothing has named for days.
 */
export function createPhoneUploads({ backend, owner, device, alive = () => true, state, save, home, now = Date.now, limits = UPLOAD_LIMITS, log = () => {} }) {
  state.uploaded ??= {}; // name -> { bytes, named: last moment a thread named it }
  // What each file on this Mac is called online, learnt by the upload (off
  // the window's thread, a piece at a time) and good while it is unchanged.
  const names = new Map(); // file -> { size, mtimeMs, name }
  const queue = new Map(); // file -> { bytes, rank, roots, threads }
  const memo = new Map(); // thread -> { base, at, sig, out }
  let running = null;

  const known = (file, st) => {
    const was = names.get(file);
    return was && was.size === st.size && was.mtimeMs === st.mtimeMs ? was.name : null;
  };
  const total = () => Object.values(state.uploaded).reduce((n, u) => n + (u.bytes || 0), 0);

  /**
   * What thread `sk`'s copy (`made()`, built only when needed) lists:
   * { files: { key: { n, s } | { s, big: true } }, folders?: { 'key/': [keys] } },
   * or null when it names nothing that can go. Newer threads upload first.
   * Its words are read again when they change (`base`, the copy's own key) and
   * its files looked at again every five minutes, since a page can change under the
   * same words.
   */
  function manifest(sk, made, { dir, repoPath = null, updatedAt = 0, base = '' }) {
    const was = memo.get(sk);
    if (was && was.base === base && now() - was.at < LOOK_AGAIN_MS) return was.out;
    const rank = Number(updatedAt) || 0;
    let out = null;
    if (now() - rank <= limits.days * 24 * 3600_000) {
      const snapshot = typeof made === 'function' ? made() : made;
      const named = filesNamed(snapshot, { dir, repoPath, home });
      const folders = foldersNamed(snapshot, { dir, repoPath, home });
      const where = { docs: real(dir), repo: repoPath && real(repoPath) };
      // Each page with its own files right after it.
      const all = new Map();
      for (const f of named) {
        if (!all.has(f.key)) all.set(f.key, f.file);
        if (/\.html?$/i.test(f.file)) for (const p of pageParts(f, where)) if (!all.has(p.key)) all.set(p.key, p.file);
      }
      for (const f of folders) for (const p of f.pictures) if (!all.has(p.key)) all.set(p.key, p.file);
      const files = {};
      let bytes = 0;
      for (const [key, file] of [...all].slice(0, limits.files)) {
        let st;
        try { st = fs.statSync(file); } catch { continue; }
        if (st.size > limits.fileBytes || bytes + st.size > limits.threadBytes) { files[key] = { s: st.size, big: true }; continue; }
        bytes += st.size;
        const name = known(file, st);
        if (name && state.uploaded[name]) {
          files[key] = { n: name, s: st.size };
          state.uploaded[name].named = now();
        } else {
          const job = queue.get(file) ?? { bytes: st.size, rank, roots: [where.docs, where.repo].filter(Boolean), threads: new Set() };
          job.rank = Math.max(job.rank, rank);
          job.threads.add(sk);
          queue.set(file, job);
        }
      }
      if (Object.keys(files).length) {
        out = { files };
        const listed = Object.fromEntries(folders.map((f) => [f.key, f.pictures.map((p) => p.key).filter((k) => files[k]?.n)]).filter(([, keys]) => keys.length));
        if (Object.keys(listed).length) out.folders = listed;
      }
    }
    // The same object while nothing in it changed, so the publisher can tell.
    const sig = JSON.stringify(out);
    if (was?.sig === sig) out = was.out;
    // Each thread's next look at its own moment, so they do not all fall in one pass.
    const spread = was ? 0 : (parseInt(crypto.createHash('sha1').update(sk).digest('hex').slice(0, 8), 16) % LOOK_AGAIN_MS);
    memo.set(sk, { base, at: now() - spread, sig, out });
    return out;
  }

  // The file as it is now, read only if it is still the one that was checked:
  // no link anywhere on its way, inside the project, a plain file within the bound.
  async function readChecked(file, roots) {
    if (real(file) !== file || !roots.some((r) => within(r, file))) return null;
    const fh = await fs.promises.open(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const st = await fh.stat();
      const there = fs.statSync(file);
      if (!st.isFile() || st.ino !== there.ino || st.dev !== there.dev || real(file) !== file || st.size > limits.fileBytes) return null;
      const raw = await fh.readFile();
      return { st, data: TEXT.test(file) ? Buffer.from(hideSecrets(raw.toString('utf8'), { home })) : raw };
    } finally {
      await fh.close();
    }
  }

  async function pump() {
    while (queue.size) {
      if (!alive()) return;
      const [file, job] = [...queue].sort((a, b) => b[1].rank - a[1].rank)[0];
      queue.delete(file);
      try {
        const read = await readChecked(file, job.roots);
        if (!read) continue;
        const name = `${crypto.createHash('sha256').update(read.data).digest('hex')}${path.extname(file).toLowerCase()}`;
        names.set(file, { size: read.st.size, mtimeMs: read.st.mtimeMs, name });
        if (!state.uploaded[name]) {
          if (total() + read.data.length > limits.totalBytes) { log('phone: the space for files is full'); continue; }
          if (!alive()) return;
          await backend.putPhoneFile({ owner, device, name, data: read.data, type: typeOf(file) });
          state.uploaded[name] = { bytes: read.data.length, named: now() };
          save();
        }
        // The threads that name it look again at what they list.
        for (const sk of job.threads) { const m = memo.get(sk); if (m) m.at = -Infinity; }
      } catch (err) {
        log(`phone: could not send a file (${err?.message ?? err})`);
      }
    }
  }

  return {
    manifest,
    /** Upload what is queued, in the background; the run already going if there is one. */
    kick() {
      if (!running && queue.size) running = pump().finally(() => { running = null; });
      return running ?? Promise.resolve();
    },
    pending: () => queue.size,
    pendingBytes: () => [...queue.values()].reduce((n, j) => n + j.bytes, 0),
    /** Delete what no thread has named for days. */
    async sweep() {
      const old = Object.entries(state.uploaded).filter(([, u]) => now() - (u.named || 0) > KEEP_UNNAMED_MS).map(([n]) => n);
      if (!old.length || !alive()) return 0;
      await backend.dropPhoneFiles({ owner, device, names: old });
      for (const n of old) delete state.uploaded[n];
      save();
      return old.length;
    },
    forget(sk) { memo.delete(sk); },
  };
}
