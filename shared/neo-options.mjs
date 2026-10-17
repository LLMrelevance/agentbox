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
  const t = String(s ?? '').replace(/\s+/g, ' ').replace(/"/g, "'").trim();
  return `"${t.length > QUOTE ? `${t.slice(0, QUOTE - 1)}…` : t}"`;
};

/**
 * `screen`: { open: { id, title, options:[{n,text}], pictures:[{n,name}], films:[{n,name}], files:[{n,name}] } | null,
 *             rows: [{ id, title }] (top first), commands: [{ id, label, hint? }], canGoBack }
 * Returns { version, list: [{ value, description, act }] }.
 */
export function buildOptions(screen) {
  const list = [];
  const add = (value, description, act) => list.push({ value, description, act });
  const open = screen.open;

  if (open) {
    const t = q(open.title);
    add('reply', `Send a message the person dictates to the agent on the open thread ${t} ("tell it…", "reply saying…", feedback to post)`, { kind: 'reply', id: open.id });
    for (const o of open.options ?? []) add(`pick:${o.n}`, `Choose option ${o.n} on the open thread: ${q(o.text)} ("option ${o.n}", or saying what it does)`, { kind: 'pick', id: open.id, n: o.n });
    add('later', `Put the open thread ${t} off until later (snooze it for a while)`, { kind: 'later', id: open.id });
    add('close', `Close the open thread ${t}`, { kind: 'close', id: open.id });
    add('summary', `Say what the agent on the open thread ${t} said and what it needs`, { kind: 'summary', id: open.id });
    add('ask', `Answer a question about the open thread ${t} (why, what, how; "what is this again", "what's it asking", "remind me")`, { kind: 'ask', id: open.id });
    const pics = open.pictures ?? [];
    for (const p of pics) add(`show:${p.n}`, `Show picture ${p.n} of the open thread (${q(p.name)}) full screen, big${p.n === 1 ? ' ("the picture" means this one)' : ''}`, { kind: 'show', id: open.id, pictures: [p.n] });
    if (pics.length > 1) add('compare', 'Show several of the open thread\'s pictures at once, side by side ("show me the images", "show them", "show me those", "all of them", "compare 1 and 3") — anything plural means this, not one picture', { kind: 'compare', id: open.id });
    if (pics.length) add('hide', 'Put away pictures Neo is showing ("close the picture", "hide it")', { kind: 'hide' });
    for (const f of open.films ?? []) {
      add(`play:${f.n}`, `Play ${q(f.name)} in the open thread`, { kind: 'media', id: open.id, n: f.n, action: 'play' });
    }
    for (const f of open.files ?? []) {
      add(`file:${f.n}`, `Open ${q(f.name)}, a file in the latest message of the open thread, beside it${f.n === 1 ? ' ("the design" or "the page" means this one)' : ''}`, { kind: 'file', id: open.id, n: f.n });
    }
    if ((open.films ?? []).length) add('pause', 'Pause the film or sound that is playing', { kind: 'media', id: open.id, action: 'pause' });
  }

  add('next', 'Open the next thread that needs the person ("next", "move on", "we\'re on the next one", "skip this", "keep going")', { kind: 'next' });
  // Always offered, even with nowhere to go. Left off the list, her "I asked
  // you to go back to the previous task" matched nothing and came back as
  // do-nothing, so Neo said nothing at all and she asked if it was stuck.
  add('back', `Go back to the thread the person was on before ("go back", "back one", "you moved us on", "we were on the one before")${screen.canGoBack ? '' : ' — there is nowhere to go back to right now, so this tells them so'}`, { kind: 'back' });
  add('inbox', 'Say which threads need the person ("what needs me", "what\'s next", "does anything need me", "start at the top")', { kind: 'inbox' });
  for (const [where, words] of [['up', 'up'], ['down', 'down'], ['top', 'to the top'], ['bottom', 'to the bottom']]) {
    add(`scroll:${where}`, `Scroll ${words} in what the person is reading`, { kind: 'scroll', where });
  }
  add('new', 'Start a new thread with new work the person describes', { kind: 'new' });
  add('undo', 'Undo the last thing done', { kind: 'undo' });
  add('signoff', 'End the conversation with Neo', { kind: 'signoff' });
  // This one used to end with "or talk not asking for anything", which is a
  // description of almost any sentence. Live on 2026-10-17 it took "full
  // screen Agentbox and start processing my work" (0.12), "go into the task
  // JARVIS for Agentbox" (0.83) and "move on" (0.69), and Neo did nothing.
  add('none', 'Do nothing. Only a greeting ("hi", "how\'s it going"), filler ("um", "okay", "cool"), thinking aloud to themselves, holding off ("not yet", "wait", "don\'t", "stay silent"), or talk aimed at someone else. A short sentence asking for something is never this, however few words it uses: pick the action it asks for.', { kind: 'none' });

  for (const c of screen.commands ?? []) {
    add(`cmd:${c.id}`, `Menu command: ${q(c.label)}${c.hint ? ` (${c.hint.slice(0, 60)})` : ''}`, { kind: 'command', id: c.id });
  }

  // Threads last, so a long inbox is what gets cut, top threads kept.
  const room = MAX_OPTIONS - list.length;
  for (const r of (screen.rows ?? []).filter((r) => r.id !== open?.id).slice(0, Math.max(0, room))) {
    add(`open:${r.id}`, `Open the thread ${q(r.title)} ("open it", "jump into it")`, { kind: 'open', id: r.id });
  }

  const version = crypto.createHash('sha1').update(JSON.stringify(list.map((o) => [o.value, o.description]))).digest('hex').slice(0, 12);
  return { version, list };
}
