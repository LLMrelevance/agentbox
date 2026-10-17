// One request, the Decisions way (plans/neo-decisions.md): list what is on
// screen, let the Decisions API pick, do it through the app's own checked
// actions (renderer/src/neo/bridge.ts, reached with `askMain`), and return
// what the voice should say. The pick chooses the action and its thread; the
// details come from her words (shared/neo-params.mjs).
import { buildOptions } from '../../shared/neo-options.mjs';
import { laterFrom, picturesFrom, replyFrom } from '../../shared/neo-params.mjs';
import { decide } from './decide.mjs';

// Under this, Neo asks which she meant rather than act. Set from the hard
// bench (scripts/neo-decide-bench.mjs): its misses all came in under 0.3.
export const UNSURE = 0.4;

const NEW_LEAD = /^(?:please\s+)?(?:start|create|make|open|kick off|spin up)\s+(?:a\s+|an\s+)?(?:new\s+)?(?:task|thread)\s*(?:to|for|about|:)?\s*/i;

function inputFor(screen, heard) {
  const open = screen.open;
  const where = open
    ? `Screen: the open thread is "${String(open.title).slice(0, 70)}" (${(open.options ?? []).length} numbered options, ${(open.pictures ?? []).length} pictures).`
    : 'Screen: no thread is open.';
  return `${where} ${(screen.rows ?? []).length} threads are listed.\nThe person just said: "${String(heard).slice(0, 600)}"`;
}

/**
 * `state` lives for the session: `pending` holds an action waiting on her yes.
 * Returns { say, choice?, confidence?, ms? }.
 */
export async function runDecision({ heard, askMain, state, decideImpl = decide, now = Date.now, answer }) {
  const got = await askMain('neo_screen');
  if (!got?.ok || !got.screen) return { say: 'Tell the person the app did not answer just now.' };
  const screen = got.screen;
  const { list } = buildOptions(screen);
  if (state.pending) {
    list.unshift(
      { value: 'yes', description: `The person says yes, go ahead, to: ${state.pending.about}`, act: { kind: 'yes' } },
      { value: 'no', description: `The person says no, or not that, to: ${state.pending.about}`, act: { kind: 'no' } },
    );
  }
  const r = await decideImpl({ input: inputFor(screen, heard), options: list });
  const picked = list.find((o) => o.value === r.choice);
  const meta = { choice: r.choice, confidence: r.confidence, ms: r.ms };
  if (!picked) return { say: 'Tell the person you did not catch that.', ...meta };

  if (picked.act.kind !== 'none' && r.confidence != null && r.confidence < UNSURE) {
    const other = list.find((o) => o.value === r.runnersUp?.[0]?.value && o.value !== 'none');
    return { say: `Not sure what the person meant. Ask, in a few words: ${picked.description}${other ? `, or ${other.description}` : ''}?`, ...meta };
  }

  const run = async (name, args = {}) => {
    const res = await askMain(name, args, heard);
    if (res?.status === 'needs_yes') {
      state.pending = { name, args, about: picked.description };
      return res.said;
    }
    return res?.said ?? (res?.ok ? 'Done.' : 'That did not work.');
  };
  const relay = (said) => ({ say: said, ...meta });
  const open = screen.open;
  const a = picked.act;

  switch (a.kind) {
    case 'none': return { say: '', ...meta };
    case 'yes': {
      const p = state.pending;
      state.pending = null;
      if (!p) return { say: '', ...meta };
      return relay(await run(p.name, { ...p.args, confirmed: true }));
    }
    case 'no':
      state.pending = null;
      return relay('Okay, left it as it is.');
    case 'reply': {
      const { text, attach } = replyFrom(heard);
      return relay(await run('reply', { id: a.id, text, attach }));
    }
    case 'pick': return relay(await run('pick_option', { id: a.id, n: a.n }));
    case 'later': {
      const when = laterFrom(heard, now());
      if (!when) return relay('Ask the person how long to put it off for.');
      return relay(await run('later', { id: a.id, minutes: Math.max(1, Math.round((when.ts - now()) / 60_000)) }));
    }
    case 'close': return relay(await run('close_thread', { id: a.id }));
    case 'open': return relay(await run('open_thread', { id: a.id }));
    case 'next': return relay(await run('next_thread'));
    case 'back': return relay(await run('go_back'));
    case 'scroll': return relay(await run('scroll', { where: a.where }));
    case 'show': return relay(await run('show', { pictures: a.pictures, layout: 'full_screen' }));
    case 'compare': return relay(await run('show', { pictures: picturesFrom(heard, (open?.pictures ?? []).length), layout: 'side_by_side' }));
    case 'hide': return relay(await run('show', { layout: 'close' }));
    case 'media': return relay(await run('media', { action: a.action, ...(a.n ? { n: a.n } : {}) }));
    case 'command': return relay(await run('run_command', { id: a.id }));
    case 'undo': return relay(await run('undo'));
    case 'new': {
      const text = String(heard).trim().replace(NEW_LEAD, '').trim() || String(heard).trim();
      return relay(await run('new_thread', { text }));
    }
    case 'summary':
    case 'inbox': {
      const s = await askMain('get_screen', {}, heard);
      return relay(`Tell the person briefly, in one or two sentences: ${s?.said ?? 'nothing is on screen.'}`);
    }
    case 'ask': {
      const s = await askMain('get_screen', {}, heard);
      if (!answer) return relay(`Answer the person's question from this, briefly: ${s?.said ?? ''}`);
      return relay(await answer({ question: heard, context: s?.said ?? '' }));
    }
    case 'signoff': return { say: 'Say a short goodbye.', signoff: true, ...meta };
    default: return relay('Tell the person that is not something Neo can do yet.');
  }
}
