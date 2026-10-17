// The details of a picked action, read from what the person said and
// checked: how long to put a thread off, which pictures, what to send.
// The picker only ever chooses the action and its target (./neo-options.mjs).

const NUM = { one: 1, a: 1, an: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, sixty: 60, first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };
const num = (w) => (/^\d+$/.test(w) ? Number(w) : NUM[w]);
const clean = (s) => String(s ?? '').toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9': -]+/g, ' ').replace(/\s+/g, ' ').trim();

const atHour = (base, h, m = 0) => { const d = new Date(base); d.setHours(h, m, 0, 0); return d.getTime(); };
const plusDays = (ts, n) => { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); };
const clock = (ts) => new Date(ts).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });

/** { ts, label } for "for ten minutes", "until 4pm", "tomorrow at 9", "this evening"; null when no time was said. */
export function laterFrom(said, now = Date.now()) {
  const s = clean(said);
  if (/half an hour/.test(s)) return { ts: now + 30 * 60_000, label: 'in 30 minutes' };
  const span = /\b(\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty|forty-five|sixty) (minute|min|hour|hr|day)s?\b/.exec(s);
  if (span) {
    const n = num(span[1]);
    if (!(n > 0)) return null;
    const unit = span[2].startsWith('m') ? 60_000 : span[2].startsWith('h') ? 3600_000 : 86400_000;
    const word = span[2].startsWith('m') ? 'minute' : span[2].startsWith('h') ? 'hour' : 'day';
    return { ts: now + n * unit, label: `in ${n} ${word}${n === 1 ? '' : 's'}` };
  }
  const time = /\b(?:at|until|till|by)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/.exec(s.replace(/\b(\d+) (minute|min|hour|hr|day)s?\b/g, ''));
  if (time && (Number(time[1]) > (time[3] ? 12 : 23) || Number(time[2] ?? 0) > 59 || (time[3] && Number(time[1]) < 1))) return null;
  const hourOf = (h, ampm) => (ampm === 'pm' && h < 12 ? h + 12 : ampm === 'am' && h === 12 ? 0 : !ampm && h < 7 ? h + 12 : h);
  if (/\btomorrow\b/.test(s)) {
    const t = time && /\b(at|until|till|by)\b|am|pm/.test(time[0]) ? atHour(plusDays(now, 1), hourOf(Number(time[1]), time[3]), Number(time[2] ?? 0)) : atHour(plusDays(now, 1), 8);
    return { ts: t, label: `until ${clock(t)}` };
  }
  if (/\bnext week\b/.test(s)) {
    const d = new Date(now);
    const t = atHour(plusDays(now, ((8 - d.getDay()) % 7) || 7), 8);
    return { ts: t, label: `until ${clock(t)}` };
  }
  if (/\b(this|tonight|evening)\b/.test(s) && /\b(evening|tonight)\b/.test(s)) {
    const t = atHour(now, 18);
    return t > now ? { ts: t, label: 'until this evening' } : null;
  }
  if (time && (time[3] || /\b(at|until|till|by)\b/.test(time[0]))) {
    let t = atHour(now, hourOf(Number(time[1]), time[3]), Number(time[2] ?? 0));
    if (t <= now) t = plusDays(t, 1);
    return { ts: t, label: `until ${clock(t)}` };
  }
  return null;
}

/** Picture numbers named in what she said, within the `count` the thread has; the first two when none is named. */
export function picturesFrom(said, count) {
  const s = clean(said);
  const all = Array.from({ length: Math.min(count, 4) }, (_, i) => i + 1);
  if (/\b(all|every|each)\b/.test(s)) return all;
  const found = [];
  for (const w of s.split(/[\s,]+/)) {
    const n = num(w);
    if (n && n >= 1 && n <= count && !found.includes(n) && w !== 'a' && w !== 'an') found.push(n);
  }
  if (found.length) return found.slice(0, 4);
  return all.slice(0, 2);
}

const LEAD = /^(?:please\s+)?(?:(?:tell|let)\s+(?:the agent|the thread|it|them|him|her)(?:\s+know)?(?:\s+that)?|reply(?:\s+(?:saying|with|that))?|send(?:\s+(?:that|this))?(?:\s+saying)?|put\s+(?:this|that)\s+in\s+(?:the|this)\s+(?:chat|thread)(?:\s+as\s+feedback)?|add\s+(?:this|that)\s+as\s+feedback|feedback|say)\s*[:,-]?\s*/i;
const NO_PICTURE = /[,;]?\s*(?:but\s+)?(?:without|no|not with|don'?t (?:send|include|attach))\s+(?:the\s+)?(?:screenshot|picture|image|attachment)s?\.?\s*$/i;

/** { text, attach }: the words she wants sent, without the instruction around them. */
const PICTURE = /\b(?:screenshot|screen shot|picture|image|photo|png)s?\b/i;

/** false when she said not to send a picture, true when she asked for one, else undefined. */
const NO_PICTURE_ANYWHERE = /\b(?:without|no|not with|don'?t (?:send|include|attach|add)|do not (?:send|include|attach|add)|leave out)\s+(?:the\s+|a\s+|any\s+|my\s+)?(?:screenshot|screen shot|picture|image|attachment|photo)s?\b/i;

export function pictureWanted(said) {
  const t = String(said ?? '');
  if (NO_PICTURE.test(t.trim()) || NO_PICTURE_ANYWHERE.test(t)) return false;
  return PICTURE.test(t) ? true : undefined;
}

export function replyFrom(said) {
  let text = String(said ?? '').trim();
  const attach = !NO_PICTURE.test(text);
  text = text.replace(NO_PICTURE, '').trim();
  text = text.replace(LEAD, '').trim();
  if (!text) return { text: String(said ?? '').trim(), attach };
  text = text.charAt(0).toUpperCase() + text.slice(1);
  if (!/[.!?]$/.test(text)) text += '.';
  return { text, attach };
}
