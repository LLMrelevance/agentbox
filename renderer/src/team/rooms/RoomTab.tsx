// The Groups tab, after Done: it holds whichever group was open last, and
// its arrow lists every group to switch to.
import { I } from './icons';
import { useOutside } from './RoomsPage';
import { GroupMenuList, type GroupChoice } from './GroupList';

export function GroupsTab({ count, on = false, open, onOpen, onMenu }: {
  /** Groups with something unread. */
  count: number;
  on?: boolean;
  open: boolean; onOpen: () => void; onMenu: (at: DOMRect) => void;
}) {
  return <>
    <span className="rm-sep" aria-hidden="true" />
    <span className={`tm-tab rm-tab${on ? ' on' : ''}`}>
      <button type="button" className="rm-tabname" data-hint="state-tab" onClick={onOpen}>Groups{count > 0 && <b>{count}</b>}</button>
      <button type="button" className={`rm-tabpick${open ? ' open' : ''}`} aria-label="Every group" title="Every group"
        onClick={(e) => onMenu((e.currentTarget.parentElement ?? e.currentTarget).getBoundingClientRect())}>{I.down()}</button>
    </span>
  </>;
}

export function GroupsTabMenu({ groups, current, at, onPick, onClose }: {
  groups: GroupChoice[]; current: string | null; at: Pick<DOMRect, 'left' | 'bottom'>;
  onPick: (key: string) => void; onClose: () => void;
}) {
  const ref = useOutside(onClose);
  // Hangs from the start of the tab, as long as it stays inside the window.
  const left = Math.max(8, Math.min(at.left, (typeof window === 'undefined' ? Infinity : window.innerWidth) - 368));
  return <div ref={ref} className="rm-menu rm-pop rm-tabmenu gr-menu" role="menu" style={{ left, top: at.bottom + 6 }}>
    <GroupMenuList groups={groups} current={current} onPick={onPick} />
  </div>;
}
