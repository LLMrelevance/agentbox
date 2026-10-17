// Everything the person can do right now, as one list for the Decisions API
// to pick from (plans/neo-decisions.md). Every option is an action and its
// target, written here and never by a model, so picking the option is picking
// the thread. Values carry no ids a model could invent: they map back to
// `act` through the same frozen list.
//
// Thread text only ever appears quoted and cut short, as data inside an
// app-written sentence; the app still checks every pick before acting.
import crypto from 'node:crypto';

// The API takes at most 255 choices per question.
export const MAX_OPTIONS = 250;
const QUOTE = 70;

const q = (s) => {
  const t = String(s ?? '').replace(/\b[wr]-[0-9a-f]{6,}(?:-\d+)?\b/gi, 'another thread').replace(/\s+/g, ' ').replace(/"/g, "'").trim();
  return `"${t.length > QUOTE ? `${t.slice(0, QUOTE - 1)}…` : t}"`;
};

/**
 * `screen`: { open: { id, title, options:[{n,text}], pictures:[{n,name}], films:[{n,name,earlier?}], files:[{n,name}] } | null,
 *             rows: [{ id, title }] (top first), commands: [{ id, label, hint? }], canGoBack }
 * Returns { version, list: [{ value, description, act }] }.
 */
export function buildOptions(screen) {
  const list = [];
  const add = (value, description, act) => list.push({ value, description, act });
  const open = screen.open;

  if (open) {
    const t = q(open.title);
    add(`open:${open.id}`, `Open or stay on the currently open thread ${t}, and remind the person what it needs`, { kind: 'open', id: open.id });
    add('reply', `Send a message the person dictates to the agent on the open thread ${t} ("tell it…", "reply saying…", feedback to post, feedback about Neo or JARVIS to pass on); only words meant for the agent`, { kind: 'reply', id: open.id });
    for (const o of open.options ?? []) add(`pick:${o.n}`, `Choose option ${o.n} on the open thread: ${q(o.text)}. Choose this when the person says its number OR asks to do what this option says, including a shorter wording of that action.`, { kind: 'pick', id: open.id, n: o.n });
    add('later', `Put the open thread ${t} off until later (snooze it for a while)`, { kind: 'later', id: open.id });
    add('close', `Close the open thread ${t}`, { kind: 'close', id: open.id });
    add('summary', `Say what the open thread ${t} is about, what the agent said and what it needs ("what this task is about", "remind me", "summarize it")`, { kind: 'summary', id: open.id });
    add('ask', `Answer a question about the open thread ${t} (why, what, how)`, { kind: 'ask', id: open.id });
    const pics = open.pictures ?? [];
    for (const p of pics) add(`show:${p.n}`, `Show picture ${p.n} of the open thread (${q(p.name)}) full screen, big${p.n === 1 ? ' ("the picture" means this one)' : ''}`, { kind: 'show', id: open.id, pictures: [p.n] });
    if (pics.length > 1) add('compare', 'Show several of the open thread\'s pictures side by side to compare', { kind: 'compare', id: open.id });
    if (pics.length) add('hide', 'Put away pictures Neo is showing ("close the picture", "hide it")', { kind: 'hide' });
    const films = open.films ?? [];
    for (const f of films) {
      const where = f.earlier ? 'earlier in the thread' : `in the latest message${f === films[0] ? ' ("the video" means this one)' : ''}`;
      add(`play:${f.n}`, `Play film or sound number ${f.n}, ${q(f.name)}, ${where}`, { kind: 'media', id: open.id, n: f.n, action: 'play' });
    }
    for (const f of open.files ?? []) {
      add(`file:${f.n}`, `Open ${q(f.name)}, a file in the latest message of the open thread, beside it${f.n === 1 ? ' ("the design" or "the page" means this one)' : ''}`, { kind: 'file', id: open.id, n: f.n });
    }
    if ((open.films ?? []).length) add('pause', 'Pause the film or sound that is playing', { kind: 'media', id: open.id, action: 'pause' });
  }

  add('next', 'Open the next thread that needs the person ("next", "start on my work", "from the top")', { kind: 'next' });
  if (screen.canGoBack) add('back', 'Go back to a previously visited thread, one or more steps back ("back two threads", "two earlier")', { kind: 'back' });
  add('inbox', 'Say which threads need the person', { kind: 'inbox' });
  for (const [where, words] of [['up', 'up by one page'], ['down', 'down by one page'], ['top', 'all the way to the beginning'], ['bottom', 'all the way to the end']]) {
    add(`scroll:${where}`, `Scroll ${words} in what the person is reading${where === 'up' || where === 'down' ? ` ("scroll ${where}")` : ''}`, { kind: 'scroll', where });
  }
  add('new', 'Start a new thread with new work the person describes', { kind: 'new' });
  for (const p of screen.projects ?? []) {
    add(`new:${p.slug}`, `Start a new thread in project ${q(p.name)} with new work the person describes`, { kind: 'new', project: p.slug });
  }
  add('undo', 'Undo the last thing done', { kind: 'undo' });
  add('signoff', 'End the conversation with Neo when the person is finished: goodbye, that is all, thanks Neo, stop listening, or go to sleep', { kind: 'signoff' });
  add('talk', 'The person is talking to Neo about Neo itself: correcting it, complaining about what it just did, explaining a mistake. This is not words for the agent. Feedback the person asks Neo to give, send or pass on is a reply, not this', { kind: 'talk' });
  add('none', 'Do nothing: a greeting, filler, thinking aloud, holding off ("not yet", "wait", "don\'t"), or talk not asking for anything', { kind: 'none' });

  for (const c of screen.commands ?? []) {
    // ⌘K's "Reply" opens the box; named plainly, so "open the reply field" finds it.
    if (c.id === 'reply') { add('cmd:reply', 'Open the reply box, for the person to type, paste or dictate into ("open the reply field", "let me write back")', { kind: 'command', id: c.id }); continue; }
    add(`cmd:${c.id}`, `Menu command: ${q(c.label)}${c.hint ? ` (${c.hint.slice(0, 60)})` : ''}`, { kind: 'command', id: c.id });
  }

  // Threads last, so a long inbox is what gets cut, top threads kept.
  const room = MAX_OPTIONS - list.length;
  for (const r of (screen.rows ?? []).filter((r) => r.id !== open?.id).slice(0, Math.max(0, room))) {
    add(`open:${r.id}`, `Open the thread ${q(r.title)}`, { kind: 'open', id: r.id });
  }

  const version = crypto.createHash('sha1').update(JSON.stringify(list.map((o) => [o.value, o.description]))).digest('hex').slice(0, 12);
  return { version, list };
}
