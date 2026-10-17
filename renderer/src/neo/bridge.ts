// WHAT NEO'S TOOL CALLS DO IN THE INBOX. Neo's window sends a call to the
// main process, the main process checks it against the tool list
// (shared/neo-tools.mjs) and hands it here, and this does it with the same
// functions the keys do, so Neo can do nothing a person could not.
//
// Two rules, both from the plan review (2026-10-16):
// - Every action names a thread id, and is refused if that thread is not in
//   the inbox any more. A spoken "close it" lands seconds after it was said,
//   and by then the open thread may be another one.
// - A pick whose words merge, ship, delete or push comes back `needs_yes`
//   until the call says the person confirmed it, so a misheard word never
//   ships anything.
//
// Pure apart from `deps`, so it is tested without the app
// (tests/neo-acts-only-on-the-thread-it-named-and-asks-before-merging.test.mjs).
import { needsYes } from '../../../shared/neo-tools.mjs';
import { Name } from '../../../shared/product-name.mjs';

export type NeoRow = { id: string; product: string; productName?: string; title: string; label?: string; status?: string };
export type NeoResult = { ok: boolean; status: 'committed' | 'needs_yes' | 'refused' | 'failed'; said: string };

export type NeoDeps<R extends NeoRow> = {
  rows(): R[];
  // Every thread the app knows (Needs you, In progress, Later, Done), for finding one by id.
  threadsAnywhere?(): R[];
  focused(): R | null;
  outside(): boolean;
  options(row: R): { n: number; text: string }[];
  summary(row: R): string;
  projects(): { slug: string; name: string }[];
  open(row: R): Promise<unknown> | unknown;
  // 'asked' when the app stopped to ask its own question instead.
  pick(row: R, n: number): Promise<'done' | 'asked' | void> | 'done' | 'asked' | void;
  // `attach`: send the pictures in her reply box with it. 'no-pictures' when there were none to send.
  reply(row: R, text: string, o?: { attach?: boolean }): Promise<unknown> | unknown;
  close(row: R): Promise<'done' | 'asked' | void> | 'done' | 'asked' | void;
  compose(text: string, product: string): Promise<{ id?: string } | null | undefined>;
  // 'old' is the app's own rule: past thirty seconds Z asks before it undoes
  // (renderer/src/undo-window.ts), and a voice should not answer that for her.
  undo(): Promise<'done' | 'none' | 'old'>;
  glow(id: string): void;
  // Moves a thread to Later until ts, the Later picker's own step in App.tsx.
  later?(row: R, ts: number, label: string): Promise<unknown>;
  now?(): number;
  // Films and sounds in the open thread: their names, and playing one.
  mediaNames?(): string[];
  // Everything ⌘K offers right now (components/Palette.tsx), searched by words.
  commands?(): { id: string; label: string; hint?: string; keywords?: string; run: () => unknown }[];
  // Scroll what she is reading; false when nothing there scrolls.
  scroll?(where: 'up' | 'down' | 'top' | 'bottom'): boolean;
  // Pictures in the open thread, and showing them (./show.ts).
  pictureNames?(): string[];
  // How many of those are in the latest message; they come first.
  latestPictureCount?(): number;
  // Resolves once the opened thread has drawn its pictures, or soon after if it has none.
  waitForPictures?(): Promise<void>;
  show?(pictures: number[], layout: 'in_place' | 'lifted' | 'side_by_side' | 'full_screen' | 'close'): Promise<boolean>;
  media?(action: 'play' | 'pause', n: number): Promise<{ name: string; count: number } | null>;
};

const NUMBER_WORDS = [[], ['one', 'first', '1'], ['two', 'second', '2'], ['three', 'third', '3'], ['four', 'fourth', '4'], ['five', 'fifth', '5'], ['six', 'sixth', '6'], ['seven', 'seventh', '7'], ['eight', 'eighth', '8'], ['nine', 'ninth', '9']];
const NOT = /\b(don'?t|do not|not|no|never|wait|hold|stop|cancel)\b/;
const ASKING = /^(what|which|how|why|does|do|is|are|can|could|should|would|will)\b|\?\s*$/;

/**
 * Did the person's own words pick this option? "option one", "the first",
 * "merge it" for "Merge it" do; "do it", "yes", a question, or anything with
 * a no in it do not, so those still get asked.
 */
const STOP = new Set(['the', 'a', 'an', 'to', 'and', 'or', 'of', 'on', 'in', 'it', 'my', 'me', 'can', 'you', 'please', 'this', 'that', 'for', 'with', 'all']);

/** The commands her words point at, best first. Every word counts, so "pause the agents" finds "Pause agents". */
export function findCommands<C extends { label: string; hint?: string; keywords?: string }>(query: string, commands: C[], most = 8): C[] {
  const words = String(query).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w));
  if (!words.length) return [];
  const tokens = (t: string) => t.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  // A word or the start of one: "sett" finds Settings, "board" does not find keyboard.
  const has = (list: string[], w: string) => list.some((t) => t.startsWith(w));
  const rows = commands.map((c) => ({ label: tokens(c.label), rest: tokens(`${c.keywords ?? ''} ${c.hint ?? ''}`) }));
  // A word most commands share ("open", "show") says less than a rare one ("settings").
  const weight = new Map(words.map((w) => [w, 1 / Math.max(1, rows.filter((r) => has(r.label, w) || has(r.rest, w)).length)]));
  return commands
    .map((c, i) => {
      const { label, rest } = rows[i];
      const score = words.reduce((n, w) => n + weight.get(w)! * (has(label, w) ? 2 : has(rest, w) ? 1 : 0), 0);
      return { c, i, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, most)
    .map((x) => x.c);
}

// Commands that stop, close, approve, restart or open another copy of the app.
const CHANGES_THREAD = new Set(['open_thread', 'next_thread', 'close_thread', 'later', 'run_command', 'pick_option']);

const RISKY_COMMAND = /^(pause|done|approve|update|first-run|fresh-user|demo|tutorial|stop|resume|cloud|run-now)/;

function saysWord(heard: string | undefined, word: string): boolean {
  const said = String(heard ?? '').toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!said || NOT.test(said) || ASKING.test(said) || /\?\s*$/.test(String(heard))) return false;
  return said.split(' ').includes(word);
}

export function namesOption(heard: string | undefined, option: { n: number; text: string }): boolean {
  const said = String(heard ?? '').toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!said || NOT.test(said) || ASKING.test(said) || /\?\s*$/.test(String(heard))) return false;
  const tokens = new Set(said.split(' '));
  const numbers = NUMBER_WORDS.flatMap((w, i) => w.filter((x) => tokens.has(x)).map(() => i));
  if (numbers.length) return numbers.every((i) => i === option.n);
  const verb = option.text.toLowerCase().match(/\b(merge|ship|deploy|publish|push|release|delete|remove|drop|wipe|force)\b/);
  return !!verb && tokens.has(verb[1]);
}

// How many rows Neo is told about. The rest are counted, not listed: a long
// inbox read into the session costs time on every turn and Neo only ever
// talks about the top of it.
const LISTED = 12;
const SUMMARY_CHARS = 400;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
// An agent's words as they read aloud: a picture or link is named, never spelled out.
export const spoken = (s: string) => s
  .replace(/!\[([^\]]*)\]\([^)]*\)/g, (_m, alt) => `[picture${alt ? `: ${alt}` : ''}]`)
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/[*_`#>]+/g, '')
  .replace(/\s+/g, ' ')
  .trim();
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
  // Threads not waiting on her (an agent is on them, or put off) can still be opened by name.
  const waiting = new Set(list.map((r) => r.id));
  const others = (deps.threadsAnywhere?.() ?? []).filter((r) => !waiting.has(r.id) && r.status !== 'done').slice(0, LISTED);
  if (others.length) lines.push('Also open:', ...others.map((r) => `[${r.id}] ${nameOf(r)} (${r.productName ?? r.product})`));
  if (open) {
    lines.push('', `Open thread: ${nameOf(open)} [${open.id}] (${open.productName ?? open.product})`);
    const s = spoken(deps.summary(open));
    if (s) lines.push(`Latest from the agent: ${clip(s, SUMMARY_CHARS)}`);
    const opts = deps.options(open);
    if (opts.length) lines.push('Options:', ...opts.map((o) => `${o.n}. ${o.text}`));
    const pics = (deps.pictureNames?.() ?? []).slice(0, 9);
    const latest = Math.min(deps.latestPictureCount?.() ?? pics.length, pics.length);
    if (latest) lines.push('Pictures in the latest message:', ...pics.slice(0, latest).map((f, i) => `${i + 1}. ${f}`));
    if (pics.length > latest) lines.push('Earlier in the thread:', ...pics.slice(latest).map((f, i) => `${latest + i + 1}. ${f}`));
    const films = deps.mediaNames?.() ?? [];
    if (films.length) lines.push('Films and sounds:', ...films.slice(0, 9).map((f, i) => `${i + 1}. ${f}`));
  } else lines.push('', 'No thread is open.');
  return lines.join('\n');
}

const done = (said: string): NeoResult => ({ ok: true, status: 'committed', said });
const refused = (said: string): NeoResult => ({ ok: false, status: 'refused', said });
const ASKED = `${Name} is asking something about it on screen. Tell the person to look.`;

export function neoBridge<R extends NeoRow>(deps: NeoDeps<R>) {
  const find = (id: unknown) => {
    const open = deps.focused();
    return deps.rows().find((r) => r.id === id) ?? deps.threadsAnywhere?.().find((r) => r.id === id) ?? (open && open.id === id ? open : null);
  };
  const gone = () => refused('No thread with that id. Call get_screen for the current ids.');
  // The one pick Neo has asked a yes for, by thread, number and words. A yes
  // counts for that and nothing else.
  let asked: { id: string; n: number; words: string } | null = null;
  let askedCommand: string | null = null;
  // The latest message's pictures go up by themselves as Neo briefs her: one
  // lifted, two to four side by side.
  const showLatest = async () => {
    if (!deps.show || !deps.latestPictureCount) return '';
    await deps.waitForPictures?.();
    const n = Math.min(deps.latestPictureCount(), 4);
    if (!n) return '';
    const ns = Array.from({ length: n }, (_, i) => i + 1);
    if (!(await deps.show(ns, n === 1 ? 'lifted' : 'side_by_side'))) return '';
    const names = (deps.pictureNames?.() ?? []).slice(0, n);
    return ` On screen now: ${n === 1 ? 'its picture' : `its ${n} pictures side by side, numbered ${ns.join(', ')}`} (${names.join(', ')}). Refer to them by number as you brief.`;
  };
  // What Neo needs to brief her on a thread it just opened.
  const brief = (row: R) => {
    const s = spoken(deps.summary(row));
    const opts = deps.options(row);
    return `${s ? ` Latest from the agent: ${clip(s, SUMMARY_CHARS)}` : ''}${opts.length ? ` Options: ${opts.map((o) => `${o.n}. ${o.text}`).join(' ')}` : ' No options to pick.'}`;
  };

  return async function act(name: string, args: Record<string, any>, ctx: { heard?: string } = {}): Promise<NeoResult> {
    try {
      // A picture Neo put up comes down when the thread changes under it.
      if (CHANGES_THREAD.has(name)) await deps.show?.([], 'close');
      switch (name) {
        case 'describe_screen':
        case 'get_screen':
          return done(describeScreen(deps));

        case 'open_thread': {
          const row = find(args.id);
          if (!row) return gone();
          await deps.open(row);
          deps.glow(row.id);
          return done(`Opened ${nameOf(row)}.${brief(row)}${await showLatest()}`);
        }

        case 'next_thread': {
          const list = deps.rows();
          const open = deps.focused();
          const at = open ? list.findIndex((r) => r.id === open.id) : -1;
          const next = list[at + 1];
          if (!next) return refused(list.length ? 'That was the last one.' : 'Nothing is waiting.');
          await deps.open(next);
          deps.glow(next.id);
          return done(`Opened ${nameOf(next)}.${brief(next)}${await showLatest()}`);
        }

        case 'pick_option': {
          const row = find(args.id);
          if (!row) return gone();
          const option = deps.options(row).find((o) => o.n === args.n);
          if (!option) return refused(`That thread has no option ${args.n}.`);
          const words = option.text.replace(/\s*\(recommended\)\s*$/i, '').trim();
          if (needsYes(words)) {
            const yes = namesOption(ctx.heard, { n: option.n, text: words })
              || (args.confirmed === true && asked?.id === row.id && asked.n === option.n && asked.words === words);
            asked = null;
            if (!yes) {
              asked = { id: row.id, n: option.n, words };
              deps.glow(row.id);
              return { ok: false, status: 'needs_yes', said: `Option ${option.n} is "${words}". Ask the person to say yes before picking it.` };
            }
          }
          const picked = await deps.pick(row, option.n);
          deps.glow(row.id);
          if (picked === 'asked') return refused(ASKED);
          return done(`Picked option ${option.n}: ${words}.`);
        }

        case 'reply': {
          const row = find(args.id);
          if (!row) return gone();
          const text = String(args.text ?? '').trim();
          if (!text) return refused('There was nothing to send.');
          const how = await deps.reply(row, text, { attach: args.attach === true });
          deps.glow(row.id);
          if (how === 'no-pictures') return done('Sent the words. There was no picture in the reply box to send with them.');
          return done(how === 'with-pictures' ? 'Sent, with the pictures from the reply box.' : 'Sent.');
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

        case 'media': {
          const n = Number.isInteger(args.n) ? args.n : 1;
          const got = deps.media ? await deps.media(args.action === 'pause' ? 'pause' : 'play', n) : null;
          if (!got) return refused('There is no film or sound in the open thread, so nothing to play.');
          return done(args.action === 'pause' ? `Paused ${got.name}.` : `Playing ${got.name}.`);
        }

        case 'find_commands': {
          const found = findCommands(String(args.query ?? ''), deps.commands?.() ?? []);
          if (!found.length) return refused(`Nothing in the command menu matches "${args.query}".`);
          return done(found.map((c) => `[${c.id}] ${c.label}${c.hint ? ` (${c.hint})` : ''}`).join('\n'));
        }

        case 'run_command': {
          const cmd = (deps.commands?.() ?? []).find((c) => c.id === args.id);
          if (!cmd) return refused('That command is not on offer right now. Search again with find_commands.');
          // ⌘K's Later row only opens the time picker; later does it with her time.
          if (cmd.label === 'Later') return refused('Use later with the minutes or time the person said.');
          // A yes counts for this command, with these words, on this thread:
          // "approve" means the open thread's approve, and that can change.
          const what = `${cmd.id}|${cmd.label}|${deps.focused()?.id ?? ''}`;
          if (RISKY_COMMAND.test(cmd.id)) {
            const verb = cmd.label.toLowerCase().match(/[a-z]+/)?.[0] ?? '';
            const saidIt = verb.length > 2 && saysWord(ctx.heard, verb);
            const yes = saidIt || (args.confirmed === true && askedCommand === what);
            askedCommand = null;
            if (!yes) {
              askedCommand = what;
              return { ok: false, status: 'needs_yes', said: `That would "${cmd.label}". Ask the person to say yes first.` };
            }
          }
          // Closing goes the way close_thread does, which notices the app
          // stopping to ask its own question first.
          const open = deps.focused();
          if (cmd.id === 'done' && open) return (await deps.close(open)) === 'asked' ? refused(ASKED) : done(`Closed ${nameOf(open)}.`);
          await cmd.run();
          return done(`Done: ${cmd.label}.`);
        }

        case 'later': {
          const row = find(args.id);
          if (!row) return gone();
          const now = deps.now?.() ?? Date.now();
          const ts = Number.isInteger(args.minutes) ? now + args.minutes * 60_000 : typeof args.at === 'string' ? Date.parse(args.at) : NaN;
          if (!Number.isFinite(ts)) return refused('Say how long or until when.');
          if (ts <= now) return refused('That time has already passed.');
          if (!deps.later) return refused('Putting threads off is not available here.');
          const label = Number.isInteger(args.minutes) ? `in ${args.minutes} minute${args.minutes === 1 ? '' : 's'}` : `at ${new Date(ts).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}`;
          await deps.later(row, ts, label);
          return done(`Moved ${nameOf(row)} to Later. It comes back ${label}.`);
        }

        case 'scroll':
          return deps.scroll?.(args.where) ? done('Scrolled.') : refused('There is nothing there to scroll.');

        case 'show': {
          if (args.layout === 'close') { await deps.show?.([], 'close'); return done('Put away.'); }
          const have = deps.pictureNames?.() ?? [];
          const want: number[] = Array.isArray(args.pictures) && args.pictures.length ? args.pictures : [1];
          if (!have.length) return refused('The open thread has no pictures to show.');
          if (want.some((n) => n > have.length)) return refused(`The open thread has ${have.length} picture${have.length === 1 ? '' : 's'}.`);
          const shown = await deps.show?.(want, args.layout);
          return shown ? done(`Showing ${want.map((n) => have[n - 1]).join(' and ')}.`) : refused('Those pictures could not be shown.');
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
