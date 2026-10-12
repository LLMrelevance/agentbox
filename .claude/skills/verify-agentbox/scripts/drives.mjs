// THE DRIVES: one per feature in ../features/, each a user's path through the
// real browser copy that live.mjs started. A drive presses what a person
// presses, then checks what a person would see AND what the app wrote to disk,
// because a screen that says "sent" over a store that holds nothing is the
// failure verification exists to catch.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const { foldWorkItems } = await import(path.join(REPO, 'shared/work-items.mjs'));

/**
 * The project's own folder of machinery: `<store>/projects/<the project's
 * folder, every non-alphanumeric character as "-">` (main/store/home.mjs). The
 * ledger lives there, not beside project.json.
 */
export function machinery(state, slug = 'sandbox') {
  return path.join(state.storeRoot, 'projects', path.join(state.accountRoot, slug).replace(/[^A-Za-z0-9]/g, '-'));
}
export function readLedger(state, slug = 'sandbox') {
  const file = path.join(machinery(state, slug), 'work-items.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
/** Every row in the sandbox project, folded the way the app folds them. */
export function rows(state, slug = 'sandbox') {
  return [...foldWorkItems(readLedger(state, slug)).values()];
}
export function sessionLogs(state, id, slug = 'sandbox') {
  try { return fs.readdirSync(path.join(machinery(state, slug), 'sessions', id)); } catch { return []; }
}
export function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
/** Poll a fact on disk; the fact, or null when it never came. */
export async function until(fn, ms) {
  const deadline = Date.now() + ms;
  for (;;) {
    const got = fn();
    if (got) return got;
    if (Date.now() > deadline) return null;
    await new Promise((r) => setTimeout(r, 200));
  }
}

const WORD = 'PINEAPPLE';

/**
 * OPEN A THREAD THE WAY A PERSON FINDS IT: the All tab, so it is there whichever
 * list it has moved to (a real worker sets its own status and the row leaves
 * In progress), then its row by the name the list shows, which is the label an
 * agent gave it when it gave one, else the title. Matched on the start of the
 * name, because a long one is cut short on screen.
 */
async function openThread(tab, row) {
  await tab.evaluate(`[...document.querySelectorAll('*')].find((e) => e.children.length === 0 && /^all$/i.test(e.textContent.trim()))?.click()`);
  await tab.wait(400);
  const names = [row.label, row.title].filter(Boolean).map((n) => String(n).slice(0, 24));
  const clicked = await tab.until(`(() => {
    const names = ${JSON.stringify(names)};
    const hit = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && names.some((n) => e.textContent.trim().startsWith(n)));
    if (hit) hit.click();
    return !!hit;
  })()`, { ms: 8000, why: 'the thread to be in the All list' }).catch(() => false);
  await tab.wait(800);
  return clicked;
}

export const DRIVES = {
  'inbox-opens': {
    what: 'the inbox draws on an empty store: no sign-in wall, no first-run walk, the empty state and its way forward',
    async run({ tab, claim, capture }) {
      await tab.until(`document.body.innerText.includes('Threads')`, { why: 'the inbox to draw' });
      await tab.wait(800);
      await capture('inbox');
      const text = await tab.text();
      claim(!/Wrong or missing token/.test(text), 'the tab got past the token check');
      claim(!/Sign in to/.test(text), 'no sign-in wall (the copy runs as the single-person app)');
      claim(/Nothing needs you/.test(text) && /New thread/.test(text), 'the empty inbox says so and offers a new thread', text.replace(/\s+/g, ' ').slice(0, 120));
    },
  },
  'new-thread': {
    what: 'N, type a task, ⌘↵: the thread is filed, a worker is started on it, and its answer shows in the thread',
    async run({ tab, state, claim, capture }) {
      // With real Claude Code the task is one a model answers in a single turn
      // and the reply drive can check it remembers; with the stand-in, any title.
      const title = state.engine === 'stub'
        ? `Verify ${Date.now().toString(36)}: say hello`
        : `Verify ${Date.now().toString(36)}: reply with exactly the word ${WORD} and nothing else. Do not use any tools.`;
      await tab.until(`document.body.innerText.includes('Threads')`, { why: 'the inbox to draw' });
      await tab.press('n');
      const focused = await tab.until(`document.activeElement?.matches('textarea') && document.activeElement.placeholder`, { why: 'N to open the composer with the cursor in it' });
      claim(true, 'N opens the composer with the cursor in it', focused);
      await tab.type(title);
      await capture('composer');
      await tab.press('Enter', ['meta']);
      await tab.until(`document.body.innerText.includes(${JSON.stringify(title)})`, { why: 'the new thread to appear in the list' });
      await capture('sent');

      const row = await until(() => rows(state).find((r) => r.title === title), 10_000);
      claim(row, 'the store holds the thread', row?.id);
      if (!row) return;
      // The stand-in leaves a receipt; real Claude Code leaves only the session log.
      const receipt = state.engine === 'stub' ? await until(() => readJson(path.join(state.receipts, `${row.id}.json`)), 30_000) : null;
      const logs = await until(() => sessionLogs(state, row.id).length, 30_000);
      claim(state.engine === 'stub' ? receipt : logs, 'a worker was started on it', receipt ? `cwd ${path.basename(receipt.cwd)}` : `${logs ?? 0} session log(s)`);
      if (receipt) {
        const leaked = Object.keys(receipt.env).filter((k) => /^(ANTHROPIC_|OPENAI_)/.test(k) || k === 'CLAUDE_CODE_USE_BEDROCK');
        claim(!leaked.length, 'the worker was handed no API key (it bills the subscription)', leaked.join(', '));
        claim(receipt.cwd !== state.repo && receipt.cwd.includes(row.id), 'the worker runs in a folder of its own, not the project checkout', receipt.cwd.replace(state.instance, '…'));
        claim(receipt.env.ZERO_ITEM === row.id, 'the worker is told which thread it is on', receipt.env.ZERO_ITEM);
      }
      const answered = await until(() => rows(state).find((r) => r.id === row.id && String(r.result ?? '').trim()), state.engine === 'stub' ? 30_000 : 300_000);
      claim(answered, 'the worker\'s answer is written onto the thread', String(answered?.result ?? '').slice(0, 80));

      // Open it the way a person does: the list row, then read what they read.
      claim(await openThread(tab, rows(state).find((r) => r.id === row.id) ?? row), 'the thread opens from the list');
      if (answered) {
        const shown = await tab.until(`document.body.innerText.includes(${JSON.stringify(String(answered.result).trim().split('\n')[0].slice(0, 40))})`, { why: 'the answer to show in the open thread', ms: 15_000 }).catch(() => false);
        claim(shown, 'the open thread shows the answer');
      }
      const opened = await tab.evaluate(`/You opened this/.test(document.body.innerText) ? 'You opened this' : /An agent opened this/.test(document.body.innerText) ? 'An agent opened this' : null`);
      claim(opened === 'You opened this', 'the thread says you opened it', opened ?? 'neither line on screen', { known: 'w-f73f5e8e15' });
      await tab.wait(600);
      await capture('thread');
    },
  },
  'reply': {
    what: 'open an answered thread, R, type a reply, ⌘↵: the reply is stored, a worker takes it and its answer lands (with --real-claude, it also remembers the first turn)',
    async run({ tab, state, claim, capture }) {
      const done = rows(state).filter((r) => String(r.result ?? '').trim()).sort((a, b) => b.updatedAt - a.updatedAt)[0];
      if (!claim(done, 'there is an answered thread to reply to (run the new-thread drive first)')) return;
      const before = sessionLogs(state, done.id).length;
      await tab.until(`document.body.innerText.includes('Threads')`);
      claim(await openThread(tab, done), 'the thread opens from the list');
      await tab.press('r');
      const focused = await tab.until(`document.activeElement?.matches('textarea, [contenteditable="true"]')`, { why: 'R to put the cursor in the reply box', ms: 8000 }).catch(() => false);
      claim(focused, 'R puts the cursor in the reply box');
      const stamp = Date.now().toString(36);
      const reply = state.engine === 'stub'
        ? `And once more, ${stamp}`
        : `Which word did you just reply with? Answer with only that word. Do not use any tools. (${stamp})`;
      await tab.type(reply);
      await capture('reply-typed');
      const sentAt = Date.now();
      await tab.press('Enter', ['meta']);
      const heard = await until(() => readLedger(state).some((l) => l.id === done.id && JSON.stringify(l).includes(stamp)), 10_000);
      claim(heard, 'the reply is written to the thread in the store');
      const started = await until(() => sessionLogs(state, done.id).length > before, 30_000);
      claim(started, 'a worker session is started for the reply', `${before} → ${sessionLogs(state, done.id).length} session logs`);
      const answered = await until(() => {
        const r = rows(state).find((x) => x.id === done.id);
        return (r?.wrote?.result?.ts ?? 0) > sentAt && String(r.result ?? '').trim() ? r : null;
      }, state.engine === 'stub' ? 30_000 : 300_000);
      claim(answered, 'the answer to the reply is written onto the thread', String(answered?.result ?? '').slice(0, 80));
      // MEMORY, PROVED BY BEHAVIOUR. The stand-in leaves no Claude Code
      // transcript, so the app (rightly) cannot resume it and re-briefs instead;
      // only a real session can show the thread's context carried over.
      if (state.engine !== 'stub' && answered) claim(String(answered.result).includes(WORD), `the answer remembers the first turn (${WORD})`, String(answered.result).slice(0, 60));
      await tab.wait(800);
      await capture('after-reply');
    },
  },
};
