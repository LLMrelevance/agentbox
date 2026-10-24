// Which teammates page is up, and the pieces App draws for it: the sidebar
// rows, the title, the right end of the top bar and the page. Kept apart from
// useRooms, whose every field App reads is pinned by its own tests.
import { useState, type ReactNode } from 'react';
import type { Product, TeammatesView } from '../types';
import { TeammatesPage, TeammatesTitle } from './TeammatesPage';
import { TeammatesRail } from './TeammatesRail';

/** 'team' is the team chat, 'roster' the Teammates tab, anything else a teammate's id. */
export type TeammatesOpen = string | null;

export function useTeammates({ view, products, engines, me, onEnter, onOpenThread, onChanged }: {
  view: TeammatesView | null | undefined;
  products: Product[];
  engines: { id: string; label: string }[];
  me: string;
  /** Leave whatever page is up, so this one can be. */
  onEnter: () => void;
  onOpenThread: (product: string, id: string) => void;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState<TeammatesOpen>(null);
  const live = !!view;
  const go = (which: string) => { onEnter(); setOpen(which); };
  const leave = () => setOpen(null);
  const known = open === 'team' || open === 'roster' || !!view?.list.some((t) => t.id === open);
  const shownOpen = live && open && known ? open : null;
  const railLit = shownOpen === 'roster' ? 'team' : shownOpen;
  const page: ReactNode = shownOpen && view
    ? <TeammatesPage view={view} open={shownOpen} products={products} engines={engines} me={me}
        onTab={(tab) => setOpen(tab)} onOpenTeammate={go} onOpenThread={onOpenThread} onChanged={onChanged} />
    : null;
  return {
    live,
    open: shownOpen,
    go,
    leave,
    rail: (lit: boolean) => (live ? <TeammatesRail team={view!.list} open={lit ? railLit : null} onOpen={go} /> : null),
    title: shownOpen ? <TeammatesTitle view={view ?? null} open={shownOpen} /> : null,
    right: shownOpen && shownOpen !== 'roster' && view?.list.length ? <div className="th-right"><button type="button" className="th-new" onClick={() => setOpen('roster')}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>New teammate</button></div> : null,
    page,
  };
}
