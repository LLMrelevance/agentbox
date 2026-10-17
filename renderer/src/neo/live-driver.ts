// Turns a GPT-Live session's messages into what Neo's window does: run each
// tool call once and send its answer back, show Neo's own words, report usage.
// The shapes here were checked against the live service on 2026-10-16
// (tests/neo-answers-each-tool-call-once-and-shows-only-its-own-words.test.mjs).

type Send = (event: Record<string, unknown>) => void;
type Tool = (callId: string, name: string, args: string, heard: string) => Promise<unknown>;

const SETTLE = 250;
const SETTLE_MOST = 700;

export type Line = { who: 'you' | 'neo' | 'tool'; text: string };

export function liveDriver({ send, tool, onWords, onUsage, onClosed, onLine = () => {}, onDelegate }: {
  send: Send; tool: Tool; onWords: (text: string) => void; onUsage: (seconds: number) => void; onClosed: (reason?: string) => void;
  // The app decides (main/neo/decided.mjs): handed what she said, answers what the voice should say.
  onDelegate?: (id: string, heard: string) => Promise<{ say: string }>;
  // Each turn whole, for the transcript (main/neo/index.mjs).
  onLine?: (line: Line) => void;
}) {
  const done = new Set<string>();
  const delegations = new Set<string>();
  let words = '';
  let personSpokeSince = false;
  // What the person said last, kept through Neo's "one sec" so it reaches
  // the tool call it led to.
  let heard = '';
  let heardAt = 0;
  // Set once a request is handed over, so the next words start a new one.
  let handedOver = false;
  let neoSpokeSince = true;
  let seq = 0;

  async function answer(callId: string, name: string, args: string) {
    let result: unknown;
    try { result = await tool(callId, name, args, heard.trim()); } catch { result = { ok: false, status: 'failed', said: 'That did not work.' }; }
    const r = (result ?? {}) as { status?: string; said?: string };
    onLine({ who: 'tool', text: `${name} ${args} -> ${r.status ?? 'done'}: ${String(r.said ?? '').split('\n')[0].slice(0, 300)}` });
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
          if (!neoSpokeSince && heard.trim()) onLine({ who: 'you', text: heard.trim() });
          neoSpokeSince = true;
          words = (words + (ev.delta ?? '')).replace(/\s+/g, ' ').trimStart();
          onWords(words);
          return;
        }
        case 'session.input_transcript.delta':
          personSpokeSince = true;
          if (neoSpokeSince) { if (words.trim()) onLine({ who: 'neo', text: words.trim() }); heard = ''; neoSpokeSince = false; }
          if (handedOver) { heard = ''; handedOver = false; }
          heard += ev.delta ?? '';
          heardAt = Date.now();
          return;
        case 'session.delegation.created': {
          const id = ev.delegation?.id;
          if (!onDelegate || ev.delegation?.target !== 'client' || typeof id !== 'string' || delegations.has(id)) return;
          delegations.add(id);
          // Her last word can land at the same moment as the hand-off.
          for (let waited = 0; waited < SETTLE_MOST && Date.now() - heardAt < SETTLE; waited += 50) await new Promise((r) => setTimeout(r, 50));
          handedOver = true;
          let say = '';
          try { say = (await onDelegate(id, heard.trim()))?.say ?? ''; } catch { say = 'Tell the person that did not work.'; }
          onLine({ who: 'tool', text: `decided -> ${say.slice(0, 300) || '(nothing to say)'}` });
          // Never thinking.append: Live ends the turn on it, silent after "one sec".
          send({ type: 'session.commentary.append', event_id: `say_${++seq}`, delegation_id: id, content: (say || 'Say just "Okay."').slice(0, 1800) });
          return;
        }
        case 'session.usage.updated':
          if (Number.isFinite(ev.usage?.seconds)) onUsage(ev.usage.seconds);
          return;
        case 'session.closed':
          if (neoSpokeSince && words.trim()) onLine({ who: 'neo', text: words.trim() });
          else if (!neoSpokeSince && heard.trim()) onLine({ who: 'you', text: heard.trim() });
          onClosed(ev.reason);
          return;
        default:
      }
    },
  };
}
