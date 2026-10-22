// A room's board: the Inbox board's columns, each thread a face with the
// person's name over its title, so a whole room can be taken in at once. No
// project and no boxes, and no Later column unless the View menu asks for it.
import { useContext, useMemo, type CSSProperties } from 'react';
import type { Product, ThreadCard, ThreadStateWord, WorkItem } from '../../types';
import { boardColumns, DEFAULT_COLUMN_ORDER, type Display } from '../../threads/page-rules';
import { LiveContext, StateGlyph } from '../../threads/Pages';
import { LiveMark } from '../../components/LiveMark';
import { Face, TeamContext, firstName } from '../people';

export function RoomBoard({ items, products, display, now, stateOf, cards, picked, projectOrder, columnOrder = DEFAULT_COLUMN_ORDER, later = false, onOpenItem, onOpenCard }: {
  items: WorkItem[]; products: Product[]; display: Display; now: number;
  stateOf?: (item: WorkItem) => ThreadStateWord | null;
  cards: ThreadCard[]; picked: string[]; projectOrder?: string[]; columnOrder?: ThreadStateWord[];
  later?: boolean;
  onOpenItem: (item: WorkItem) => void; onOpenCard: (card: ThreadCard) => void;
}) {
  const live = useContext(LiveContext);
  const team = useContext(TeamContext);
  const me = team?.me ?? null;
  const columns = useMemo(
    () => boardColumns({
      items, products, display, now, stateOf, cards, picked, me, since: team?.state.since ?? null, live, projectOrder,
      order: later ? columnOrder : columnOrder.filter((s) => s !== 'scheduled'),
      nameOf: (id) => firstName(team?.byId.get(id) ?? null),
    }),
    [items, products, display, now, stateOf, cards, picked, me, team, live, columnOrder, later, projectOrder],
  );
  return <div className="rm-board" style={{ '--cols': columns.length } as CSSProperties}>
    {columns.map((col) => {
      // A conversation with someone is not work the room is doing.
      const rows = col.rows.filter((e) => !e.message);
      return <div key={col.state} className="rm-bcol">
        <div className="th-col-h">{col.state === 'running' ? <LiveMark /> : <StateGlyph state={col.state} />}{col.label}<b>{rows.length}</b></div>
        {rows.length === 0 && <div className="rm-bnone">Nothing here.</div>}
        {rows.map((e) => {
          const person = e.ownerId ? team?.byId.get(e.ownerId) ?? null : null;
          const mine = !!me && e.ownerId === me;
          return <button type="button" key={e.key} className={`rm-brow ${col.state}`} title={e.title ?? undefined}
            onClick={() => { if (e.item) onOpenItem(e.item); else if (e.card) onOpenCard(e.card); }}>
            <Face person={person} me={mine} />
            <span className="txt"><span className="who">{mine ? 'You' : firstName(person)}</span><span className="t">{e.title ?? 'A thread'}</span></span>
          </button>;
        })}
      </div>;
    })}
  </div>;
}
