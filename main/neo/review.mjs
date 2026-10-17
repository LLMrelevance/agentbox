// Every few minutes of talk with Neo goes to a review that patches what went
// wrong, for the first two weeks of the alpha. One standing thread holds it:
// made on the first stretch, and each later stretch is a reply on it, which
// starts an agent there like any reply does. The transcript rides in the
// message, so a run in the cloud can read it as well as one on this Mac.
import fs from 'node:fs';

export const REVIEW_DAYS = 14;
const MAX_CHARS = 14_000;

const ASKED = 'Tell it to actually listen in on our conversations, track our conversations, and as we run into issues, maybe every few minutes of usage, patch them as we go. Just sort of do that continuously for the first couple weeks. Not necessarily every few minutes, whilst I use Jarvis or Neo in beta.';

const BRIEF = `This thread reviews Neo, the voice alpha, from what was actually said. The ask, in the founder's exact words:

> ${ASKED}

And: "In the future, when I give feedback, preserve my exact wording wherever possible instead of summarizing it."

Each message here is a stretch of talk: "you" is the founder, "neo" is Neo, "tool" is an action Neo took and what came of it, and "shadow" is what the Decisions API trial run would have done instead (plans/neo-decisions.md). Where the two differ, say which was right; that is the evidence for switching. For each stretch:
1. Find where Neo misheard, did the wrong thing, could not do something it should have, said something untrue, talked when it should not have, or took too long.
2. Fix those in Neo's code (main/neo/, renderer/src/neo/, shared/neo-*), test first, by the repo's CLAUDE.md, and measure against the live service where it is the model's behaviour that went wrong.
3. A fix that stays inside Neo's own files and changes nothing she sees may be committed and labelled ship without asking. Anything she would see, or anything outside Neo, goes to her first with screenshots.
4. Quote her exact words for every issue. Keep the open issues in this thread's progress.
If nothing went wrong in a stretch, say so in one line and stop.`;

function readState(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) ?? {}; } catch { return {}; }
}

/** The stretch as plain lines, newest kept when it is long. */
export function transcriptOf(files) {
  const lines = [];
  for (const file of files) {
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    for (const raw of text.split('\n')) {
      try { const l = JSON.parse(raw); if (l?.who && typeof l.text === 'string') lines.push(`${l.who}: ${l.text}`); } catch {}
    }
  }
  let out = lines.join('\n');
  if (out.length > MAX_CHARS) out = `…\n${out.slice(out.length - MAX_CHARS)}`;
  return out;
}

/**
 * Files one stretch of talk. `channels` are the app's own handlers
 * (main/main.mjs), so the thread is made and answered the way a person's are.
 * Answers 'made', 'replied', 'over' (two weeks are up) or 'no-project'.
 */
export async function fileReview({ files, seconds, product, channels, stateFile, now = Date.now }) {
  if (!product) return 'no-project';
  const state = readState(stateFile);
  const at = now();
  if (state.since && at - state.since > REVIEW_DAYS * 24 * 3600e3) return 'over';
  const talk = transcriptOf(files);
  const head = `${Math.round(seconds / 60)} min of talk with Neo, ${new Date(at).toISOString().slice(0, 16).replace('T', ' ')}:`;
  const said = `${head}\n\n\`\`\`\n${talk}\n\`\`\``;
  if (state.product === product && state.id) {
    await channels.get('zero:answer')({ sender: null }, { product, id: state.id, answer: said, status: 'open' });
    return 'replied';
  }
  const made = await channels.get('zero:compose')({ sender: null }, {
    product, title: `Neo beta: review what was said and patch it`, body: `${BRIEF}\n\n---\n\n${said}`, kind: 'directive', priority: 7,
    // Her own words to Neo: never the team's to read, whoever the project is shared with.
    visibility: 'private',
  });
  if (made?.id) fs.writeFileSync(stateFile, JSON.stringify({ product, id: made.id, since: state.since ?? at }));
  return 'made';
}
