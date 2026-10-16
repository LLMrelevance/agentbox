// WHAT NEO'S TOOL CALLS DO IN THE INBOX. Neo's window sends a call to the
// main process, the main process checks it against the tool list
// (shared/neo-tools.mjs) and hands it here, and this does it with the same
// functions the keys do, so Neo can do nothing a person could not.
//
// Every action names a thread id, and is refused if that thread is not in the
// inbox any more (plan review, 2026-10-16). A spoken "close it" lands seconds
// after it was said, and by then the open thread may be another one.
//
// A pick does NOT ask for a second yes, however consequential its words are
// (w-5520063011): saying "option one" is the decision, and it acts, says what
// it did, and leaves Z to take it back, exactly as the key press does.
//
// Pure apart from `deps`, so it is tested without the app
// (tests/neo-acts-only-on-the-thread-it-named-and-asks-before-merging.test.mjs).
import { Name } from '../../../shared/product-name.mjs';

export type NeoRow = { id: string; product: string; productName?: string; title: string; label?: string; status?: string };
export type NeoResult = { ok: boolean; status: 'committed' | 'refused' | 'failed'; said: string };
// A film or a sound drawn in the open thread, in the order they are drawn.
export type NeoFilm = { name: string; playing: boolean; play(): void; pause(): void; show(): void };

export type NeoDeps<R extends NeoRow> = {
  rows(): R[];
  focused(): R | null;
  outside(): boolean;
  options(row: R): { n: number; text: string }[];
  // The players drawn in the open thread right now, read from the page.
  films(): NeoFilm[];
  summary(row: R): string;
  projects(): { slug: string; name: string }[];
  open(row: R): Promise<unknown> | unknown;
  // 'asked' when the app stopped to ask its own question instead.
  pick(row: R, n: number): Promise<'done' | 'asked' | void> | 'done' | 'asked' | void;
  reply(row: R, text: string): Promise<unknown> | unknown;
  close(row: R): Promise<'done' | 'asked' | void> | 'done' | 'asked' | void;
  compose(text: string, product: string): Promise<{ id?: string } | null | undefined>;
  // 'old' is the app's own rule: past thirty seconds Z asks before it undoes
  // (renderer/src/undo-window.ts), and a voice should not answer that for her.
  undo(): Promise<'done' | 'none' | 'old'>;
  glow(id: string): void;
};

// How many rows Neo is told about. The rest are counted, not listed: a long
// inbox read into the session costs time on every turn and Neo only ever
// talks about the top of it.
const LISTED = 12;
const SUMMARY_CHARS = 400;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const nameOf = (r: NeoRow) => (r.label?.trim() || r.title || '').replace(/\s+/g, ' ').replace(/[.!]+$/, '');

export function describeScreen<R extends NeoRow>(deps: NeoDeps<R>): string {
  const list = deps.rows();
  const open = deps.focused();
  const lines: string[] = [];
  if (deps.outside()) lines.push(`The person is in another app; ${Name} is behind it.`);
  if (!list.length) lines.push('Needs you: nothing waiting.');
  else {
    lines.push(`Needs you: ${list.length} thread${list.length === 1 ? '' : 's'}, top first.`);
    list.slice(0, LISTED).forEach((r, i) => {
      lines.push(`${i + 1}. [${r.id}] ${nameOf(r)} (${r.productName ?? r.product})`);
    });
    if (list.length > LISTED) lines.push(`…and ${list.length - LISTED} more.`);
  }
  if (open) {
    lines.push('', `Open thread: ${nameOf(open)} [${open.id}] (${open.productName ?? open.product})`);
    const s = deps.summary(open).trim();
    if (s) lines.push(`Latest from the agent: ${clip(s.replace(/\s+/g, ' '), SUMMARY_CHARS)}`);
    const opts = deps.options(open);
    if (opts.length) lines.push('Options:', ...opts.map((o) => `${o.n}. ${o.text}`));
    const films = deps.films();
    if (films.length) lines.push('On the thread to play:', ...films.map((f, i) => `${i + 1}. ${f.name}${f.playing ? ' (playing)' : ''}`));
  } else lines.push('', 'No thread is open.');
  return lines.join('\n');
}

const done = (said: string): NeoResult => ({ ok: true, status: 'committed', said });
const refused = (said: string): NeoResult => ({ ok: false, status: 'refused', said });
const ASKED = `${Name} is asking something about it on screen. Tell the person to look.`;

export function neoBridge<R extends NeoRow>(deps: NeoDeps<R>) {
  const find = (id: unknown) => {
    const list = deps.rows();
    const open = deps.focused();
    return list.find((r) => r.id === id) ?? (open && open.id === id ? open : null);
  };
  const gone = () => refused('That thread is not in the inbox any more.');

  return async function act(name: string, args: Record<string, any>): Promise<NeoResult> {
    try {
      switch (name) {
        case 'describe_screen':
        case 'get_screen':
          return done(describeScreen(deps));

        case 'open_thread': {
          const row = find(args.id);
          if (!row) return gone();
          await deps.open(row);
          deps.glow(row.id);
          return done(`Opened ${nameOf(row)}.`);
        }

        case 'next_thread': {
          const list = deps.rows();
          const open = deps.focused();
          const at = open ? list.findIndex((r) => r.id === open.id) : -1;
          const next = list[at + 1];
          if (!next) return refused(list.length ? 'That was the last one.' : 'Nothing is waiting.');
          await deps.open(next);
          deps.glow(next.id);
          return done(`Opened ${nameOf(next)}.`);
        }

        case 'pick_option': {
          const row = find(args.id);
          if (!row) return gone();
          const option = deps.options(row).find((o) => o.n === args.n);
          if (!option) return refused(`That thread has no option ${args.n}.`);
          const words = option.text.replace(/\s*\(recommended\)\s*$/i, '').trim();
          const picked = await deps.pick(row, option.n);
          deps.glow(row.id);
          if (picked === 'asked') return refused(ASKED);
          return done(`Picked option ${option.n}: ${words}.`);
        }

        // The players are the ones drawn on screen, so these two act on the
        // open thread and nothing else.
        case 'play_media': {
          const row = find(args.id);
          if (!row) return gone();
          if (deps.focused()?.id !== row.id) return refused('That thread is not the one open, so its film is not on screen. Open it first.');
          const films = deps.films();
          if (!films.length) return refused('There is no film or sound on that thread.');
          const n = Number.isInteger(args.n) ? args.n : 1;
          const film = films[n - 1];
          if (!film) return refused(`That thread has ${films.length} to play, so there is no ${n}.`);
          for (const other of films) if (other !== film && other.playing) other.pause();
          film.show();
          film.play();
          deps.glow(row.id);
          return done(`Playing ${film.name}.`);
        }

        case 'pause_media': {
          const row = find(args.id);
          if (!row) return gone();
          if (deps.focused()?.id !== row.id) return refused('That thread is not the one open.');
          const playing = deps.films().filter((f) => f.playing);
          if (!playing.length) return refused('Nothing is playing.');
          for (const film of playing) film.pause();
          return done(playing.length === 1 ? `Paused ${playing[0].name}.` : 'Paused.');
        }

        case 'reply': {
          const row = find(args.id);
          if (!row) return gone();
          const text = String(args.text ?? '').trim();
          if (!text) return refused('There was nothing to send.');
          await deps.reply(row, text);
          deps.glow(row.id);
          return done('Sent.');
        }

        case 'close_thread': {
          const row = find(args.id);
          if (!row) return gone();
          deps.glow(row.id);
          if ((await deps.close(row)) === 'asked') return refused(ASKED);
          return done(`Closed ${nameOf(row)}.`);
        }

        case 'new_thread': {
          const text = String(args.text ?? '').trim();
          if (!text) return refused('There was nothing to start.');
          const projects = deps.projects();
          let slug: string | undefined;
          if (args.project) {
            const want = String(args.project).trim().toLowerCase();
            slug = projects.find((p) => p.slug.toLowerCase() === want || p.name.trim().toLowerCase() === want)?.slug;
            if (!slug) return refused(`There is no project called ${args.project}. The projects are ${projects.map((p) => p.name).join(', ')}.`);
          } else slug = deps.focused()?.product ?? projects[0]?.slug;
          if (!slug) return refused('There is no project to start it in.');
          const made = await deps.compose(text, slug);
          if (!made) return { ok: false, status: 'failed', said: 'It did not start.' };
          const project = projects.find((p) => p.slug === slug)?.name ?? slug;
          return done(`Started it in ${project}.`);
        }

        case 'undo': {
          const r = await deps.undo();
          if (r === 'done') return done('Undone.');
          return refused(r === 'old' ? 'That was a while ago, so the person has to press Z to take it back.' : 'There is nothing to undo.');
        }

        default:
          return refused(`Neo cannot ${name}.`);
      }
    } catch (err) {
      return { ok: false, status: 'failed', said: `That did not work: ${String((err as Error)?.message ?? err).slice(0, 120)}` };
    }
  };
}
