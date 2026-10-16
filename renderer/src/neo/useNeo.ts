// The main window's half of Neo: listens for Neo's tool calls from the main
// process, carries them out through ./bridge with the app's own functions,
// lights up what it touched, and marks the page while Neo is on so the
// summary's Status, Priority and Owner block steps back (approved 2026-10-15).
//
// Mounted always and does nothing unless this Mac has the alpha flag
// (main/neo/gate.mjs), so the app is the same app for everyone else.
import { useEffect, useRef } from 'react';
import { describeScreen, neoBridge, type NeoDeps, type NeoRow } from './bridge';
import { glowOn } from './glow';

type Z = {
  neoEnabled?: () => Promise<boolean>;
  onNeoAct?: (fn: (p: { id: number; name: string; args: Record<string, unknown>; heard?: string }) => void) => () => void;
  neoActResult?: (id: number, result: unknown) => void;
  onNeoMode?: (fn: (p: { on: boolean }) => void) => () => void;
};

// Which section to light for each kind of act, most specific first. A row in
// the list if it is drawn, else the open thread's own section.
function sectionFor(name: string, id: string): Element | null {
  const q = (s: string) => document.querySelector(s);
  const row = q(`.list-pane .row[data-item-id="${CSS.escape(id)}"]`) ?? q(`[data-item-id="${CSS.escape(id)}"]`);
  if (name === 'pick_option') return q('.opt-strip') ?? row;
  if (name === 'reply') return q('.dock-card') ?? row;
  return row ?? q('.ts-panel');
}

const settle = () => new Promise((r) => setTimeout(r, 600));

type AppDeps<R extends NeoRow> = Omit<NeoDeps<R>, 'glow' | 'outside' | 'pick' | 'close'> & {
  pick(row: R, n: number): Promise<unknown>;
  close(row: R): Promise<unknown>;
};

export function useNeo<R extends NeoRow>(deps: AppDeps<R>) {
  const latest = useRef(deps);
  latest.current = deps;

  useEffect(() => {
    const z = (window as unknown as { zero?: Z }).zero;
    if (!z?.neoEnabled || !z.onNeoAct || !z.neoActResult) return;
    let offs: Array<() => void> = [];
    let cancelled = false;
    let outside = false;
    let lastName = '';
    void z.neoEnabled().catch(() => false).then((on) => {
      if (!on || cancelled) return;
      const live: NeoDeps<R> = {
        rows: () => latest.current.rows(),
        focused: () => latest.current.focused(),
        options: (r) => latest.current.options(r),
        summary: (r) => latest.current.summary(r),
        projects: () => latest.current.projects(),
        open: (r) => latest.current.open(r),
        // The app can stop to ask its own question (a filed task, the close
        // nudge), and returns as if it had acted. So look, once React has
        // drawn: an act that landed moves the row or spends its offer.
        pick: async (r, n) => {
          const before = latest.current.options(r).map((o) => o.text).join('\n');
          await latest.current.pick(r, n);
          await settle();
          const now = latest.current.rows().find((x) => x.id === r.id);
          return now && latest.current.options(now).map((o) => o.text).join('\n') === before ? 'asked' : 'done';
        },
        reply: (r, t) => latest.current.reply(r, t),
        close: async (r) => {
          await latest.current.close(r);
          await settle();
          return latest.current.rows().some((x) => x.id === r.id) ? 'asked' : 'done';
        },
        compose: (t, p) => latest.current.compose(t, p),
        undo: () => latest.current.undo(),
        outside: () => outside,
        // The films and sounds the open thread draws (components/Focus.tsx ArtifactMedia).
        mediaNames: () => [...document.querySelectorAll('.inline-media')].map((el) => el.querySelector('.mention-name')?.textContent?.trim() || 'a film'),
        media: async (action, n) => {
          const spots = [...document.querySelectorAll<HTMLElement>('.inline-media')];
          const spot = spots[n - 1];
          const player = spot?.querySelector<HTMLMediaElement>('video, audio');
          if (!spot || !player) return null;
          spot.scrollIntoView({ block: 'center', behavior: 'smooth' });
          if (action === 'pause') player.pause(); else await player.play().catch(() => {});
          setTimeout(() => glowOn(spot), 300);
          return { name: spot.querySelector('.mention-name')?.textContent?.trim() || 'the film', count: spots.length };
        },
        // After React has drawn what the act changed, so the glow lands on
        // the section as it now is.
        glow: (id) => { const name = lastName; setTimeout(() => glowOn(sectionFor(name, id)), 180); },
      };
      const act = neoBridge(live);
      offs.push(z.onNeoAct!(async ({ id, name, args, heard }) => {
        if (name === 'describe_screen') outside = !!args?.outside;
        lastName = name;
        const result = name === 'describe_screen' ? { ok: true, status: 'committed', said: describeScreen(live) } : await act(name, args ?? {}, { heard });
        z.neoActResult!(id, result);
      }));
      if (z.onNeoMode) offs.push(z.onNeoMode(({ on: neoOn }) => {
        document.body.classList.toggle('neo-on', !!neoOn);
        if (!neoOn) glowOn(null);
      }));
    });
    return () => { cancelled = true; offs.forEach((f) => f()); offs = []; document.body.classList.remove('neo-on'); };
  }, []);
}
