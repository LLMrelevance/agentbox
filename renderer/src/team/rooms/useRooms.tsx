// Rooms in the app (alpha): which room is open, the sidebar's Rooms row, the
// Rooms page, a room's page, the messages page and the dialogs, in one place
// so App.tsx only places them.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../../api';
import type { Room, RoomMention, RoomsState, ThreadCard } from '../../types';
import { RoomsPage, useOutside, type RoomMenuAction } from './RoomsPage';
import { boardPeople, boardPicked, cardName, chatPeople, readBoardLater, readBoardPicks, readRoomView, whereChatOpens, withMe, writeBoardLater, writeBoardPicks, writeRoomView, type RoomView } from './room-rules';
import { BoardFaces, RoomViewButton } from './RoomView';
import { landed, sameMessages } from './room-chat-rules';
import { RoomPage, type RoomPane } from './RoomPage';
import { RoomChat } from './RoomChat';
import { RoomFace } from './RoomFace';
import { I } from './icons';
import { FullChatHead, MessagesPage, sortConversations, type Conversation, type ConversationAction } from './MessagesPage';
import { roomConversations } from './conversations';
import { FindRooms, type ListedRoom } from './FindRooms';
import { InviteDialog, JoinDialog, MembersMenu, StartRoomDialog, type Preview, type Sent } from './RoomDialogs';
import { joinLink, tokenFromLink } from '../../../../shared/room-links.mjs';
import { RoomsNotReady, RoomsSettings } from './RoomsSettings';
import { GroupPage, NowLines, TitleFaces, groupEvents, readGroupLook, readWovenLook } from './GroupPage';

type Dialog =
  | { kind: 'invite'; roomId: string }
  | { kind: 'start' }
  | { kind: 'join'; token: string; preview: Preview | null }
  | null;

type Direct = Conversation & { people: string[] };

export function useRooms({ rooms, on, meId, myName, fullName = '', hasTeam, teamCards = [], directs = [], now, toast, onOpenDirect, onDirectRead, onTeamMessage, onLeavePage, renderBoard, renderPersonBoard }: {
  rooms: RoomsState | null | undefined; on: boolean; meId: string | null; myName: string; fullName?: string; hasTeam: boolean; teamCards?: ThreadCard[];
  /** Direct records, for the messages page and the chat switcher. */
  directs?: Direct[];
  now: number; toast: (text: string) => void;
  /** Open a direct record (its own view, on the messages page). */
  onOpenDirect: (id: string) => void;
  /** Mark a direct record read, or unread. */
  onDirectRead?: (id: string, read: boolean) => void;
  /** Message teammates the way the team version already does. */
  onTeamMessage: (personIds: string[]) => void;
  /** Leave whatever covers the rooms: an open thread or direct chat, the Team page, search. */
  onLeavePage: () => void;
  /** The room's board, for these people's threads. */
  renderBoard?: (people: string[], opts: { later: boolean }) => ReactNode;
  /** The Inbox's board, for one person's Activity tab on their page. */
  renderPersonBoard?: (people: string[]) => ReactNode;
}) {
  const live = on && !!rooms?.on;
  const all = live ? rooms!.rooms : [];
  // Groups are chats: they live on the messages page and in the switcher, not on the Rooms page.
  const list = all.filter((r) => r.kind !== 'group');
  const [openId, setOpenId] = useState<string | null>(null);
  const [pane, setPane] = useState<RoomPane>('wall');
  const [panelId, setPanelId] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [switcher, setSwitcher] = useState<DOMRect | null>(null);
  const [view, setViewRaw] = useState<RoomView>(() => readRoomView());
  const [boardPicks, setBoardPicks] = useState<Record<string, string[]>>(() => readBoardPicks());
  const [later, setLaterRaw] = useState(() => readBoardLater());
  const [dialog, setDialog] = useState<Dialog>(null);
  const [members, setMembers] = useState<{ roomId: string; at: DOMRect } | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [listing, setListing] = useState(false);
  const [finding, setFinding] = useState(false);
  // The Messages row with no conversation yet to open.
  const [noChats, setNoChats] = useState(false);
  // A chat opened full page from a person's page, so Back goes back there.
  const [cameFrom, setCameFrom] = useState<{ roomId: string; pane: RoomPane } | null>(null);
  const [look] = useState(readGroupLook);
  const [woven] = useState(readWovenLook);
  const open = openId ? all.find((r) => r.id === openId) ?? null : null;
  const invisibleUntil = Date.parse(rooms?.me?.invisible_until ?? '');
  const chatRoom = (panelId ? all.find((r) => r.id === panelId) : null) ?? open;

  // A room I left, or was removed from, closes. One just joined or made may
  // not be in the snapshot yet, so only a room that was there and went closes.
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (open) seen.current = open.id;
    else if (openId && seen.current === openId && live && rooms?.ready) { seen.current = null; setOpenId(null); }
  }, [openId, live, rooms?.ready, open]);
  useEffect(() => { if (!live) { setOpenId(null); setDialog(null); setMembers(null); setFull(false); setListing(false); } }, [live]);
  useEffect(() => { setPicked(new Set()); setSwitcher(null); }, [openId]);

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

  const openRoom = (id: string, { asFull = false } = {}) => { onLeavePage(); setListing(false); setFinding(false); setNoChats(false); setOpenId(id); setPane('wall'); setPanelId(null); setFull(asFull); setCameFrom(null); };
  const openRooms = () => { onLeavePage(); setOpenId(null); setFull(false); setPanelId(null); setFinding(false); setNoChats(false); setCameFrom(null); setListing(true); };
  // A room and Find rooms both sit inside the Rooms page, so stepping out of either lands there.
  const close = () => {
    if (listing) { setListing(false); return; }
    if (finding) { setFinding(false); setListing(true); return; }
    if (noChats) { setNoChats(false); return; }
    if (cameFrom) { openRoom(cameFrom.roomId); setPane(cameFrom.pane); return; }
    if (pane !== 'wall') { setPane('wall'); return; }
    setOpenId(null); setFull(false); setPanelId(null); setListing(true);
  };
  // Somewhere else was picked: no room, no Rooms page, no Find rooms, no messages page.
  const leave = () => { setOpenId(null); setFull(false); setPanelId(null); setListing(false); setFinding(false); setNoChats(false); setCameFrom(null); };
  const find = () => { onLeavePage(); setOpenId(null); setFull(false); setListing(false); setNoChats(false); setFinding(true); setCameFrom(null); };
  const loadListed = useCallback(async () => { const res = await call<ListedRoom[]>('listed'); return res.ok ? res.value ?? [] : null; }, [call]);
  const inviteId = dialog?.kind === 'invite' ? dialog.roomId : null;
  const loadSent = useCallback(async () => {
    if (!inviteId) return null;
    const res = await call<Sent[]>('invitesSent', inviteId);
    return res.ok ? res.value ?? [] : null;
  }, [call, inviteId]);

  // The same from a room's menu on the Rooms page and from its row on the messages page.
  // Unread starts at the newest message someone else wrote, or the newest at all.
  const readOrUnread = async (r: Room, action: 'read' | 'unread') => {
    if (action === 'read') { await call('markRead', r.id); return; }
    const held = rooms?.messages[r.id] ?? [];
    const last = [...held].reverse().find((m) => !m.inReplyTo && !m.deleted && m.by !== meId) ?? [...held].reverse().find((m) => !m.inReplyTo && !m.deleted);
    const res = await call('markUnread', r.id, last?.at ?? Date.now());
    toast(res.ok ? 'Marked unread' : res.error ?? 'Not marked unread');
  };

  const menu = async (id: string, action: RoomMenuAction, at: DOMRect) => {
    const r = all.find((x) => x.id === id);
    if (!r) return;
    if (action === 'read' || action === 'unread') { await readOrUnread(r, action); return; }
    if (action === 'invite') setDialog({ kind: 'invite', roomId: id });
    if (action === 'members') setMembers({ roomId: id, at });
    if (action === 'ranks') { openRoom(id); setPane('ranks'); }
    if (action === 'mute' || action === 'unmute') { await call('mute', id, action === 'mute'); toast(action === 'mute' ? `${r.name} is muted` : `${r.name} is not muted any more`); }
    if (action === 'leave') {
      const res = await call('leave', id);
      toast(res.ok ? `You left ${r.name}` : res.error ?? 'Could not leave');
      if (res.ok && openId === id) setOpenId(null);
    }
  };

  // A link pasted or opened: show the room first, join on a yes.
  const join = useCallback(async (text: string) => {
    const token = tokenFromLink(text);
    if (!token) return false;
    const res = await call<Preview | null>('preview', token);
    setDialog({ kind: 'join', token, preview: res.ok ? res.value ?? null : null });
    return true;
  }, [call]);

  // MESSAGE SOMEONE FROM A ROOM. Teammates already have direct records, with
  // their agents and threads, so they keep using them. Anyone else is a small
  // group chat, the same one each time for the same people.
  const message = async (ids: string[], from: Room | null) => {
    const people = [...new Set(ids)].filter((id) => id !== meId);
    if (!people.length) return;
    const cards = new Map((from ?? open)?.wall.map((c) => [c.id, c]) ?? []);
    if (people.every((id) => cards.get(id)?.teammate)) { onTeamMessage(people); return; }
    const want = new Set([meId, ...people]);
    let group = all.find((r) => r.kind === 'group' && r.members === want.size && r.wall.every((c) => want.has(c.id)) && people.every((id) => r.wall.some((c) => c.id === id)));
    let id = group?.id ?? null;
    if (!id) {
      const name = people.map((p) => cards.get(p)?.name ?? 'Someone').join(', ').slice(0, 40);
      const res = await call<string>('create', { name, kind: 'group', people });
      if (!res.ok || !res.value) { toast(res.error ?? 'Could not start the chat'); return; }
      id = res.value;
    }
    const where = whereChatOpens({ open, full, pane });
    if (where.beside) { setPanelId(id); return; }
    openRoom(id, { asFull: true });
    setCameFrom(where.back);
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

  // A conversation's own menu on the messages page.
  const act = async (c: Conversation, action: ConversationAction) => {
    if (c.kind === 'direct') {
      if (action === 'read' || action === 'unread') onDirectRead?.(c.id, action === 'read');
      return;
    }
    const r = all.find((x) => x.id === c.id);
    if (!r) return;
    if (action === 'read' || action === 'unread') { await readOrUnread(r, action); return; }
    if (action === 'mute' || action === 'unmute') { await menu(r.id, action, new DOMRect()); return; }
    if (action === 'leave') await menu(r.id, 'leave', new DOMRect());
  };

  const conversations: Conversation[] = live ? [...roomConversations(rooms), ...directs] : [];
  const pick = (c: Conversation) => {
    if (c.kind === 'direct') { setOpenId(null); setFull(false); setListing(false); setNoChats(false); setCameFrom(null); onOpenDirect(c.id); return; }
    openRoom(c.id, { asFull: true });
  };

  // Messages, under Threads: every chat in one place, opened on the newest.
  const openMessages = () => {
    const newest = sortConversations(conversations)[0];
    if (newest) { pick(newest); return; }
    onLeavePage(); setOpenId(null); setListing(false); setFinding(false); setNoChats(true);
  };
  const unreadChats = conversations.filter((c) => c.unread).length;

  // One row: every group, and the count of groups with something unread.
  const groupsLit = listing || finding || noChats || !!open;
  const nav = (collapsed: boolean, messagesLit = false): ReactNode => live ? <nav className="workspace-tabs rm-msgnav" aria-label="Groups">
    <button type="button" className={`workspace-tab${groupsLit || messagesLit ? ' active' : ''}${unreadChats ? ' has-count' : ''}`}
      aria-label="Groups" title={collapsed ? 'Groups' : undefined} onClick={openRooms}>
      {I.groupNav()}<span>Groups</span>{unreadChats > 0 && <small className="workspace-running" aria-label={`${unreadChats} unread`}>{unreadChats}</small>}
    </button>
  </nav> : null;

  const meInChat = meId ? { id: meId, name: rooms?.me?.display_name || myName, avatarUrl: rooms?.me?.avatar_url ?? null, me: true } : null;
  const chatPanel = (r: Room, asFull: boolean) => {
    const others = r.wall.filter((c) => !c.me);
    const head = asFull ? <FullChatHead title={r.kind === 'group' ? others.map(cardName).join(', ') || r.name : r.name}
      faces={r.kind === 'group' ? others.map((c) => ({ name: c.name, url: c.avatarUrl })) : undefined}
      actions={r.kind === 'group' ? undefined
        : <button type="button" className="rm-btn" onClick={() => setDialog({ kind: 'invite', roomId: r.id })}>{I.invite(14)}Invite</button>} /> : undefined;
    return <RoomChat room={r} messages={rooms?.messages[r.id] ?? []} people={withMe(chatPeople(r, meId), meInChat)} meId={meId} now={now} full={asFull} head={head}
      woven={woven ? { look: woven, ...groupEvents(r, teamCards, now) } : undefined}
      onSend={send(r.id)} onRead={read(r)} {...chatCalls(r)}
      onInvite={() => setDialog({ kind: 'invite', roomId: r.id })}
      onExpand={asFull ? undefined : () => { setOpenId(r.id === open?.id ? open.id : r.id); setFull(true); setPanelId(null); }}
      onSwitch={(at) => setSwitcher(switcher ? null : at)} switchOpen={!!switcher} />;
  };


  // A page of its own takes the top bar's title and hides the state tabs.
  // `right` undefined keeps the bar's own buttons; null clears them.
  const backTitle = (title: string) => <h1 className="workspace-title">
    <button type="button" className="rm-backt" title="Back (esc)" onClick={close}>{I.back()}<span>{title}</span></button></h1>;
  let heading: { title: ReactNode; right?: ReactNode } | null = null;
  let page: ReactNode = null;
  // THE ROOM AS A BOARD: the Inbox's board, for the people here whose threads
  // reach me. Only on the room itself, never over a person, the ranks or a chat.
  const onRoom = !!open && !!rooms && !full && open.kind !== 'group' && pane === 'wall' && !finding && !noChats;
  const onBoardPeople = onRoom ? boardPeople(open!.wall) : [];
  const onBoardPicked = onRoom ? boardPicked(boardPicks[open!.id], onBoardPeople) : [];
  const setView = (next: RoomView) => { setViewRaw(next); writeRoomView(next); };
  const pickForBoard = (ids: string[]) => {
    if (!open) return;
    const next = { ...boardPicks, [open.id]: ids };
    setBoardPicks(next);
    writeBoardPicks(next);
  };
  const setLater = (shown: boolean) => { setLaterRaw(shown); writeBoardLater(shown); };
  const board = onRoom && view === 'board' && renderBoard
    ? <><BoardFaces people={onBoardPeople} picked={onBoardPicked} onPick={pickForBoard} />{renderBoard(onBoardPicked, { later })}</>
    : null;
  const viewButton: ReactNode = onRoom && renderBoard
    ? <RoomViewButton view={view} onView={setView} people={onBoardPeople} picked={onBoardPicked} onPick={pickForBoard} unseen={open!.wall.length - onBoardPeople.length} later={later} onLater={setLater} />
    : null;
  if (listing && live && rooms) {
    heading = {
      title: <h1 className="workspace-title">Groups</h1>,
      right: <div className="th-right"><button type="button" className="th-new" onClick={() => setDialog({ kind: 'start' })}>{I.plus()}New group</button></div>,
    };
    page = <RoomsPage state={rooms} invisible={invisibleUntil > now} now={now} onOpen={(id) => openRoom(id)} onFind={find}
      onMenu={(id, a, at) => void menu(id, a, at)} groups />;
  } else if (noChats && live) {
    heading = { title: backTitle('Messages'), right: null };
    page = <MessagesPage list={[]} onKey={null} now={now} onPick={pick} onAction={(c, a) => void act(c, a)}>
      <div className="rm-empty" style={{ padding: '0 28px' }}><span className="t">No conversations yet.</span>
        <span className="s">Message someone from a room, or from New thread.</span></div>
    </MessagesPage>;
  } else if (finding && live) {
    heading = {
      title: <h1 className="workspace-title">Find rooms</h1>,
      right: <div className="th-right"><button type="button" className="th-new" onClick={() => setDialog({ kind: 'start' })}>{I.plus()}Start a room</button></div>,
    };
    page = <div className="rm-split"><div className="rm-main wide"><FindRooms load={loadListed} onOpen={(id) => openRoom(id)} onLink={(t) => void join(t)}
      onJoin={async (id) => { const res = await call<string>('joinListed', id); return res.ok ? null : res.error ?? 'Could not join'; }} /></div></div>;
  } else if (open && rooms && pane === 'wall' && look) {
    const others = open.wall.filter((c) => !c.me);
    const name = open.kind === 'group' ? others.map((c) => c.name).join(', ') || open.name : open.name;
    const people = withMe(chatPeople(open, meId), meInChat);
    const woven = look === 'woven' ? groupEvents(open, teamCards, now) : null;
    const chat = <RoomChat room={open} messages={rooms.messages[open.id] ?? []} people={people} meId={meId} now={now} full head={<></>}
      events={woven?.past} foot={woven && <NowLines room={open} lines={woven.now} />}
      onSend={send(open.id)} onRead={read(open)} {...chatCalls(open)} />;
    heading = {
      title: backTitle(name),
      right: <div className="th-right">
        {look === 'title' && <TitleFaces room={open} onPerson={(id) => setPane(`person:${id}`)} />}
        {open.kind !== 'group' && <button type="button" className="th-new" onClick={() => setDialog({ kind: 'invite', roomId: open.id })}>{I.invite(15)}Invite</button>}
      </div>,
    };
    page = <GroupPage room={open} look={look} chat={chat} messages={rooms.messages[open.id] ?? []} onPerson={(id) => setPane(`person:${id}`)} />;
  } else if (open && rooms) {
    if (full) {
      const r = chatRoom ?? open;
      heading = { title: backTitle(open.kind === 'group' ? 'Messages' : open.name), right: null };
      page = <MessagesPage list={conversations} onKey={`room:${r.id}`} now={now} onPick={pick} onAction={(c, a) => void act(c, a)}>{chatPanel(r, true)}</MessagesPage>;
    } else {
      heading = { title: backTitle(open.name) };
      page = <RoomPage room={open} rooms={list} cards={teamCards} ranks={rooms.ranks ?? {}} me={rooms.me} now={now}
        pane={pane} link={links[open.id] ?? null} onPane={setPane} chat={chatPanel(chatRoom ?? open, false)} board={board} renderBoard={renderPersonBoard}
        picked={picked} onPick={(ids) => setPicked(new Set(ids))} onMessage={(ids) => void message(ids, open)}
        onRoom={(id) => openRoom(id)}
        onSaveBio={async (bio) => { const res = await call('saveProfile', { bio }); return res.ok ? null : res.error ?? 'Your bio did not save'; }}
        onComeBack={() => void call('comeBack')} onCopyLink={() => void copyLink(open.id)} />;
    }
  }

  /** A direct record opened full page sits on the messages page too. */
  const messagesShell = (directId: string | null, child: ReactNode): ReactNode => live && directId
    ? <MessagesPage list={conversations} onKey={`direct:${directId}`} now={now} onPick={pick} onAction={(c, a) => void act(c, a)}>{child}</MessagesPage>
    : child;

  // The chats you have with people from this room, and All messages.
  const switchRoom = open && !full ? open : null;
  const switchList = switchRoom ? [
    ...all.filter((r) => r.kind === 'group' && r.wall.filter((c) => !c.me).every((c) => switchRoom.wall.some((w) => w.id === c.id))),
  ] : [];
  const switchDirects = switchRoom ? directs.filter((d) => d.people.length && d.people.every((p) => switchRoom.wall.some((w) => w.id === p))) : [];

  const inviteRoom = dialog?.kind === 'invite' ? all.find((r) => r.id === dialog.roomId) : null;
  const membersRoom = members ? all.find((r) => r.id === members.roomId) : null;
  const dialogs: ReactNode = <>
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
    {switcher && switchRoom && <SwitchMenu at={switcher} room={switchRoom} groups={switchList} directs={switchDirects} current={chatRoom?.id ?? switchRoom.id}
      onClose={() => setSwitcher(null)}
      onRoom={(id) => { setSwitcher(null); setPanelId(id === switchRoom.id ? null : id); }}
      onDirect={(id) => { setSwitcher(null); setOpenId(null); setListing(false); onOpenDirect(id); }}
      onAll={() => { setSwitcher(null); setFull(true); }} />}
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

  const mentions: RoomMention[] = live ? rooms!.mentions : [];
  const faces = new Map(all.flatMap((r) => r.wall.map((c) => [c.id, c.avatarUrl] as const)));
  const openMention = (m: RoomMention) => openRoom(m.roomId);

  return {
    live, openId: open ? openId : listing && live ? 'rooms' : finding && live ? 'find' : noChats && live ? 'messages' : null, openMessages, open: (id: string) => openRoom(id), close, leave, find, nav, page, dialogs, join, invisible, settingsPane,
    mentions, openMention, faces, messagesShell, full, heading,
    dialogOpen: !!dialog || !!members || !!switcher,
    /** The header's View button over a room, and B. Null anywhere else in rooms. */
    viewButton, flipView: viewButton ? () => setView(view === 'board' ? 'grid' : 'board') : null,
    /** The room a teammate's card was opened over, for its Back. */
    roomName: open && !full && open.kind !== 'group' ? open.name : null,
  };
}

function SwitchMenu({ at, room, groups, directs, current, onRoom, onDirect, onAll, onClose }: {
  at: DOMRect; room: Room; groups: Room[]; directs: Direct[]; current: string;
  onRoom: (id: string) => void; onDirect: (id: string) => void; onAll: () => void; onClose: () => void;
}) {
  const ref = useOutside(onClose);
  return <div ref={ref} className="rm-menu rm-pop" style={{ left: at.left, top: at.bottom + 4 }}>
    <button type="button" className={`row${current === room.id ? ' on' : ''}`} onClick={() => onRoom(room.id)}>{I.hash(15)}<span>{room.name}</span><span className="k">Room</span></button>
    {groups.map((g) => {
      const others = g.wall.filter((c) => !c.me);
      const last = (g as Room & { last?: string }).last;
      return <button type="button" key={g.id} className={`row${current === g.id ? ' on' : ''}`} onClick={() => onRoom(g.id)}>
        <span className="rm-faces">{others.slice(0, 2).map((c) => <RoomFace key={c.id} name={c.name} url={c.avatarUrl} size={18} />)}</span>
        <span>{others.map(cardName).join(', ')}</span>{last && <span className="sub">{last}</span>}{g.unread > 0 && <span className="rm-unread" />}
      </button>;
    })}
    {directs.map((d) => <button type="button" key={d.key} className="row" onClick={() => onDirect(d.id)}>
      <span className="rm-faces">{d.faces.slice(0, 2).map((f, i) => <RoomFace key={i} name={f.name} url={f.url} size={18} />)}</span>
      <span>{d.name}</span><span className="sub">{d.last}</span>{d.unread && <span className="rm-unread" />}
    </button>)}
    <div className="rule" />
    <button type="button" className="row" onClick={onAll}>{I.chat()}<span>All messages</span></button>
  </div>;
}
