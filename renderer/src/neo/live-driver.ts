// Turns a GPT-Live session's messages into what Neo's window does: run each
// tool call once and send its answer back, show Neo's own words, report usage.
// The shapes here were checked against the live service on 2026-10-16
// (tests/neo-answers-each-tool-call-once-and-shows-only-its-own-words.test.mjs).

type Send = (event: Record<string, unknown>) => void;
type Tool = (callId: string, name: string, args: string, heard: string) => Promise<unknown>;

export function liveChunks(text: string): string[] {
  const chunks: string[] = [];
  let chunk = '', bytes = 0;
  const encoder = new TextEncoder();
  for (const point of text) {
    const size = encoder.encode(point).length;
    if (bytes + size > 450) { chunks.push(chunk); chunk = ''; bytes = 0; }
    chunk += point; bytes += size;
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

const SETTLE = 250;
const SETTLE_MOST = 700;

export type Line = { who: 'you' | 'neo' | 'tool'; text: string };

export function liveDriver({ send, tool, onWords, onUsage, onClosed, onLine = () => {}, onDelegate, onActivity = () => {}, onUndelegated, onRecovery = () => {} }: {
  send: Send; tool: Tool; onWords: (text: string) => void; onUsage: (seconds: number) => void; onClosed: (reason?: string) => void;
  // The app decides (main/neo/decided.mjs): handed what she said, answers what the voice should say.
  onDelegate?: (id: string, heard: string) => Promise<{ say: string; context?: string }>;
  // Each turn whole, for the transcript (main/neo/index.mjs).
  onLine?: (line: Line) => void;
  onActivity?: () => void;
  onUndelegated?: (heard: string) => Promise<boolean>;
  onRecovery?: (repeat: boolean) => void;
}) {
  const done = new Set<string>();
  const delegations = new Set<string>();
  let words = '';
  let personSpokeSince = false;
  // What the person said last, kept through Neo's "one sec" so it reaches
  // the tool call it led to.
  type Turn = { text: string; at: number; start?: number; end?: number; offset?: number; settling?: boolean; delegated: boolean; logged: boolean; blocked: boolean; result?: Promise<{ say: string; context?: string }> };
  const turns: Turn[] = [];
  let turn: Turn | null = null;
  let neoSpokeSince = true;
  let seq = 0;
  let toldContext = '';
  let auditTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let retired = false;
  const cancelAudit = () => { if (auditTimer) clearTimeout(auditTimer); auditTimer = null; };
  const audit = () => {
    cancelAudit();
    const candidate = turn;
    if (!onUndelegated || !candidate?.text.trim() || candidate.delegated || candidate.blocked) return;
    auditTimer = setTimeout(async () => {
      auditTimer = null;
      if (disposed || turn !== candidate || candidate.delegated || Date.now() - candidate.at < 800) return;
      const missing = await onUndelegated(candidate.text).catch(() => false);
      if (disposed || turn !== candidate || candidate.delegated || !missing) return;
      candidate.blocked = true;
      send({type:'session.instructions.append',event_id:`guard_${++seq}`,delegation_id:null,content:'No app action ran for that request. Do not execute or replay it now. Tell the person it was not completed. The voice connection will refresh; wait for a new request afterward.'});
      onRecovery(true);
    }, 3000);
  };
  const checkpoint = () => { if (neoSpokeSince && words.trim()) { onLine({who:'neo',text:words.trim()}); words = ''; } };

  async function answer(callId: string, name: string, args: string) {
    let result: unknown;
    try { result = await tool(callId, name, args, turn?.text.trim() ?? ''); } catch { result = { ok: false, status: 'failed', said: 'That did not work.' }; }
    const r = (result ?? {}) as { status?: string; said?: string };
    onLine({ who: 'tool', text: `${name} ${args} -> ${r.status ?? 'done'}: ${String(r.said ?? '').split('\n')[0].slice(0, 300)}` });
    send({ type: 'response.item.create', event_id: `out_${++seq}`, item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(result) } });
    send({ type: 'response.create', event_id: `go_${seq}` });
  }

  return {
    checkpoint,
    retire() { retired = true; cancelAudit(); },
    dispose() { disposed = true; cancelAudit(); },
    async handle(ev: any) {
      if (disposed) return;
      if (retired && ev?.type !== 'session.usage.updated' && ev?.type !== 'session.closed') return;
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
          onActivity();
          if (personSpokeSince) { words = ''; personSpokeSince = false; }
          if (turn?.text.trim() && !turn.logged) { onLine({ who: 'you', text: turn.text.trim() }); turn.logged = true; }
          neoSpokeSince = true;
          words = (words + (ev.delta ?? '')).replace(/\s+/g, ' ').trimStart();
          onWords(words);
          audit();
          return;
        }
        case 'session.input_transcript.delta': {
          onActivity(); cancelAudit();
          const start = Number.isFinite(ev.start_ms) ? ev.start_ms : undefined;
          const end = Number.isFinite(ev.end_ms) ? ev.end_ms : undefined;
          const same = start !== undefined ? [...turns].reverse().find((t) => t.start !== undefined && t.end !== undefined && start >= t.start && start <= t.end + 300) : undefined;
          if (same && same !== turn) { same.text += ev.delta ?? ''; same.at = Date.now(); same.end = Math.max(same.end!, end ?? same.end!); return; }
          personSpokeSince = true;
          if (!turn || ((neoSpokeSince || (turn.delegated && !turn.settling) || (start !== undefined && turn.offset !== undefined && start > turn.offset)) && !same)) {
            checkpoint();
            turn = {text:'',at:Date.now(),start,end,delegated:false,logged:false,blocked:false};
            turns.push(turn); if (turns.length > 24) turns.shift();
          }
          neoSpokeSince = false;
          turn.text += ev.delta ?? '';
          turn.at = Date.now();
          if (start !== undefined) turn.start = Math.min(turn.start ?? start, start);
          if (end !== undefined) turn.end = Math.max(turn.end ?? end, end);
          return;
        }
        case 'session.delegation.created': {
          const id = ev.delegation?.id;
          if (!onDelegate || ev.delegation?.target !== 'client' || typeof id !== 'string' || delegations.has(id)) return;
          delegations.add(id);
          const request = Number.isFinite(ev.offset_ms) ? [...turns].reverse().find((t) => t.start !== undefined && t.start <= ev.offset_ms) ?? turn : turn;
          if (request?.blocked) {
            send({type:'session.commentary.append',event_id:`blocked_${++seq}`,delegation_id:id,content:'That request was not completed. Please repeat it after the voice connection refreshes.'});
            return;
          }
          if (request) { request.delegated = true; request.settling = true; request.offset = ev.offset_ms; }
          cancelAudit();
          // Her last word can land at the same moment as the hand-off.
          for (let waited = 0; request && waited < SETTLE_MOST && Date.now() - request.at < SETTLE; waited += 50) await new Promise((r) => setTimeout(r, 50));
          if (request) request.settling = false;
          if (disposed) return;
          let say = '';
          let context = '';
          try {
            const result = request ? (request.result ??= onDelegate(id, request.text.trim())) : onDelegate(id, '');
            const r = await result;
            say = r?.say ?? '';
            context = r?.context ?? '';
          } catch { say = 'Tell the person that did not work.'; }
          // What is on screen now, so the voice answers from it rather than guessing.
          // Only inside a hand-off: Live refuses it anywhere else (measured).
          if (context && context !== toldContext) {
            for (const content of liveChunks(context)) send({ type: 'session.thinking.append', event_id: `ctx_${++seq}`, delegation_id: id, content });
            toldContext = context;
          }
          onLine({ who: 'tool', text: `decided -> ${say.slice(0, 300) || '(nothing to say)'}` });
          // Finish with commentary so the voice says the result after its context update.
          for (const content of liveChunks(say || 'Say just "Okay."')) send({ type: 'session.commentary.append', event_id: `say_${++seq}`, delegation_id: id, content });
          return;
        }
        case 'error':
          onLine({who:'tool',text:`Live rejected an update: ${ev.error?.code ?? 'unknown error'}`});
          onWords('The voice reply could not be confirmed. Check the screen.');
          onRecovery(false);
          return;
        case 'session.usage.updated':
          if (Number.isFinite(ev.usage?.seconds)) onUsage(ev.usage.seconds);
          return;
        case 'session.closed':
          cancelAudit();
          if (Number.isFinite(ev.usage?.seconds)) onUsage(ev.usage.seconds);
          checkpoint();
          if (!neoSpokeSince && turn?.text.trim() && !turn.logged) onLine({ who: 'you', text: turn.text.trim() });
          onClosed(ev.reason);
          return;
        default:
      }
    },
  };
}
