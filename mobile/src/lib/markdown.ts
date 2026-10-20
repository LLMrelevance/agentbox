// The markdown agents actually write, as blocks and spans a phone can draw.
// Anything else comes through as the words it is.

export type Block =
  | { kind: 'p' | 'h' | 'code'; text: string }
  | { kind: 'li'; text: string; mark: string };

export function blocksOf(text: string): Block[] {
  const out: Block[] = [];
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
  let para: string[] = [];
  const endPara = () => { if (para.length) out.push({ kind: 'p', text: para.join('\n') }); para = []; };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      endPara();
      const code: string[] = [];
      for (i += 1; i < lines.length && !/^\s*```/.test(lines[i]); i += 1) code.push(lines[i]);
      out.push({ kind: 'code', text: code.join('\n') });
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const item = /^\s*([-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (heading) { endPara(); out.push({ kind: 'h', text: heading[1].trim() }); }
    else if (item) { endPara(); out.push({ kind: 'li', text: item[2].trim(), mark: /\d/.test(item[1]) ? item[1].replace(')', '.') : '•' }); }
    else if (!line.trim()) endPara();
    else if (/^\s{2,}\S/.test(line) && !para.length && out.at(-1)?.kind === 'li') {
      const last = out[out.length - 1] as Extract<Block, { kind: 'li' }>;
      last.text = `${last.text} ${line.trim()}`;
    } else para.push(line);
  }
  endPara();
  return out;
}

export interface Span { text: string; bold?: boolean; code?: boolean; link?: string }

const INLINE = /\*\*([^*\n]+)\*\*|`([^`\n]+)`|\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g;

export function spansOf(line: string): Span[] {
  const out: Span[] = [];
  let at = 0;
  for (const m of line.matchAll(INLINE)) {
    if (m.index! > at) out.push({ text: line.slice(at, m.index) });
    if (m[1] !== undefined) out.push({ text: m[1], bold: true });
    else if (m[2] !== undefined) out.push({ text: m[2], code: true });
    else out.push({ text: m[3], link: m[4] });
    at = m.index! + m[0].length;
  }
  if (at < line.length) out.push({ text: line.slice(at) });
  return out;
}
