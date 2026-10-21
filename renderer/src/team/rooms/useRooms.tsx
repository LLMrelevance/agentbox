// Rooms in the app (alpha): which room is open, the sidebar section, the tabs,
// the page, the messages page and the dialogs, in one place so App.tsx only
// places them.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../../api';
import type { Room, RoomMention, RoomsState, ThreadCard } from '../../types';
import { RoomsNav, useOutside, type RoomMenuAction } from './RoomsNav';
import { RoomTabs } from './RoomTabs';
import { cardName, roomTabs, tabWalk, withMe } from './room-rules';
import { RoomPage, type RoomPane } from './RoomPage';
import { RoomChat, peopleOf } from './RoomChat';
import { RoomFace } from './RoomFace';
import { I } from './icons';
import { FullChatHead, MessagesPage, sortConversations, type Conversation } from './MessagesPage';
import { roomConversations } from './conversations';
import { FindRooms, type ListedRoom } from './FindRooms';
import { InviteDialog, JoinDialog, MembersMenu, StartRoomDialog, type Preview, type Sent } from './RoomDialogs';
import { joinLink, tokenFromLink } from '../../../../shared/room-links.mjs';
import { RoomsNotReady, RoomsSettings } from './RoomsSettings';

const FOLD_KEY = 'rooms.folded';

type Dialog =
  | { kind: 'invite'; roomId: string }
  | { kind: 'start' }
  | { kind: 'join'; token: string; preview: Preview | null }
  | null;

type Direct = Conversation & { people: string[] };

export function useRooms({ rooms, on, meId, myName, fullName = '', hasTeam, teamCards = [], directs = [], now, toast, onOpenDirect, onTeamMessage, onLeavePage }: {
  rooms: RoomsState | null | undefined; on: boolean; meId: string | null; myName: string; fullName?: string; hasTeam: boolean; teamCards?: ThreadCard[];
  /** Direct records, for the messages page and the chat switcher. */
  directs?: Direct[];
  now: number; toast: (text: string) => void;
  /** Open a direct record (its own view, on the messages page). */
  onOpenDirect: (id: string) => void;
  /** Message teammates the way the team version already does. */
  onTeamMessage: (personIds: string[]) => void;
  /** Leave whatever covers the rooms: an open thread or direct chat, the Team page, search. */
  onLeavePage: () => void;
}) {
  const live = on && !!rooms?.on;
  const all = live ? rooms!.rooms : [];
  // Groups are chats: they live on the messages page and in the switcher, not in the sidebar.
  const list = all.filter((r) => r.kind !== 'group');
  const [openId, setOpenId] = useState<string | null>(null);
  const [pane, setPane] = useState<RoomPane>('wall');
  const [panelId, setPanelId] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [switcher, setSwitcher] = useState<DOMRect | null>(null);
  const [folded, setFolded] = useState(() => { try { return localStorage.getItem(FOLD_KEY) === '1'; } catch { return false; } });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [members, setMembers] = useState<{ roomId: string; at: DOMRect } | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [finding, setFinding] = useState(false);
  // The Messages row with no conversation yet to open.
  const [noChats, setNoChats] = useState(false);
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
  useEffect(() => { if (!live) { setOpenId(null); setDialog(null); setMembers(null); setFull(false); } }, [live]);
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

  const openRoom = (id: string, { asFull = false } = {}) => { onLeavePage(); setFinding(false); setNoChats(false); setOpenId(id); setPane('wall'); setPanelId(null); setFull(asFull); };
  const close = () => {
    if (finding) { setFinding(false); return; }
    if (noChats) { setNoChats(false); return; }
    if (full && open?.kind !== 'group') { setFull(false); return; }
    if (pane !== 'wall') { setPane('wall'); return; }
    setOpenId(null); setFull(false); setPanelId(null);
  };
  // Somewhere else was picked: no room, no Find rooms, no messages page.
  const leave = () => { setOpenId(null); setFull(false); setPanelId(null); setFinding(false); setNoChats(false); };
  const find = () => { onLeavePage(); setOpenId(null); setFull(false); setNoChats(false); setFinding(true); };
  const loadListed = useCallback(async () => { const res = await call<ListedRoom[]>('listed'); return res.ok ? res.value ?? [] : null; }, [call]);
  const inviteId = dialog?.kind === 'invite' ? dialog.roomId : null;
  const loadSent = useCallback(async () => {
    if (!inviteId) return null;
    const res = await call<Sent[]>('invitesSent', inviteId);
    return res.ok ? res.value ?? [] : null;
  }, [call, inviteId]);

  const menu = async (id: string, action: RoomMenuAction, at: DOMRect) => {
    const r = all.find((x) => x.id === id);
    if (!r) return;
    if (action === 'invite') setDialog({ kind: 'invite', roomId: id });
    if (action === 'members') setMembers({ roomId: id, at });
    if (action === 'ranks') { openRoom(id); setPane('ranks'); }
    if (action === 'pin' || action === 'unpin') await call('pin', id, action === 'pin');
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
    if (open && open.kind !== 'group' && !full) setPanelId(id);
    else openRoom(id, { asFull: true });
  };

  const send = (roomId: string) => async (body: string, opts: { inReplyTo: string | null; mentions: string[] }) => {
    const res = await call('send', roomId, body, opts);
    return res.ok ? null : res.error ?? 'Not sent';
  };
  const read = (r: Room) => () => { if (r.unread > 0) void call('markRead', r.id); };

  const conversations: Conversation[] = live ? [...roomConversations(rooms), ...directs] : [];
  const pick = (c: Conversation) => {
    if (c.kind === 'direct') { setOpenId(null); setFull(false); setNoChats(false); onOpenDirect(c.id); return; }
    openRoom(c.id, { asFull: true });
  };

  // Messages, under Threads: every chat in one place, opened on the newest.
  const openMessages = () => {
    const newest = sortConversations(conversations)[0];
    if (newest) { pick(newest); return; }
    onLeavePage(); setOpenId(null); setFinding(false); setNoChats(true);
  };
  const unreadChats = conversations.filter((c) => c.unread).length;

  const nav = (collapsed: boolean, messagesLit = false): ReactNode => live ? <>
    <nav className="workspace-tabs rm-msgnav" aria-label="Messages">
      <button type="button" className={`workspace-tab${messagesLit || noChats || (full && !!open) || open?.kind === 'group' ? ' active' : ''}${unreadChats ? ' has-count' : ''}`}
        aria-label="Messages" title={collapsed ? 'Messages' : undefined} onClick={openMessages}>
        {I.chatNav()}<span>Messages</span>{unreadChats > 0 && <small className="workspace-running" aria-label={`${unreadChats} unread`}>{unreadChats}</small>}
      </button>
    </nav>
    <RoomsNav rooms={list} openId={open?.kind === 'group' || full ? null : openId} folded={folded} collapsed={collapsed}
      onFold={() => setFolded((f) => { try { localStorage.setItem(FOLD_KEY, f ? '0' : '1'); } catch { /* not kept */ } return !f; })}
      onOpen={(id) => openRoom(id)} onPin={(id, pin) => void call('pin', id, pin)} onMenu={(id, a, at) => void menu(id, a, at)}
      onNewRoom={() => setDialog({ kind: 'start' })} />
  </> : null;

  const tabs: ReactNode = live ? <RoomTabs rooms={list} openId={open?.kind === 'group' ? null : openId} invisible={invisibleUntil > now} onOpen={(id) => openRoom(id)} /> : null;

  const meInChat = meId ? { id: meId, name: rooms?.me?.display_name || myName, avatarUrl: rooms?.me?.avatar_url ?? null, me: true } : null;
  const chatPanel = (r: Room, asFull: boolean) => {
    const others = r.wall.filter((c) => !c.me);
    const head = asFull ? <FullChatHead title={r.kind === 'group' ? others.map(cardName).join(', ') || r.name : r.name}
      faces={r.kind === 'group' ? others.map((c) => ({ name: c.name, url: c.avatarUrl })) : undefined}
      actions={r.kind === 'group' ? undefined
        : <button type="button" className="rm-btn" onClick={() => setDialog({ kind: 'invite', roomId: r.id })}>{I.invite(14)}Invite</button>} /> : undefined;
    return <RoomChat room={r} messages={rooms?.messages[r.id] ?? []} people={withMe(peopleOf(r.wall), meInChat)} meId={meId} now={now} full={asFull} head={head}
      onSend={send(r.id)} onRead={read(r)}
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
  if (noChats && live) {
    heading = { title: backTitle('Messages'), right: null };
    page = <MessagesPage list={[]} onKey={null} now={now} onPick={pick}>
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
  } else if (open && rooms) {
    if (full || open.kind === 'group') {
      const r = chatRoom ?? open;
      heading = { title: backTitle(open.kind === 'group' ? 'Messages' : open.name), right: null };
      page = <MessagesPage list={conversations} onKey={`room:${r.id}`} now={now} onPick={pick}>{chatPanel(r, true)}</MessagesPage>;
    } else {
      if (pane.startsWith('person:')) heading = { title: backTitle(open.name) };
      page = <RoomPage room={open} rooms={list} cards={teamCards} ranks={rooms.ranks ?? {}} me={rooms.me} now={now}
        pane={pane} link={links[open.id] ?? null} onPane={setPane} chat={chatPanel(chatRoom ?? open, false)}
        picked={picked} onPick={(ids) => setPicked(new Set(ids))} onMessage={(ids) => void message(ids, open)}
        onComeBack={() => void call('comeBack')} onCopyLink={() => void copyLink(open.id)} />;
    }
  }

  /** A direct record opened full page sits on the messages page too. */
  const messagesShell = (directId: string | null, child: ReactNode): ReactNode => live && directId
    ? <MessagesPage list={conversations} onKey={`direct:${directId}`} now={now} onPick={pick}>{child}</MessagesPage>
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
      onDirect={(id) => { setSwitcher(null); setOpenId(null); onOpenDirect(id); }}
      onAll={() => { setSwitcher(null); setFull(true); }} />}
  </>;

  // Tab and Shift-Tab along the state tabs and then the room tabs.
  const walk = (stateTabs: readonly string[], at: string, back: boolean) => tabWalk(stateTabs, roomTabs(list, openId), at, back);

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
    live, openId: open ? openId : finding && live ? 'find' : noChats && live ? 'messages' : null, openMessages, open: (id: string) => openRoom(id), close, leave, find, nav, tabs, page, dialogs, join, walk, invisible, settingsPane,
    mentions, openMention, faces, messagesShell, full, heading,
    dialogOpen: !!dialog || !!members || !!switcher,
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
