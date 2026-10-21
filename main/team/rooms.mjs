// ROOMS ON THIS MAC (w-3d0fa23ffb, docs/team/ROOMS-PLAN.md): the rooms I am in,
// each room's wall and chat, and the presence row this Mac publishes. Lives
// inside the team service (main/team/index.mjs) and only runs while Rooms is
// switched on in Alpha features and someone is signed in.
import fs from 'node:fs';
import path from 'node:path';
import { wallCards, myPresence, displayNameOf, withoutHidden } from '../../shared/room-cards.mjs';
import { GENERAL_ROOM } from './rooms-memory.mjs';

const MESSAGES_HELD = 200;
const HEARTBEAT_MS = 5 * 60_000;
const SETTLE_MS = 400;

// Pins, mutes and the first-room pin are this Mac's, kept per person.
export function roomPrefsFile(storeRoot) {
  return path.join(storeRoot, '.rooms.json');
}

function prefsStore(file) {
  const read = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) ?? {}; } catch { return {}; } };
  return {
    get: (who) => ({ pinned: [], muted: [], autoPinned: false, ...(read()[who] ?? {}) }),
    set: (who, patch) => {
      const all = read();
      all[who] = { pinned: [], muted: [], autoPinned: false, ...(all[who] ?? {}), ...patch };
      try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(all, null, 2)); } catch { /* a pin that is not kept is not worth failing over */ }
      return all[who];
    },
  };
}

const EMPTY = { on: false, ready: false, rooms: [], messages: {}, me: null, ranks: {}, invites: [], mentions: [], error: null };

export function createRooms({
  backend, // () => the signed-in backend, or null
  me, // () => { id, name } of who is signed in, or null
  team, // () => { people, cards } from the team service
  enabled, // () => whether Rooms is switched on
  device, // () => this Mac's 12-hex id
  presenceFacts, // () => { running, items, products, summary }
  prefsFile,
  now = Date.now,
  log = () => {},
  onChange = () => {},
  timers = { setTimeout, clearTimeout },
}) {
  const prefs = prefsStore(prefsFile);
  let state = { ...EMPTY };
  let people = new Map(); // roomId -> [personId]
  let profiles = new Map(); // personId -> row
  let presence = []; // rows
  let messages = new Map(); // roomId -> [message], oldest first
  let reads = new Map(); // roomId -> ms
  let mentioned = []; // my newest mentions, which may be older than the messages held
  let unsubscribe = null;
  let started = null; // the backend rooms were started on
  let lastSent = null;
  let lastSentAt = 0;
  let refreshing = null;
  let again = false;
  let gen = 0; // bumped by every change made here, see refresh
  let settle = null;

  const meId = () => me()?.id ?? null;

  function build() {
    if (!started) { state = { ...EMPTY, on: !!enabled() }; return; }
    const who = meId();
    const t = team() ?? {};
    const teammates = (t.people ?? []).map((p) => p.id).filter((id) => id !== who);
    const p = prefs.get(who);
    const pinned = new Set(p.pinned);
    const muted = new Set(p.muted);
    const at = now();
    const mentions = [];
    const mine = ownWork();
    const rooms = (state.rawRooms ?? []).map((r) => {
      const held = messages.get(r.id) ?? [];
      const readAt = reads.get(r.id) ?? 0;
      const unreadMsgs = held.filter((m) => m.at > readAt && m.by !== who);
      const pool = new Map([...mentioned.filter((m) => m.roomId === r.id && m.at > readAt && m.by !== who), ...unreadMsgs].map((m) => [m.id, m]));
      for (const m of pool.values()) {
        if (m.mentions.includes(who)) mentions.push({ id: `room-mention:${m.id}`, messageId: m.id, roomId: r.id, roomName: r.name, by: m.by, byName: profiles.get(m.by)?.display_name || '', body: m.body, at: m.at });
      }
      const wall = wallCards({ members: people.get(r.id) ?? [], profiles: [...profiles.values()], presence, teammates, teamCards: t.cards ?? [], meId: who, now: at, mine });
      return {
        ...r,
        pinned: pinned.has(r.id),
        muted: muted.has(r.id),
        unread: unreadMsgs.length,
        lastAt: held.at(-1)?.at ?? r.createdAt,
        agents: wall.reduce((n, c) => n + (c.agents ?? 0), 0),
        wall,
      };
    });
    state = {
      ...state,
      on: true,
      rooms,
      messages: Object.fromEntries(rooms.map((r) => [r.id, messages.get(r.id) ?? []])),
      mentions: mentions.sort((a, b) => b.at - a.at),
    };
  }

  const changed = () => { build(); onChange(); };

  // The thread this Mac's newest agent is on, for my own card only.
  function ownWork() {
    let f = {};
    try { f = presenceFacts() ?? {}; } catch { return null; }
    const lead = [...(f.running ?? [])].sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0];
    if (!lead) return { workingOn: null };
    const item = (f.items ?? []).find((i) => i.id === lead.itemId);
    return { workingOn: (String(item?.label ?? '').trim() || String(item?.title ?? '')).slice(0, 64) || null };
  }
  const local = () => { gen += 1; };

  // One pass at a time; a call during a pass asks for another, and resolves
  // when the last one has run. A pass that overlapped a change made here
  // (a message heard, a profile saved) is thrown away and run again, so what
  // was read before the change never lands on top of it.
  function refresh() {
    again = true;
    refreshing ??= (async () => {
      while (again) { again = false; await refreshOnce(); }
    })().finally(() => { refreshing = null; });
    return refreshing;
  }

  async function refreshOnce() {
    const b = backend();
    if (!b || !started) return;
    const g = gen;
    try {
      const rooms = await b.myRooms();
      const ids = new Map();
      await Promise.all(rooms.map(async (r) => ids.set(r.id, await b.roomPeople(r.id))));
      const everyone = [...new Set([meId(), ...[...ids.values()].flat()])].filter(Boolean);
      const [profileRows, presenceRows, readRows, mine, invites, ranks, mentionRows] = await Promise.all([
        b.roomProfiles(everyone), b.roomPresence(everyone), b.roomReads(), b.myRoomProfile(),
        b.pendingRoomInvites().catch(() => []), b.agentboxRanks(everyone).catch(() => ({})),
        b.roomMentions({ limit: 50 }).catch(() => []),
      ]);
      const held = new Map();
      await Promise.all(rooms.map(async (r) => held.set(r.id, merge(messages.get(r.id), await b.roomMessages(r.id, { limit: MESSAGES_HELD })))));
      if (backend() !== b || started !== b) return;
      if (g !== gen) { again = true; return; }
      people = ids;
      profiles = new Map(profileRows.map((row) => [row.person_id, row]));
      presence = presenceRows;
      messages = held;
      reads = new Map(readRows.map((r) => [r.roomId, r.readAt]));
      mentioned = mentionRows;
      autoPin(rooms);
      state = { ...state, ready: true, rawRooms: rooms, me: mine, invites, ranks, error: null };
    } catch (err) {
      state = { ...state, error: String(err?.message ?? err) };
      log(`rooms: ${state.error}`);
    }
    changed();
  }

  function merge(old = [], fresh = []) {
    const byId = new Map(old.map((m) => [m.id, m]));
    for (const m of fresh) byId.set(m.id, m);
    return [...byId.values()].sort((a, b) => a.at - b.at || String(a.id).localeCompare(String(b.id))).slice(-MESSAGES_HELD);
  }

  // The first room I am ever in is pinned for me, once.
  function autoPin(rooms) {
    const who = meId();
    const p = prefs.get(who);
    if (p.autoPinned || !rooms.length) return;
    const first = rooms.find((r) => r.teamId) ?? rooms[0];
    prefs.set(who, { autoPinned: true, pinned: [...new Set([...p.pinned, first.id])] });
  }

  function later() {
    if (settle) return;
    settle = timers.setTimeout(() => { settle = null; refresh(); }, SETTLE_MS);
    settle?.unref?.();
  }

  function hear(e) {
    if (e.kind === 'message') {
      const m = e.message;
      if (!messages.has(m.roomId)) { later(); return; }
      local();
      messages.set(m.roomId, merge(messages.get(m.roomId), [m]));
      changed();
      return;
    }
    later();
  }

  // What this Mac sends, when it differs from what it last sent, and every
  // few minutes regardless so others do not read it as gone quiet.
  async function publish({ force = false } = {}) {
    const b = backend();
    if (!b || !started) return false;
    const facts = presenceFacts() ?? {};
    const showWorking = state.me?.show_working ?? 'team';
    const row = withoutHidden(myPresence({ ...facts, now: now(), showWorking }), state.me);
    const key = JSON.stringify(row);
    if (!force && key === lastSent && now() - lastSentAt < HEARTBEAT_MS) return false;
    await b.putPresence(device(), { ...row, gone: false });
    lastSent = key;
    lastSentAt = now();
    return true;
  }

  async function ensureProfile(b) {
    const mine = await b.myRoomProfile();
    if (mine) return mine;
    return b.saveRoomProfile({ display_name: displayNameOf(me()?.name ?? '') || 'Someone', avatar_url: me()?.avatarUrl ?? null });
  }

  async function start() {
    const b = backend();
    if (!b || !enabled() || !meId()) return;
    if (started === b) return;
    await stop();
    started = b;
    state = { ...EMPTY, on: true };
    try {
      const mine = await ensureProfile(b);
      state = { ...state, me: mine };
      // Someone with no team and no room starts in General, pinned.
      const rooms = await b.myRooms();
      if (!rooms.length && !(team()?.team)) await b.joinListedRoom(GENERAL_ROOM).catch((err) => log(`rooms: General: ${err.message}`));
      unsubscribe = b.subscribeRooms(hear);
    } catch (err) {
      state = { ...state, error: String(err?.message ?? err) };
      log(`rooms: starting: ${state.error}`);
    }
    await refresh();
    await publish({ force: true }).catch((err) => log(`rooms: presence: ${err.message}`));
  }

  // Rooms switched off, or signed out: this Mac says it has gone, and stops.
  async function stop() {
    const b = started;
    unsubscribe?.();
    unsubscribe = null;
    if (settle) timers.clearTimeout(settle);
    settle = null;
    started = null;
    lastSent = null;
    people = new Map(); profiles = new Map(); presence = []; messages = new Map(); reads = new Map(); mentioned = [];
    state = { ...EMPTY, on: !!enabled() };
    if (b) await b.putPresence(device(), { gone: true, agents_running: 0, working_on: null, working_private: false }).catch(() => {});
    onChange();
  }

  // Called on every pass of the team's sync loop.
  async function tick() {
    const want = !!enabled() && !!backend() && !!meId();
    if (want && started !== backend()) return start();
    if (!want && started) return stop();
    if (!want) return;
    await syncStatus().catch((err) => log(`rooms: status: ${err.message}`));
    await publish().catch((err) => log(`rooms: presence: ${err.message}`));
  }

  // The line I wrote for my team (the account menu) is my room card's status.
  async function syncStatus() {
    const mine = state.me;
    if (!mine) return;
    const s = mine.show_status === false ? null : me()?.status ?? null;
    const text = s?.text ?? null;
    const until = text && s?.until ? new Date(s.until).toISOString() : null;
    if ((mine.status_text ?? null) === text && (mine.status_until ? new Date(mine.status_until).toISOString() : null) === until) return;
    const saved = await backend().saveRoomProfile({ status_text: text, status_until: until });
    local();
    state = { ...state, me: saved };
    changed();
  }

  const need = () => { const b = backend(); if (!b || !started) throw new Error('turn on Rooms and sign in first'); return b; };
  const after = async (p) => { const out = await p; await refresh(); return out; };

  return {
    state: () => { const { rawRooms, ...shown } = state; return shown; },
    start, stop, tick, refresh, publish,

    async send(roomId, body, { inReplyTo = null, mentions = [] } = {}) {
      const b = need();
      const m = await b.sendRoomMessage(roomId, { body: String(body ?? '').trim(), inReplyTo, mentions });
      local();
      messages.set(roomId, merge(messages.get(roomId), [m]));
      reads.set(roomId, Math.max(reads.get(roomId) ?? 0, m.at));
      changed();
      return m;
    },

    async markRead(roomId) {
      const b = need();
      const last = (messages.get(roomId) ?? []).at(-1)?.at;
      if (!last || (reads.get(roomId) ?? 0) >= last) return;
      local();
      reads.set(roomId, last);
      changed();
      await b.markRoomRead(roomId, last);
    },

    async older(roomId) {
      const b = need();
      const held = messages.get(roomId) ?? [];
      const got = await b.roomMessages(roomId, { before: held[0]?.at ?? now(), limit: 100 });
      local();
      const all = new Map([...got, ...held].map((m) => [m.id, m]));
      messages.set(roomId, [...all.values()].sort((a, b2) => a.at - b2.at));
      changed();
      return got.length;
    },

    // My card: what it says and who sees what.
    async saveProfile(fields = {}) {
      const b = need();
      const patch = { ...fields };
      if ('fullName' in patch) {
        patch.display_name = displayNameOf(me()?.name ?? '', { full: !!patch.fullName }) || state.me?.display_name || 'Someone';
        delete patch.fullName;
      }
      const saved = await b.saveRoomProfile(patch);
      local();
      state = { ...state, me: saved };
      changed();
      if (['show_working', 'show_agents', 'show_level'].some((k) => k in patch)) await publish({ force: true }).catch(() => {});
      if ('show_status' in patch) await syncStatus().catch(() => {});
      return saved;
    },

    // No minutes is until I turn it off, held as a date ten years ahead.
    goInvisible(minutes = null) {
      const m = minutes == null ? 3650 * 24 * 60 : Math.max(1, Math.min(48 * 60, Number(minutes) || 60));
      return this.saveProfile({ invisible_until: new Date(now() + m * 60_000).toISOString() });
    },
    comeBack() { return this.saveProfile({ invisible_until: null }); },

    link: (roomId) => need().roomLink(roomId),
    revokeLink: (roomId) => need().revokeRoomLink(roomId),
    preview: (token) => need().roomPreview(token),
    listed: () => need().listedRooms(),
    joinByLink: (token) => after(need().joinRoomByLink(token)),
    joinListed: (roomId) => after(need().joinListedRoom(roomId)),
    acceptInvite: (roomId) => after(need().acceptRoomInvite(roomId)),
    invite: async (roomId, email) => {
      const clean = String(email ?? '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error(`${clean || 'that'} is not an email address`);
      await need().inviteToRoom(roomId, clean);
    },
    async create({ name, kind = 'room', listed = false, inviteOnly = false, people: who = [] }) {
      const id = await need().createRoom({ name: String(name ?? '').trim(), kind, listed, inviteOnly, people: who });
      prefs.set(meId(), { pinned: [...new Set([...prefs.get(meId()).pinned, id])] });
      await refresh();
      return id;
    },
    rename: (roomId, name) => after(need().renameRoom(roomId, name)),
    leave: async (roomId) => {
      await need().leaveRoom(roomId);
      const p = prefs.get(meId());
      prefs.set(meId(), { pinned: p.pinned.filter((x) => x !== roomId), muted: p.muted.filter((x) => x !== roomId) });
      await refresh();
    },
    remove: (roomId, personId) => after(need().removeRoomMember(roomId, personId)),

    pin(roomId, on = true) {
      const p = prefs.get(meId());
      prefs.set(meId(), { pinned: on ? [...new Set([...p.pinned, roomId])] : p.pinned.filter((x) => x !== roomId) });
      changed();
    },
    mute(roomId, on = true) {
      const p = prefs.get(meId());
      prefs.set(meId(), { muted: on ? [...new Set([...p.muted, roomId])] : p.muted.filter((x) => x !== roomId) });
      changed();
    },
  };
}
