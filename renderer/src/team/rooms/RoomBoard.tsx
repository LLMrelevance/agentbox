// A room's board: the Inbox board's columns, each thread one line with whose
// it is, so a whole room can be taken in at once. No project and no boxes.
import { useContext, useMemo } from 'react';
import type { Product, ThreadCard, ThreadStateWord, WorkItem } from '../../types';
import { boardColumns, DEFAULT_COLUMN_ORDER, type Display } from '../../threads/page-rules';
import { LiveContext, StateGlyph } from '../../threads/Pages';
import { LiveMark } from '../../components/LiveMark';
import { Face, TeamContext, firstName } from '../people';

export function RoomBoard({ items, products, display, now, stateOf, cards, picked, projectOrder, columnOrder = DEFAULT_COLUMN_ORDER, onOpenItem, onOpenCard }: {
  items: WorkItem[]; products: Product[]; display: Display; now: number;
  stateOf?: (item: WorkItem) => ThreadStateWord | null;
  cards: ThreadCard[]; picked: string[]; projectOrder?: string[]; columnOrder?: ThreadStateWord[];
  onOpenItem: (item: WorkItem) => void; onOpenCard: (card: ThreadCard) => void;
}) {
  const live = useContext(LiveContext);
  const team = useContext(TeamContext);
  const me = team?.me ?? null;
  const columns = useMemo(
    () => boardColumns({ items, products, display, now, stateOf, cards, picked, me, since: team?.state.since ?? null, live, order: columnOrder, projectOrder, nameOf: (id) => firstName(team?.byId.get(id) ?? null) }),
    [items, products, display, now, stateOf, cards, picked, me, team, live, columnOrder, projectOrder],
  );
  return <div className="rm-board">
    {columns.map((col) => {
      // A conversation with someone is not work the room is doing.
      const rows = col.rows.filter((e) => !e.message);
      return <div key={col.state} className="rm-bcol">
        <div className="th-col-h">{col.state === 'running' ? <LiveMark /> : <StateGlyph state={col.state} />}{col.label}<b>{rows.length}</b></div>
        {rows.length === 0 && <div className="rm-bnone">Nothing here.</div>}
        {rows.map((e) => {
          const person = e.ownerId ? team?.byId.get(e.ownerId) ?? null : null;
          const mine = !!me && e.ownerId === me;
          return <button type="button" key={e.key} className={`rm-brow ${col.state}`}
            onClick={() => { if (e.item) onOpenItem(e.item); else if (e.card) onOpenCard(e.card); }}>
            <span className="t">{e.title ?? 'A thread'}</span>
            <span className="who"><Face person={person} me={mine} /><span>{mine ? 'You' : firstName(person)}</span></span>
          </button>;
        })}
      </div>;
    })}
  </div>;
}
