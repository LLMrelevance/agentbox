// Teammates in the main process: the files, the tick that carries out
// `planWakes`, and the brief a teammate's run is given. The decisions are in
// shared/teammates.mjs; this only reads, writes and starts.
import {
  planWakes, teammateLabel, FROM_LABEL_PREFIX, HOP_LABEL_PREFIX, hopOf, teammateIdOf, YOU, mentionsIn,
  letterFor, statusOf, runLines, STARTERS, CHAT_TAIL, isWorks, DEFAULT_LIMIT, MAX_HOPS,
} from '../shared/teammates.mjs';
import { ruleLabel, periodKey } from '../shared/repeats.mjs';
import {
  teamDir, readTeammates, readChat, writeTeammate, writeChat, newTeammateId, newMemoryId,
} from './store/teammates-files.mjs';

const CHAT_FOR_SCREEN = 400;

export class Teammates {
  constructor(store) {
    this.store = store;
  }

  dir() {
    return teamDir(this.store.config.storeRoot, this.store.config.accountId);
  }

  list(now = Date.now()) {
    return readTeammates(this.dir(), now);
  }

  get(id, now = Date.now()) {
    return this.list(now).find((t) => t.id === id) ?? null;
  }

  chat() {
    return readChat(this.dir());
  }

  // A product a teammate can work in: the one asked for when it exists, else
  // the first real project.
  _product(slug) {
    const products = this.store.listProducts().filter((p) => !p.practice && !p.personal);
    // Unnamed, the first with code in it: most of what a teammate does is code.
    return products.find((p) => p.slug === slug)?.slug ?? products.find((p) => p.repoPath)?.slug ?? products[0]?.slug ?? null;
  }

  create(fields = {}, now = Date.now()) {
    const starter = fields.starter ? STARTERS.find((s) => s.starter === fields.starter) : null;
    const base = { ...(starter ?? {}), ...fields };
    const product = this._product(base.product);
    if (!product) throw new Error('Make a project first. A teammate works in one of your projects.');
    const team = this.list(now);
    const name = String(base.name ?? '').trim() || 'New teammate';
    const id = newTeammateId();
    const patch = {
      name,
      letter: base.letter || letterFor(name, team),
      role: base.role ?? null,
      job: base.job ?? null,
      goal: base.goal ?? null,
      counted: base.counted ?? null,
      asksFirst: base.asksFirst ?? null,
      works: isWorks(base.works) ? base.works : null,
      product,
      engine: base.engine ?? null,
      model: base.model ?? null,
      effort: base.effort ?? null,
      limit: Number.isInteger(base.limit) ? base.limit : DEFAULT_LIMIT,
      status: base.status === 'draft' ? 'draft' : 'active',
      starter: starter?.starter ?? null,
      createdAt: now,
      paused: false,
    };
    // Its first round is the next one, not one already past today.
    if (patch.works) patch.served = periodKey(patch.works, now) ?? '';
    writeTeammate(this.dir(), id, patch, now);
    return this.get(id, now);
  }

  // Someone new, from words: a draft that sets itself up by asking you in the
  // team chat. Its first run is the setup.
  describe({ text, product, engine } = {}, now = Date.now()) {
    const words = String(text ?? '').trim();
    if (!words) throw new Error('Say what you need them to do.');
    const t = this.create({ name: 'New teammate', status: 'draft', job: words, product, engine }, now);
    const m = writeChat(this.dir(), { kind: 'msg', from: YOU, to: [t.id], text: words, setup: true }, now);
    return { teammate: this.get(t.id, now), message: m.id };
  }

  start(id, now = Date.now()) {
    const t = this.get(id, now);
    if (!t) throw new Error('No such teammate.');
    if (t.status !== 'active') writeTeammate(this.dir(), id, { status: 'active' }, now);
    writeChat(this.dir(), { kind: 'act', from: id, verb: 'started' }, now);
    writeChat(this.dir(), { kind: 'msg', from: YOU, to: [id], text: 'You have just been started. Introduce yourself in one or two sentences, say what you will do first, then begin.', start: true }, now);
    return this.get(id, now);
  }

  update(id, patch = {}, now = Date.now()) {
    const t = this.get(id, now);
    if (!t) throw new Error('No such teammate.');
    const allowed = ['name', 'role', 'job', 'goal', 'counted', 'asksFirst', 'works', 'product', 'engine', 'model', 'effort', 'limit', 'paused', 'letter'];
    const clean = {};
    for (const k of allowed) if (k in patch) clean[k] = patch[k];
    if ('product' in clean) clean.product = this._product(clean.product);
    if (clean.works && isWorks(clean.works)) clean.served = periodKey(clean.works, now) ?? '';
    if ('paused' in clean && !!clean.paused !== !!t.paused) {
      writeChat(this.dir(), { kind: 'act', from: id, verb: clean.paused ? 'paused' : 'resumed' }, now);
    }
    writeTeammate(this.dir(), id, clean, now);
    return this.get(id, now);
  }

  remove(id, now = Date.now()) {
    writeTeammate(this.dir(), id, { endedAt: now }, now);
    return { ok: true };
  }

  remember(id, text, { from = null, by = null } = {}, now = Date.now()) {
    const words = String(text ?? '').trim();
    if (!words) throw new Error('Nothing to remember.');
    const mem = { id: newMemoryId(), text: words.slice(0, 300), from, at: now, by };
    writeTeammate(this.dir(), id, { remember: mem }, now);
    writeChat(this.dir(), { kind: 'act', from: id, verb: 'learned', text: mem.text, ref: mem.id }, now);
    return mem;
  }

  forget(id, memoryId, now = Date.now()) {
    writeTeammate(this.dir(), id, { forget: memoryId }, now);
    return { ok: true };
  }

  // Your words in the team chat. On a teammate's page they go to that
  // teammate; in the team chat to whoever they name with @.
  post({ text, to = [], options } = {}, now = Date.now()) {
    const words = String(text ?? '').trim();
    if (!words) throw new Error('Nothing to send.');
    const team = this.list(now);
    const ids = new Set([...(Array.isArray(to) ? to : [to]).filter(Boolean), ...mentionsIn(words, team)]);
    const known = [...ids].filter((x) => team.some((t) => t.id === x));
    return writeChat(this.dir(), { kind: 'msg', from: YOU, to: known, text: words.slice(0, 8000), ...(options ? { options } : {}) }, now);
  }

  // What the screen draws: every teammate with what it is doing, and the chat
  // with the lines its runs leave, newest last.
  view(items, now = Date.now()) {
    let team = [];
    let chat = { messages: [] };
    try {
      team = this.list(now);
      chat = this.chat();
    } catch (err) {
      return { list: [], chat: [], runs: [], error: err.message };
    }
    const mine = (items ?? []).filter((i) => teammateIdOf(i));
    return {
      list: team.map((t) => ({ ...t, ...statusOf(t, mine, now), worksLabel: isWorks(t.works) ? ruleLabel(t.works) : null })),
      chat: chat.messages.slice(-CHAT_FOR_SCREEN),
      runs: runLines(mine, team).slice(-CHAT_FOR_SCREEN),
    };
  }

  /* ----------------------------------------------------------------- tick */
  // Carries out what `planWakes` decided. Each action is written so a crash
  // between two of them redoes nothing twice: runs are created if absent under
  // the project lock, and the seen marker comes after the run it records.
  async tick({ items, now = Date.now(), deliver } = {}) {
    let team;
    let chat;
    try {
      team = this.list(now);
      chat = this.chat();
    } catch (err) {
      console.warn(`teammates: could not read: ${err.message}`);
      return [];
    }
    if (!team.length) return [];
    const mine = (items ?? []).filter((i) => teammateIdOf(i));
    const actions = planWakes({ teammates: team, chat, items: mine, now });
    const byId = new Map(team.map((t) => [t.id, t]));
    const done = [];
    const { workItemsDisk, lock } = this.store.modules;
    for (const a of actions) {
      const t = byId.get(a.teammate);
      try {
        if (a.type === 'run') {
          const product = this._product(t.product);
          if (!product) continue;
          const dir = this.store.productDir(product);
          const hop = a.trigger.hop ?? 0;
          const labels = ['founder', teammateLabel(t.id), `${HOP_LABEL_PREFIX}${hop}`];
          if (a.trigger.kind === 'pass' && a.trigger.from && a.trigger.from !== YOU) labels.push(`${FROM_LABEL_PREFIX}${a.trigger.from}`);
          await lock.withProjectLock(dir, async () => {
            const opening = this.openingFor(t, a.trigger, team);
            const made = workItemsDisk.createWorkItemIfAbsent(dir, a.id, {
              title: a.title,
              ...(opening.yours ? {} : { body: opening.body }),
              kind: 'directive',
              priority: 5,
              labels,
              ...(a.start === 'later' ? { start: 'later' } : {}),
              ...(t.engine ? { engine: t.engine } : {}),
              ...(t.model ? { model: t.model } : {}),
              ...(t.effort ? { effort: t.effort } : {}),
            }, { source: 'system', now });
            // Your words go in as yours, the way a task you type does, so the
            // thread opens on them under your name.
            if (made?.created !== false && opening.yours) workItemsDisk.updateWorkItem(dir, a.id, { title: a.title, body: opening.body }, { source: 'founder', now });
          });
        } else if (a.type === 'seen') {
          writeChat(this.dir(), { kind: 'seen', ref: a.msg, for: a.teammate, ...(a.run ? { run: a.run } : {}) }, now);
        } else if (a.type === 'served') {
          writeTeammate(this.dir(), a.teammate, { served: a.key }, now);
        } else if (a.type === 'answer') {
          await deliver?.(a.product, a.item, a.text);
        } else if (a.type === 'release') {
          const dir = this.store.productDir(a.product);
          workItemsDisk.updateWorkItem(dir, a.item, { start: 'now' }, { source: 'system', now });
        } else if (a.type === 'limit') {
          this._sayOnce(a.teammate, 'limit', `${t.name} has used ${t.limit ?? DEFAULT_LIMIT} runs this week and waits until runs free up. Your own messages still reach it.`, now);
        } else if (a.type === 'hops') {
          writeChat(this.dir(), { kind: 'act', from: a.teammate, verb: 'hops', ref: a.msg, text: `${t.name} did not wake for this: teammates had already passed it back and forth ${MAX_HOPS} times without you. Write to ${t.name} to carry on.` }, now);
        }
        done.push(a);
      } catch (err) {
        console.warn(`teammates: ${a.type} for ${a.teammate} failed: ${err.message}`);
      }
    }
    return done;
  }

  _sayOnce(teammateId, verb, text, now) {
    const day = new Date(now).toDateString();
    const already = this.chat().messages.some((m) => m.kind === 'act' && m.from === teammateId && m.verb === verb && new Date(m.ts).toDateString() === day);
    if (!already) writeChat(this.dir(), { kind: 'act', from: teammateId, verb, text }, now);
  }

  /* ---------------------------------------------------------------- brief */
  nameOf(id, team) {
    if (id === YOU) return 'The person';
    return team.find((t) => t.id === id)?.name ?? 'A teammate';
  }

  // Why this run exists, written into the run's own body.
  // What opens the run's thread: your own words when you wrote, and otherwise
  // a plain line saying what woke it. How to answer is in its brief.
  openingFor(t, trigger, team) {
    const who = this.nameOf(trigger.from, team);
    if (trigger.kind === 'schedule') {
      return { body: `Time for your ${isWorks(t.works) ? ruleLabel(t.works) : 'regular'} round.`, yours: false };
    }
    if (trigger.kind === 'pass') {
      return { body: [`${who} passed you this in the team chat.`, '', `## ${trigger.title ?? 'Work passed on'}`, '', trigger.details ?? ''].join('\n').trim(), yours: false };
    }
    const text = String(trigger.text ?? '').trim() || '(no words)';
    if (trigger.from === YOU) return { body: text, yours: true };
    return { body: `${who} wrote to you in the team chat:\n\n> ${text.split('\n').join('\n> ')}`, yours: false };
  }

  // The standing part of a teammate's brief, read fresh at every spawn so its
  // memory and the chat are current even on a reply.
  briefFor(item, now = Date.now()) {
    const id = teammateIdOf(item);
    if (!id) return null;
    let team;
    let chat;
    try {
      team = this.list(now);
      chat = this.chat();
    } catch {
      return null;
    }
    const t = team.find((x) => x.id === id);
    if (!t) return null;
    const items = (() => { try { return this.store.listItems(now).filter((i) => teammateIdOf(i)); } catch { return []; } })();
    const others = team.filter((x) => x.id !== id);
    const tail = chat.messages.filter((m) => m.kind === 'msg' || m.kind === 'pass' || (m.kind === 'act' && m.verb === 'learned')).slice(-CHAT_TAIL);
    const line = (m) => {
      const when = new Date(m.ts).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
      const from = this.nameOf(m.from, team);
      if (m.kind === 'pass') return `[${when}] ${from} passed to ${this.nameOf(m.to, team)}: ${m.title}`;
      if (m.kind === 'act') return `[${when}] ${from} learned: ${m.text}`;
      const to = (m.to ?? []).length ? ` (to ${(m.to).map((x) => this.nameOf(x, team)).join(', ')})` : '';
      return `[${when}] ${from}${to}: ${String(m.text ?? '').replace(/\s+/g, ' ').slice(0, 600)}`;
    };
    const hop = hopOf(item);
    return [
      `# You are ${t.name}${t.role ? `, the ${t.role}` : ''}: a teammate`,
      '',
      `You are one of the person's teammates in {{Name}}: an agent with a standing job that works on its own, talks with the other teammates in one team chat, and reaches the person only when it needs them. This thread is one run of your work, and its opening message is why you are awake.`,
      '',
      t.job ? `Your job: ${t.job}` : null,
      t.goal ? `Your goal: ${t.goal}${t.counted ? ` (counted as: ${t.counted})` : ''}` : null,
      t.asksFirst ? `Ask the person first: ${t.asksFirst}` : null,
      isWorks(t.works) ? `You wake on your own ${ruleLabel(t.works)}.` : 'You wake when someone writes to you or passes you work.',
      '',
      t.memory.length ? '## What you know about the person (follow these)' : null,
      ...t.memory.map((m) => `- ${m.text}`),
      t.memory.length ? '' : null,
      '## The team',
      ...(others.length ? others.map((o) => { const s = statusOf(o, items, now); return `- ${o.name}${o.role ? `, ${o.role}` : ''}${o.paused ? ' (paused)' : ''}: ${o.job ? o.job.slice(0, 200) : 'no job yet'}${s.now ? ` Now: ${s.now}.` : ''}`; }) : ['- You are the only teammate so far.']),
      '',
      '## The team chat, newest last',
      ...(tail.length ? tail.map(line) : ['(nothing yet)']),
      '',
      '## Answering what woke you',
      ...(t.status === 'draft' ? [
        'You are a new teammate, still being set up. The opening message is what the person asked for, and anything they have answered since is in the team chat above. Set yourself up, then stop:',
        '1. Pick a short first name that no teammate has and a plain role (two or three words). Draft your job, goal, how you count the goal, when you work and what you ask the person first. Save all of it with team_setup.',
        '2. If something important is unclear, ask the person, one question per team_post, at most three, each with two or three short answers in `options`. Then finish this run quietly. Their answer wakes you again with the chat in your brief.',
        '3. When nothing is unclear, call team_setup with ready true, post one or two sentences saying what you will do first, and finish quietly.',
      ] : [
        '- If the person wrote to you, the opening is their words from the team chat. Reply to them there with team_post, and do what they ask if it is part of your job.',
        '- If a teammate passed you work, do it if it is in your job, then say in the team chat what you did. If it is not yours to do, say so and whose it is.',
        '- If a teammate wrote to you, reply in the team chat. Start with @Name only if they need to act on it.',
        '- If it is your round, do your job for today, as above.',
      ]),
      '',
      '## How a teammate works',
      '- Talk with team_post: short and plain, one to three sentences. Post when you start something worth knowing, when you finish, and when you hand something on. Naming someone with @Name wakes them, so do that only when they need to act.',
      '- Hand work to a teammate whose job it is with team_pass (to, title, details). They get it as a run of their own. Do not do another teammate\'s job.',
      '- When the person states a standing preference ("from now on", "always", "never", "I prefer"), keep it with team_remember in a few words, in their terms.',
      '- Reach the person only when you need them: a decision, a yes before anything that leaves (sends, posts, ships, merges, pays), or a sign-in only they have. Then end this run with your question as your answer: bold first line, numbered options, your recommendation first. It reaches their inbox. Leave this item open.',
      `- When nothing needs them, post a one-line summary to the team chat, then close this run yourself: update_work_item with status done and labels ["founder", "${teammateLabel(t.id)}", "${HOP_LABEL_PREFIX}${hop}", "clean"] in one call. This run is your own work, not the person's ask, so closing it needs no quote from them.`,
      '- Never wait or poll for a teammate. Say what you are waiting for in the chat and finish; their reply wakes you.',
    ].filter((x) => x !== null).join('\n');
  }
}

export { STARTERS };
