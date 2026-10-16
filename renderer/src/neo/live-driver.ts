// Turns a GPT-Live session's messages into what Neo's window does: run each
// tool call once and send its answer back, show Neo's own words, report usage.
// The shapes here were checked against the live service on 2026-10-16
// (tests/neo-answers-each-tool-call-once-and-shows-only-its-own-words.test.mjs).

type Send = (event: Record<string, unknown>) => void;
type Tool = (callId: string, name: string, args: string, heard: string) => Promise<unknown>;

export function liveDriver({ send, tool, onWords, onUsage, onClosed }: {
  send: Send; tool: Tool; onWords: (text: string) => void; onUsage: (seconds: number) => void; onClosed: (reason?: string) => void;
}) {
  const done = new Set<string>();
  let words = '';
  let personSpokeSince = false;
  // What the person said last, kept through Neo's "one sec" so it reaches
  // the tool call it led to.
  let heard = '';
  let neoSpokeSince = true;
  let seq = 0;

  async function answer(callId: string, name: string, args: string) {
    let result: unknown;
    try { result = await tool(callId, name, args, heard.trim()); } catch { result = { ok: false, status: 'failed', said: 'That did not work.' }; }
    send({ type: 'response.item.create', event_id: `out_${++seq}`, item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(result) } });
    send({ type: 'response.create', event_id: `go_${seq}` });
  }

  return {
    async handle(ev: any) {
      switch (ev?.type) {
        case 'response.event': {
          const inner = ev.event;
          const item = inner?.item;
          if (inner?.type !== 'response.output_item.done' || item?.type !== 'function_call') return;
          if (typeof item.call_id !== 'string' || done.has(item.call_id)) return;
          done.add(item.call_id);
          await answer(item.call_id, String(item.name ?? ''), String(item.arguments ?? ''));
          return;
        }
        case 'session.output_transcript.delta': {
          if (personSpokeSince) { words = ''; personSpokeSince = false; }
          neoSpokeSince = true;
          words = (words + (ev.delta ?? '')).replace(/\s+/g, ' ').trimStart();
          onWords(words);
          return;
        }
        case 'session.input_transcript.delta':
          personSpokeSince = true;
          if (neoSpokeSince) { heard = ''; neoSpokeSince = false; }
          heard += ev.delta ?? '';
          return;
        case 'session.usage.updated':
          if (Number.isFinite(ev.usage?.seconds)) onUsage(ev.usage.seconds);
          return;
        case 'session.closed':
          onClosed(ev.reason);
          return;
        default:
      }
    },
  };
}
