// Rooms in the app (alpha), drawn as Groups: the Groups tab after Done and the
// group open in it, a person's page, everyone's threads, Find groups and the
// dialogs, in one place so App.tsx only places them.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../../api';
import type { Room, RoomMention, RoomsState, ThreadCard } from '../../types';
import './rooms.css';
import { boardPeople, boardPicked, cardName, chatPeople, groupInTab, mentionRows, readBoardLater, readBoardPicks, readRoomTab, withMe, writeBoardLater, writeBoardPicks, writeRoomTab, type MentionRow } from './room-rules';
import { BoardFaces, RoomViewButton } from './RoomView';
import { GroupsTab, GroupsTabMenu } from './RoomTab';
import { landed, sameMessages } from './room-chat-rules';
import { RoomPage, type RoomPane } from './RoomPage';
import { RoomChat } from './RoomChat';
import { I } from './icons';
import type { Conversation } from './MessagesPage';
import { roomConversations } from './conversations';
import { FindRooms, type ListedRoom } from './FindRooms';
import { InviteDialog, JoinDialog, MembersMenu, StartRoomDialog, type Preview, type Sent } from './RoomDialogs';
import { joinLink, tokenFromLink } from '../../../../shared/room-links.mjs';
import { RoomsNotReady, RoomsSettings } from './RoomsSettings';
import { GroupPage, PeoplePanel } from './GroupPage';
import { GroupBar, GroupMenuButton, groupChoices, type GroupMenuAction } from './GroupList';
import { DigestCard, FeedList, GroupTitle, GroupsDoor, GroupsInSidebar, SideTabs, Ticker, TodayBelow, finishedLine, finishedToday, trial, type Done } from './GroupTrials';

type Dialog =
  | { kind: 'invite'; roomId: string }
  | { kind: 'start' }
  | { kind: 'join'; token: string; preview: Preview | null }
  | null;

type Direct = Conversation & { people: string[] };

/** A named group's name, or the people in a chat. */
const nameOf = (r: Room) => (r.kind === 'group' ? r.wall.filter((c) => !c.me).map(cardName).join(', ') || r.name : r.name);

export function useRooms({ rooms, on, meId, myName, fullName = '', hasTeam, teamCards = [], directs = [], now, toast, onOpenDirect, onTeamMessage, onLeavePage, renderBoard, renderPersonBoard }: {
  rooms: RoomsState | null | undefined; on: boolean; meId: string | null; myName: string; fullName?: string; hasTeam: boolean; teamCards?: ThreadCard[];
  /** Teammates' direct records, listed among the groups as chats of their own. */
  directs?: Direct[];
  now: number; toast: (text: string) => void;
  /** Open a direct record, in its own view. */
  onOpenDirect: (id: string) => void;
  /** Message teammates the way the team version already does. */
  onTeamMessage: (personIds: string[]) => void;
  /** Leave whatever covers the rooms: an open thread or direct chat, the Team page, search. */
  onLeavePage: () => void;
  /** The room's board, for these people's threads. */
  renderBoard?: (people: string[], opts: { later: boolean }) => ReactNode;
  /** The Inbox's board, for the Today's activity tab on a person's page. */
  renderPersonBoard?: (people: string[]) => ReactNode;
}) {
  const live = on && !!rooms?.on;
  const all = live ? rooms!.rooms : [];
  const list = all.filter((r) => r.kind !== 'group');
  const [openId, setOpenId] = useState<string | null>(null);
  const [pane, setPane] = useState<RoomPane>('wall');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [boardPicks, setBoardPicks] = useState<Record<string, string[]>>(() => readBoardPicks());
  const [later, setLaterRaw] = useState(() => readBoardLater());
  // The group the Groups tab holds: whichever was open last.
  const [lastId, setLastId] = useState<string | null>(() => readRoomTab());
  const [tabMenu, setTabMenu] = useState<DOMRect | null>(null);
  // Everyone's threads in the open group, one step in from its chat.
  const [boardOn, setBoardOn] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [members, setMembers] = useState<{ roomId: string; at: DOMRect } | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [finding, setFinding] = useState(false);
  const [t] = useState(trial);
  // The Groups tab with no group to open.
  const [empty, setEmpty] = useState(false);
  const open = openId ? all.find((r) => r.id === openId) ?? null : null;
  const invisibleUntil = Date.parse(rooms?.me?.invisible_until ?? '');

  // A room I left, or was removed from, closes. One just joined or made may
  // not be in the snapshot yet, so only a room that was there and went closes.
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (open) seen.current = open.id;
    else if (openId && seen.current === openId && live && rooms?.ready) { seen.current = null; setOpenId(null); }
  }, [openId, live, rooms?.ready, open]);
  useEffect(() => { if (!live) { setOpenId(null); setDialog(null); setMembers(null); setFinding(false); setEmpty(false); } }, [live]);
  useEffect(() => { setPicked(new Set()); setBoardOn(false); }, [openId]);

  const call = useCallback(async <T,>(op: string, ...args: unknown[]): Promise<{ ok: boolean; value?: T; error?: string }> => {
    const res = await api.rooms<T>(op, ...args);
    return res.ok ? { ok: true, value: res.value } : { ok: false, error: res.error };
  }, []);

  const linkFor = useCallback(async (roomId: string) => {
    if (links[roomId]) return links[roomId];
    const res = await call<string>('link', roomId);
    if (res.ok && res.value) { setLinks((l) => ({ ...l, [roomId]: res.value! })); return res.value; }
    return null;
  }, [links, call]);

  // The link under a room that is only you, and in the invite dialog.
  const needLink = open && open.members <= 1 && open.kind !== 'group' && !open.inviteOnly ? open.id : dialog?.kind === 'invite' ? dialog.roomId : null;
  useEffect(() => { if (needLink && !links[needLink]) void linkFor(needLink); }, [needLink]); // eslint-disable-line react-hooks/exhaustive-deps

  const copyLink = async (roomId: string) => {
    const token = await linkFor(roomId);
    if (!token) { toast('Could not make a link'); return; }
    try { await navigator.clipboard.writeText(joinLink(token)); toast('Link copied'); } catch { toast(joinLink(token)); }
  };

  // Every group opens in the Groups tab, which then holds it.
  const openRoom = (id: string) => {
    onLeavePage(); setFinding(false); setEmpty(false); setOpenId(id); setPane('wall'); setBoardOn(false);
    setLastId(id); writeRoomTab(id);
  };
  // One step back: from everyone's threads, Find groups or a person's page to the group; from the group out.
  const close = () => {
    if (finding) { setFinding(false); return; }
    if (boardOn) { setBoardOn(false); return; }
    if (pane !== 'wall') { setPane('wall'); return; }
    setOpenId(null); setEmpty(false);
  };
  // Somewhere else was picked: no group, no Find groups.
  const leave = () => { setOpenId(null); setFinding(false); setEmpty(false); setBoardOn(false); };
  const find = () => { onLeavePage(); setFinding(true); };
  const loadListed = useCallback(async () => { const res = await call<ListedRoom[]>('listed'); return res.ok ? res.value ?? [] : null; }, [call]);
  const inviteId = dialog?.kind === 'invite' ? dialog.roomId : null;
  const loadSent = useCallback(async () => {
    if (!inviteId) return null;
    const res = await call<Sent[]>('invitesSent', inviteId);
    return res.ok ? res.value ?? [] : null;
  }, [call, inviteId]);

  const tabbed = live ? groupInTab(all, lastId) : null;
  const openTab = () => {
    if (tabbed) { openRoom(tabbed.id); return; }
    onLeavePage(); setOpenId(null); setFinding(false); setEmpty(true);
  };

  // A link pasted or opened: show the room first, join on a yes.
  const join = useCallback(async (text: string) => {
    const token = tokenFromLink(text);
    if (!token) return false;
    const res = await call<Preview | null>('preview', token);
    setDialog({ kind: 'join', token, preview: res.ok ? res.value ?? null : null });
    return true;
  }, [call]);

  // MESSAGE SOMEONE FROM A GROUP. Teammates already have direct records, with
  // their agents and threads, so they keep using them. Anyone else is a small
  // group chat, the same one each time for the same people, opened in the tab.
  const message = async (ids: string[], from: Room | null) => {
    const people = [...new Set(ids)].filter((id) => id !== meId);
    if (!people.length) return;
    const cards = new Map((from ?? open)?.wall.map((c) => [c.id, c]) ?? []);
    if (people.every((id) => cards.get(id)?.teammate)) { onTeamMessage(people); return; }
    const want = new Set([meId, ...people]);
    const group = all.find((r) => r.kind === 'group' && r.members === want.size && r.wall.every((c) => want.has(c.id)) && people.every((id) => r.wall.some((c) => c.id === id)));
    let id = group?.id ?? null;
    if (!id) {
      const name = people.map((p) => cards.get(p)?.name ?? 'Someone').join(', ').slice(0, 40);
      const res = await call<string>('create', { name, kind: 'group', people });
      if (!res.ok || !res.value) { toast(res.error ?? 'Could not start the chat'); return; }
      id = res.value;
    }
    openRoom(id);
  };

  // A SEND TRIED AGAIN AFTER A DROPPED CONNECTION may already have landed: the
  // room had it and only the answer was lost. Then it is not sent twice.
  const tried = useRef(new Map<string, Set<string>>());
  const send = (roomId: string) => async (body: string, opts: { inReplyTo: string | null; mentions: string[] }) => {
    const key = `${roomId}\u0000${opts.inReplyTo ?? ''}\u0000${body}`;
    const mine = { by: meId, body, inReplyTo: opts.inReplyTo };
    const before = tried.current.get(key);
    if (before) {
      // Looked at afresh: what this window held may be from before the drop.
      const fresh = await api.rooms('refresh');
      const held = (fresh.rooms ?? rooms)?.messages[roomId] ?? [];
      if (landed(held, { ...mine, before })) { tried.current.delete(key); return null; }
    } else {
      tried.current.set(key, new Set(sameMessages(rooms?.messages[roomId] ?? [], mine).map((m) => m.id)));
    }
    const res = await call('send', roomId, body, opts);
    if (res.ok) tried.current.delete(key);
    return res.ok ? null : res.error ?? 'Not sent';
  };
  const read = (r: Room) => () => { if (r.unread > 0 || r.markedUnread) void call('markRead', r.id); };
  // Everything else a room's chat can do to a message, or to the room.
  const chatCalls = (r: Room) => ({
    onReact: (messageId: string, emoji: string, on: boolean) => {
      void call('react', r.id, messageId, emoji, on).then((res) => { if (!res.ok) toast(res.error ?? 'That reaction did not save'); });
    },
    onEdit: async (messageId: string, body: string, mentions: string[]) => {
      const res = await call('edit', r.id, messageId, body, { mentions });
      return res.ok ? null : res.error ?? 'That change did not save';
    },
    onDelete: (messageId: string) => {
      void call('deleteMessage', r.id, messageId).then((res) => { if (!res.ok) toast(res.error ?? 'Not deleted'); });
    },
    onMarkUnread: (at: number) => {
      void call('markUnread', r.id, at).then((res) => toast(res.ok ? 'Marked unread' : res.error ?? 'Not marked unread'));
    },
    onPutFile: async (name: string, dataBase64: string) => {
      const res = await call('putFile', r.id, { name, dataBase64 });
      return res.ok ? null : res.error ?? 'That file did not send';
    },
    loadFile: async (name: string) => {
      const res = await call<string | null>('file', r.id, name);
      if (!res.ok || !res.value) return null;
      return new Blob([Uint8Array.from(atob(res.value), (c) => c.charCodeAt(0))]);
    },
    onNotice: toast,
  });

  // Every group and every chat, a teammate's direct record among them, each its own.
  const conversations: Conversation[] = live ? [...roomConversations(rooms), ...directs] : [];
  const pinned = new Set(all.filter((r) => r.teamId || r.pinned).map((r) => `room:${r.id}`));
  const groupList = groupChoices(conversations, pinned);
  const unreadChats = conversations.filter((c) => c.unread).length;
  // A direct record opens over the group, so stepping out of it comes back here.
  const pickGroup = (key: string) => {
    if (key.startsWith('direct:')) onOpenDirect(key.slice('direct:'.length));
    else openRoom(key.slice('room:'.length));
  };

  const groupAction = async (r: Room, a: GroupMenuAction, at: DOMRect) => {
    if (a === 'board') setBoardOn(true);
    if (a === 'invite') setDialog({ kind: 'invite', roomId: r.id });
    if (a === 'members') setMembers({ roomId: r.id, at });
    if (a === 'new') setDialog({ kind: 'start' });
    if (a === 'find') find();
    if (a === 'mute' || a === 'unmute') { await call('mute', r.id, a === 'mute'); toast(a === 'mute' ? `${nameOf(r)} is muted` : `${nameOf(r)} is not muted any more`); }
    if (a === 'leave') {
      const res = await call('leave', r.id);
      toast(res.ok ? `You left ${nameOf(r)}` : res.error ?? 'Could not leave');
      if (!res.ok) return;
      const next = groupInTab(all.filter((x) => x.id !== r.id), null);
      if (next) openRoom(next.id); else { setOpenId(null); setEmpty(true); }
    }
  };

  const meInChat = meId ? { id: meId, name: rooms?.me?.display_name || myName, avatarUrl: rooms?.me?.avatar_url ?? null, me: true } : null;
  const backTitle = (title: string) => <h1 className="workspace-title">
    <button type="button" className="rm-backt" title="Back (esc)" onClick={close}>{I.back()}<span>{title}</span></button></h1>;
  // A page of its own takes the top bar's title and hides the state tabs.
  // `right` undefined keeps the bar's own buttons; null clears them.
  let heading: { title: ReactNode; right?: ReactNode } | null = null;
  let page: ReactNode = null;
  const onChat = !!open && !!rooms && pane === 'wall' && !boardOn && !finding;
  // Everyone's threads: the board of the people here whose threads reach me. Never for a chat with people.
  const onRoom = !!open && !!rooms && open.kind !== 'group' && pane === 'wall' && boardOn && !finding;
  const onBoardPeople = onRoom ? boardPeople(open!.wall) : [];
  const onBoardIds = new Set(onBoardPeople.map((c) => c.id));
  const onBoardPicked = onRoom ? boardPicked(boardPicks[open!.id], open!.wall) : [];
  const pickForBoard = (ids: string[]) => {
    if (!open) return;
    const next = { ...boardPicks, [open.id]: ids };
    setBoardPicks(next);
    writeBoardPicks(next);
  };
  const setLater = (shown: boolean) => { setLaterRaw(shown); writeBoardLater(shown); };
  const board = onRoom && renderBoard
    ? <><BoardFaces people={open!.wall} picked={onBoardPicked} onPick={pickForBoard} />{renderBoard(onBoardPicked.filter((id) => onBoardIds.has(id)), { later })}</>
    : null;
  const viewButton: ReactNode = onRoom && renderBoard
    ? <RoomViewButton people={open!.wall} picked={onBoardPicked} onPick={pickForBoard} unseen={open!.wall.length - onBoardPeople.length} later={later} onLater={setLater} />
    : onChat ? <GroupMenuButton named={open!.kind !== 'group'} members={open!.members} muted={open!.muted} canLeave={!open!.teamId}
      board={open!.kind !== 'group' && !!renderBoard} onPick={(a, at) => void groupAction(open!, a, at)} />
    : null;
  if (finding && live) {
    heading = {
      title: backTitle('Find groups'),
      right: <div className="th-right"><button type="button" className="th-new" onClick={() => setDialog({ kind: 'start' })}>{I.plus()}New group</button></div>,
    };
    page = <div className="rm-split"><div className="rm-main wide"><FindRooms load={loadListed} onOpen={(id) => openRoom(id)} onLink={(t) => void join(t)}
      onJoin={async (id) => { const res = await call<string>('joinListed', id); return res.ok ? null : res.error ?? 'Could not join'; }} /></div></div>;
  } else if (empty && live) {
    page = <div className="rm-empty gr-none"><span className="t">You are not in any groups yet.</span>
      <span className="s">Start one for the people you work with, or find one to join.</span>
      <div className="gr-none-acts"><button type="button" className="rm-btn go" onClick={() => setDialog({ kind: 'start' })}>{I.plus()}New group</button>
        <button type="button" className="rm-btn" onClick={find}>{I.search()}Find groups to join</button></div></div>;
  } else if (open && rooms && onChat) {
    const done = finishedToday(open, teamCards, now);
    const people = (head?: ReactNode) => <PeoplePanel room={open} onPerson={(id) => setPane(`person:${id}`)} head={head}
      under={t.feed === 'person' ? (c) => finishedLine(c, done) : undefined} after={t.feed === 'below' ? <TodayBelow room={open} done={done} now={now} /> : undefined} />;
    const bar = <GroupBar groups={groupList} current={`room:${open.id}`} onPick={pickGroup} />;
    page = <GroupPage key={open.id} big={t.big}
      bar={t.top === 'doors-chips' || t.top === 'sidebar' ? null : bar}
      chat={<RoomChat room={open} messages={rooms.messages[open.id] ?? []} people={withMe(chatPeople(open, meId), meInChat)} meId={meId} now={now}
        full hang head={<></>} onSend={send(open.id)} onRead={read(open)} {...chatCalls(open)}
        inserts={t.feed === 'digest' ? digests(open, done, now) : undefined} aboveBox={t.feed === 'ticker' ? <Ticker room={open} done={done} now={now} /> : undefined} />}
      people={t.feed === 'tabs' ? <SideTabs people={people} today={<FeedList room={open} done={done} now={now} limit={12} />} count={done.length} /> : people()} />;
    if (t.top === 'doors-chips') heading = { title: <div className="gt-topchips">{bar}</div> };
    if (t.top === 'doors-title' || t.top === 'switch') heading = { title: <h1 className="workspace-title">Groups</h1> };
    if (t.top === 'sidebar') heading = { title: <GroupTitle g={groupList.find((g) => g.key === `room:${open.id}`)} /> };
  } else if (open && rooms) {
    heading = { title: backTitle(nameOf(open)) };
    page = <RoomPage room={open} rooms={list} cards={teamCards} ranks={rooms.ranks ?? {}} me={rooms.me} now={now}
      pane={pane} link={links[open.id] ?? null} onPane={setPane} chat={null} board={board} renderBoard={renderPersonBoard}
      picked={picked} onPick={(ids) => setPicked(new Set(ids))} onMessage={(ids) => void message(ids, open)}
      onRoom={(id) => openRoom(id)}
      onSaveBio={async (bio) => { const res = await call('saveProfile', { bio }); return res.ok ? null : res.error ?? 'Your bio did not save'; }}
      onComeBack={() => void call('comeBack')} onCopyLink={() => void copyLink(open.id)} />;
  }

  const inTab = live && !finding && !t.top && (onChat || (empty && !open));
  const roomTab: ReactNode = live && !t.top
    ? <GroupsTab count={unreadChats} on={inTab} open={!!tabMenu} onOpen={openTab} onMenu={(at) => setTabMenu(tabMenu ? null : at)} />
    : null;
  const inviteRoom = dialog?.kind === 'invite' ? all.find((r) => r.id === dialog.roomId) : null;
  const membersRoom = members ? all.find((r) => r.id === members.roomId) : null;
  const dialogs: ReactNode = <>
    {tabMenu && live && <GroupsTabMenu groups={groupList} current={open ? `room:${open.id}` : null} at={tabMenu} onClose={() => setTabMenu(null)}
      onPick={(key) => { setTabMenu(null); pickGroup(key); }} />}
    {inviteRoom && <InviteDialog room={inviteRoom} link={links[inviteRoom.id] ?? null} now={now} onClose={() => setDialog(null)} loadSent={loadSent}
      onCopy={() => void copyLink(inviteRoom.id)}
      onEmail={async (email) => { const res = await call('invite', inviteRoom.id, email); return res.ok ? null : res.error ?? 'Not sent'; }} />}
    {dialog?.kind === 'start' && <StartRoomDialog canList={hasTeam} onClose={() => setDialog(null)} onFind={finding ? undefined : () => { setDialog(null); find(); }}
      onStart={async ({ name, who }) => {
        const res = await call<string>('create', { name, listed: who === 'everyone', inviteOnly: who === 'invite' });
        if (!res.ok) return res.error ?? 'Could not start the room';
        setDialog(null);
        if (res.value) openRoom(res.value);
        return null;
      }} />}
    {dialog?.kind === 'join' && <JoinDialog preview={dialog.preview} myName={myName} onClose={() => setDialog(null)}
      onJoin={async () => {
        const res = await call<string>('joinByLink', dialog.token);
        if (!res.ok) return res.error ?? 'Could not join';
        setDialog(null);
        if (res.value) openRoom(res.value);
        return null;
      }} />}
    {membersRoom && members && <MembersMenu room={membersRoom} at={members.at} onClose={() => setMembers(null)}
      onInvite={() => { setMembers(null); setDialog({ kind: 'invite', roomId: membersRoom.id }); }}
      onPerson={(id) => { setMembers(null); openRoom(membersRoom.id); setPane(`person:${id}`); }} />}
  </>;

  const invisible = live && rooms?.me ? {
    on: invisibleUntil > now,
    onGo: (minutes: number | null) => { void call('goInvisible', minutes); },
    onComeBack: () => { void call('comeBack'); },
  } : null;

  // The Settings page: your card as your first room shows it.
  const first = list.find((r) => r.pinned) ?? list[0] ?? null;
  const settingsPane: ReactNode = live && rooms?.me ? <RoomsSettings me={rooms.me} fullName={fullName} now={now}
    roomName={first?.name ?? null} card={first?.wall.find((c) => c.me) ?? null}
    save={(patch) => { void call('saveProfile', patch); }}
    goInvisible={(minutes) => { void call('goInvisible', minutes); }}
    comeBack={() => { void call('comeBack'); }} /> : live ? <RoomsNotReady error={rooms?.error ?? null} /> : undefined;

  // Needs you counts these rows too, so a run of messages counts once.
  const mentions: MentionRow[] = live ? mentionRows(rooms!.mentions) : [];
  const faces = new Map(all.flatMap((r) => r.wall.map((c) => [c.id, c.avatarUrl] as const)));
  const openMention = (m: RoomMention) => openRoom(m.roomId);

  return {
    live, openId: !live ? null : finding ? 'find' : open ? openId : empty ? 'groups' : null,
    open: (id: string) => openRoom(id), close, leave, page, dialogs, roomTab, join, invisible, settingsPane,
    /** A group, or the Groups tab with none, is open under the tabs, which stay over it with Groups lit. */
    inTab,
    /** Tab walks onto the Groups tab after Done. */
    groupsTab: live, openTab,
    mentions, openMention, faces, heading,
    dialogOpen: !!dialog || !!members,
    /** The header's View button over everyone's threads, and B; on a group's chat, its options. Null anywhere else. */
    viewButton,
    /** Trial (round 11): where the Inbox's tabs and the groups go. */
    trialTop: live ? t.top : null,
    trialNav: !live ? null : t.top === 'doors-chips' || t.top === 'doors-title'
      ? <GroupsDoor lit={(!!open || empty) && !finding} count={unreadChats} onOpen={openTab} />
      : t.top === 'sidebar' ? <GroupsInSidebar groups={groupList} current={open && !finding ? `room:${open.id}` : null} onPick={pickGroup} /> : null,
    unreadChats,
    /** The group a teammate's card was opened over, for its Back. */
    roomName: open ? nameOf(open) : null,
  };
}

/** Trial (round 11): finished work in two-hour windows, each one card placed where its window ends. */
function digests(room: Room, done: Done[], now: number): { at: number; key: string; node: ReactNode }[] {
  const windows = new Map<number, Done[]>();
  for (const d of done) {
    const start = new Date(d.at); start.setMinutes(0, 0, 0); start.setHours(start.getHours() - (start.getHours() % 2));
    windows.set(start.getTime(), [...(windows.get(start.getTime()) ?? []), d]);
  }
  return [...windows.entries()].sort((a, b) => a[0] - b[0]).map(([since, list]) => ({
    at: Math.min(since + 2 * 3_600_000, now), key: `digest:${since}`,
    node: <DigestCard room={room} done={list} now={now} since={since} />,
  }));
}
