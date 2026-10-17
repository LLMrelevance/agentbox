// Her words, 2026-10-16: "tell it to actually listen in on our conversations,
// track our conversations, and as we run into issues, maybe every few minutes
// of usage, patch them as we go. Just sort of do that continuously for the
// first couple weeks." Each stretch of talk goes to one standing thread as a
// reply carrying the transcript, which starts an agent on it; after two weeks
// it stops by itself.
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileReview, REVIEW_DAYS } from '../main/neo/review.mjs';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-review-'));
  const talk = path.join(dir, 'a.jsonl');
  fs.writeFileSync(talk, [
    { at: '2026-10-16T23:40:00.000Z', who: 'you', text: 'Full screen the picture.' },
    { at: '2026-10-16T23:40:02.000Z', who: 'tool', text: 'reply {"id":"w-1","text":"Full screen the picture."} -> committed: Sent.' },
    { at: '2026-10-16T23:40:03.000Z', who: 'neo', text: 'Sent.' },
  ].map((l) => JSON.stringify(l)).join('\n') + '\n');
  const calls = [];
  const channels = new Map([
    ['zero:compose', vi.fn(async (_e, p) => { calls.push(['compose', p]); return { id: 'w-review' }; })],
    ['zero:answer', vi.fn(async (_e, p) => { calls.push(['answer', p]); return { ok: true }; })],
  ]);
  return { dir, talk, calls, channels, stateFile: path.join(dir, 'review.json'), product: 'agentbox' };
}

describe('the review thread', () => {
  it('is made once, carrying her words and what the reviewer may and may not do', async () => {
    const t = setup();
    await fileReview({ files: [t.talk], seconds: 200, product: t.product, channels: t.channels, stateFile: t.stateFile, now: () => Date.parse('2026-10-16T23:45:00Z') });
    const [[kind, made]] = t.calls;
    expect(kind).toBe('compose');
    expect(made.product).toBe('agentbox');
    // Her talk with Neo is hers, in a project the team may share.
    expect(made.visibility).toBe('private');
    expect(made.body).toMatch(/listen in on our conversations/);
    expect(made.body).toMatch(/exact words/i);
    expect(made.body).toMatch(/Full screen the picture\./);
  });

  it('later stretches are replies on the same thread, which start an agent on it', async () => {
    const t = setup();
    const o = { files: [t.talk], seconds: 200, product: t.product, channels: t.channels, stateFile: t.stateFile, now: () => Date.parse('2026-10-16T23:45:00Z') };
    await fileReview(o);
    await fileReview({ ...o, now: () => Date.parse('2026-10-17T10:00:00Z') });
    const [, [kind, said]] = t.calls;
    expect(kind).toBe('answer');
    expect(said).toMatchObject({ product: 'agentbox', id: 'w-review', status: 'open' });
    expect(said.answer).toMatch(/you: Full screen the picture\./);
    expect(said.answer).toMatch(/tool: reply/);
  });

  it('stops by itself two weeks after the first review', async () => {
    const t = setup();
    const start = Date.parse('2026-10-16T23:45:00Z');
    const o = { files: [t.talk], seconds: 200, product: t.product, channels: t.channels, stateFile: t.stateFile };
    await fileReview({ ...o, now: () => start });
    expect(await fileReview({ ...o, now: () => start + (REVIEW_DAYS * 24 + 1) * 3600e3 })).toBe('over');
    expect(t.calls).toHaveLength(1);
  });

  it('keeps a long stretch to its last part, so a reply stays readable', async () => {
    const t = setup();
    fs.writeFileSync(t.talk, Array.from({ length: 2000 }, (_, i) => JSON.stringify({ at: 'x', who: 'you', text: `line ${i} ${'word '.repeat(10)}` })).join('\n'));
    await fileReview({ files: [t.talk], seconds: 900, product: t.product, channels: t.channels, stateFile: t.stateFile, now: () => 1 });
    const body = t.calls[0][1].body;
    expect(body.length).toBeLessThan(20_000);
    expect(body).toMatch(/line 1999/);
  });

  it('does nothing without a project to file it in', async () => {
    const t = setup();
    expect(await fileReview({ files: [t.talk], seconds: 200, product: null, channels: t.channels, stateFile: t.stateFile, now: () => 1 })).toBe('no-project');
    expect(t.calls).toEqual([]);
  });
});
