// With Groups on, the sidebar stays narrow and widens over the page while
// pointed at (w-dcaa2c122e). Under Inbox it holds Groups and, while wide,
// every group by name.
import type { GroupChoice } from './GroupList';
import { GroupMark } from './GroupList';
import { I } from './icons';

/** Named groups first, your pinned one leading, then chats as they come. */
export function groupsInOrder(groups: readonly GroupChoice[]): GroupChoice[] {
  const named = groups.filter((g) => !g.faces.length).sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name));
  return [...named, ...groups.filter((g) => g.faces.length)];
}

/** The sidebar's Groups row, and every group under it, shown while the sidebar is wide. */
export function SidebarGroups({ onGroupsPage, current, groups, onGroups, onPick }: {
  onGroupsPage: boolean; current: string | null; groups: readonly GroupChoice[]; onGroups: () => void; onPick: (key: string) => void;
}) {
  return <nav className="workspace-tabs gt-rail-groups gt-rail-quiet" aria-label="Groups">
    <button type="button" className={`workspace-tab${onGroupsPage ? ' active' : ''}`} aria-label="Groups" onClick={onGroups}>{I.groupNav()}<span>Groups</span></button>
    <div className="gt-rail-list">{groupsInOrder(groups).map((g) => {
      const on = onGroupsPage && g.key === current;
      return <button type="button" key={g.key} className={`workspace-tab gt-rail-row${on ? ' active' : ''}${g.unread && !on ? ' unread' : ''}`} aria-label={g.name} title={g.name} onClick={() => onPick(g.key)}>
        <i className="gt-rail-ic">{g.faces.length ? <GroupMark g={g} size={18} /> : I.hash(14)}</i><span className="rm-one">{g.name}</span>{g.unread && !on && <i className="gt-rail-dot" aria-label="Unread" />}</button>;
    })}</div>
  </nav>;
}

/** A group's name, with its mark, as the title over its chat. */
export function GroupTitle({ g }: { g: GroupChoice | undefined }) {
  if (!g) return <h1 className="workspace-title">Groups</h1>;
  return <h1 className="workspace-title gt-gtitle">{g.faces.length ? <GroupMark g={g} size={20} /> : <span className="gt-hh">{I.hash(15)}</span>}<span>{g.name}</span></h1>;
}
