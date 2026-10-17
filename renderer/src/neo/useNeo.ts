// The main window's half of Neo: listens for Neo's tool calls from the main
// process, carries them out through ./bridge with the app's own functions,
// lights up what it touched, and marks the page while Neo is on so the
// summary's Status, Priority and Owner block steps back (approved 2026-10-15).
//
// Mounted always and does nothing unless this Mac has the alpha flag
// (main/neo/gate.mjs), so the app is the same app for everyone else.
import { useEffect, useRef } from 'react';
import { describeScreen, neoBridge, screenFor, type NeoDeps, type NeoRow } from './bridge';
import { glowOn } from './glow';
import { orbCovers, type Orb } from './orb-cover';
import { fileName, filmName, latestFiles, pictureName, putAway, show, threadFilms, threadPictures } from './show';

type Z = {
  neoEnabled?: () => Promise<boolean>;
  onNeoAct?: (fn: (p: { id: number; name: string; args: Record<string, unknown>; heard?: string }) => void) => () => void;
  neoActResult?: (id: number, result: unknown) => void;
  onNeoMode?: (fn: (p: { on: boolean }) => void) => () => void;
  onNeoOrb?: (fn: (p: Orb) => void) => () => void;
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

// What she is reading: the nearest scrolling box under the middle of the app.
function scrollerAt(): HTMLElement | null {
  let el = document.elementFromPoint(window.innerWidth * 0.45, window.innerHeight * 0.5) as HTMLElement | null;
  for (; el; el = el.parentElement) {
    const y = getComputedStyle(el).overflowY;
    if ((y === 'auto' || y === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el;
  }
  const page = document.scrollingElement as HTMLElement | null;
  return page && page.scrollHeight > page.clientHeight + 1 ? page : null;
}

type AppDeps<R extends NeoRow> = Omit<NeoDeps<R>, 'glow' | 'outside' | 'pick' | 'close' | 'scroll' | 'pictureNames' | 'show' | 'media' | 'mediaNames' | 'latestFilmCount' | 'latestPictureCount' | 'waitForPictures' | 'fileNames' | 'openFile'> & {
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
        reply: (r, t, o) => latest.current.reply(r, t, o),
        close: async (r) => {
          await latest.current.close(r);
          await settle();
          return latest.current.rows().some((x) => x.id === r.id) ? 'asked' : 'done';
        },
        compose: (t, p) => latest.current.compose(t, p),
        undo: () => latest.current.undo(),
        // Said done only once the thread has actually left the inbox.
        later: async (r, ts, label) => {
          await latest.current.later?.(r, ts, label);
          await settle();
          return latest.current.rows().some((x) => x.id === r.id) ? 'asked' : 'done';
        },
        outside: () => outside,
        // The films and sounds the open thread draws (components/Focus.tsx ArtifactMedia).
        mediaNames: () => threadFilms().films.map(filmName),
        latestFilmCount: () => threadFilms().latest,
        media: async (action, n) => {
          const spots = threadFilms().films;
          const spot = spots[n - 1];
          const player = spot?.querySelector<HTMLMediaElement>('video, audio');
          if (!spot || !player) return null;
          spot.scrollIntoView({ block: 'center', behavior: 'smooth' });
          if (action === 'pause') player.pause(); else await player.play().catch(() => {});
          setTimeout(() => glowOn(spot), 300);
          return { name: spot.querySelector('.mention-name')?.textContent?.trim() || 'the film', count: spots.length };
        },
        commands: () => latest.current.commands?.() ?? [],
        scroll: (where) => {
          const box = scrollerAt();
          if (!box) return false;
          const page = box.clientHeight * 0.7;
          const to = where === 'top' ? 0 : where === 'bottom' ? box.scrollHeight : box.scrollTop + (where === 'up' ? -page : page);
          box.scrollTo({ top: to, behavior: 'smooth' });
          return true;
        },
        pictureNames: () => threadPictures().pictures.map((img, i) => pictureName(img, i + 1)),
        latestPictureCount: () => threadPictures().latest,
        // A thread draws its messages after its history arrives.
        waitForPictures: async () => {
          for (let waited = 0; waited < 1500 && !threadPictures().latest && !latestFiles().length; waited += 150) await new Promise((r) => setTimeout(r, 150));
        },
        show: (ns, layout) => show(ns, layout),
        fileNames: () => latestFiles().map((t, i) => fileName(t, i + 1)),
        openFile: async (n) => {
          const tile = latestFiles()[n - 1];
          if (!tile) return false;
          if (tile.getAttribute('aria-pressed') !== 'true') tile.click();
          setTimeout(() => glowOn(tile), 300);
          return true;
        },
        // After React has drawn what the act changed, so the glow lands on
        // the section as it now is.
        glow: (id) => { const name = lastName; setTimeout(() => glowOn(sectionFor(name, id)), 180); },
      };
      const act = neoBridge(live);
      offs.push(z.onNeoAct!(async ({ id, name, args, heard }) => {
        if (name === 'describe_screen') outside = !!args?.outside;
        lastName = name;
        const result = name === 'describe_screen' ? { ok: true, status: 'committed', said: describeScreen(live) }
          // For the Decisions trial run: what is on screen, read and nothing done.
          : name === 'neo_screen' ? { ok: true, screen: screenFor(live, act.canGoBack()) }
          : await act(name, args ?? {}, { heard });
        z.neoActResult!(id, result);
      }));
      // The Status and Owner block waits while the orb is on top of it. Until
      // the orb says where it is, treat it as covered: it wakes in that very
      // corner, and guessing the other way flashes the block on every wake.
      let orb: Orb | null = null;
      const readFade = () => {
        const foot = document.querySelector('.ts-panel .ts-foot');
        document.body.classList.toggle('neo-orb-away', !!orb && !orbCovers(orb, foot?.getBoundingClientRect() ?? null));
      };
      if (z.onNeoOrb) offs.push(z.onNeoOrb((at) => { orb = at; readFade(); }));
      // The block moves when the window is resized or the panel is opened.
      window.addEventListener('resize', readFade);
      offs.push(() => window.removeEventListener('resize', readFade));
      if (z.onNeoMode) offs.push(z.onNeoMode(({ on: neoOn }) => {
        document.body.classList.toggle('neo-on', !!neoOn);
        if (neoOn) readFade();
        else { glowOn(null); putAway(); document.body.classList.remove('neo-orb-away'); }
      }));
    });
    return () => { cancelled = true; offs.forEach((f) => f()); offs = []; document.body.classList.remove('neo-on', 'neo-orb-away'); };
  }, []);
}
