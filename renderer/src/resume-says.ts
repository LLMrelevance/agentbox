// What the toast says after Resume. A thread a usage limit holds is named
// apart from one waiting for a slot, because a slot frees in minutes and a
// limit can hold for hours.
export interface ResumeAnswer {
  resumed?: number;
  queued?: number;
  working?: number;
  /** Of `queued`, the ones held by a usage limit, and the earliest reset. */
  limited?: number;
  limitedUntil?: number;
}

const clock = (t: number) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s/g, '').toLowerCase();

/** `titled`: the toast names the one thread, which leaves this line about forty characters. */
export function resumedLine(r: ResumeAnswer | null | undefined, now = Date.now(), { titled = false } = {}): string {
  const started = r?.resumed ?? 0;
  const limited = r?.limited ?? 0;
  const slot = Math.max(0, (r?.queued ?? 0) - limited);
  if (!started && !slot && !limited) return r?.working ? 'Already working on it' : 'Nothing to resume';
  const when = r?.limitedUntil && r.limitedUntil > now ? clock(r.limitedUntil) : null;
  if (titled && limited === 1 && !started && !slot) return when ? `At its usage limit until ${when}` : 'At its usage limit';
  return [
    started ? `${started} resumed` : '',
    slot ? `${slot} waiting for a slot` : '',
    limited ? `${limited} ${limited === 1 ? 'starts' : 'start'} when the usage limit resets${when ? ` at ${when}` : ''}` : '',
  ].filter(Boolean).join(', ');
}

/** "Resume interrupted agents", from its answer and the rows it was asked about (null for all). */
export function resumedStoppedLine(
  r: { cleared?: number; atLimit?: Record<string, { tool: string; until: number }> } | null | undefined,
  ids: string[] | null,
  now = Date.now(),
): string {
  const cleared = r?.cleared ?? 0;
  if (cleared) return `Resuming: ${cleared} interrupted ${cleared === 1 ? 'agent' : 'agents'} respawning`;
  const held = Object.entries(r?.atLimit ?? {}).filter(([id]) => !ids || ids.includes(id));
  if (!held.length) return 'Nothing stranded. Anything waiting respawns on its own';
  const resets = held.map(([, v]) => v.until).filter((u) => u > 0);
  return resumedLine({ queued: held.length, limited: held.length, limitedUntil: resets.length ? Math.min(...resets) : 0 }, now);
}
