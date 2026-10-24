// With Groups on, the sidebar stays narrow and slides out over the page while
// pointed at (w-dcaa2c122e). It holds the Groups row and no groups: a group
// is picked on the Groups page.
import type { GroupChoice } from './GroupList';
import { GroupMark } from './GroupList';
import { I } from './icons';

/** Named groups first, your pinned one leading, then chats as they come. */
export function groupsInOrder<T extends GroupChoice>(groups: readonly T[]): T[] {
  const named = groups.filter((g) => !g.faces.length).sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name));
  return [...named, ...groups.filter((g) => g.faces.length)];
}

/** The sidebar's Groups row, lit while a group or the Groups page is up. */
export function SidebarGroups({ onGroupsPage, onGroups }: { onGroupsPage: boolean; onGroups: () => void }) {
  return <nav className="workspace-tabs gt-rail-groups" aria-label="Groups">
    <button type="button" className={`workspace-tab${onGroupsPage ? ' active' : ''}`} aria-label="Groups" title="Groups" onClick={onGroups}>{I.groupNav()}<span>Groups</span></button>
  </nav>;
}

/** A group's name, with its mark, as the title over its chat. */
export function GroupTitle({ g }: { g: GroupChoice | undefined }) {
  if (!g) return <h1 className="workspace-title">Groups</h1>;
  return <h1 className="workspace-title gt-gtitle">{g.faces.length ? <GroupMark g={g} size={20} /> : <span className="gt-hh">{I.hash(15)}</span>}<span>{g.name}</span></h1>;
}
