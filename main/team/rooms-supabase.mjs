// ROOMS ON SUPABASE (w-3d0fa23ffb): the same calls as rooms-memory.mjs, against
// cloud/supabase/migrations/20261021000000_rooms.sql. Row level security and
// the functions there are what keep people apart; nothing here is trusted to.
import { Name } from '../../shared/product-name.mjs';
import { PROFILE_COLS, PRESENCE_COLS, PROFILE_FIELDS, PRESENCE_FIELDS, pick, roomOut, messageOut } from './rooms-shape.mjs';

const MSG_COLS = 'id,room_id,by_person,body,in_reply_to,mentions,created_at';

export function roomsSupabase(client, myId, must) {
  const rpc = async (fn, args, what) => must(await client.rpc(fn, args), what);

  return {
    async myRooms() {
      await myId();
      return ((await rpc('my_rooms', {}, 'reading your rooms')) ?? []).map(roomOut);
    },

    async roomPeople(roomId) {
      await myId();
      const rows = (await rpc('room_people', { r: roomId }, 'reading who is in the room')) ?? [];
      return rows.map((r) => (typeof r === 'string' ? r : r.room_people ?? r.person_id)).filter(Boolean);
    },

    async roomProfiles(ids) {
      await myId();
      if (!ids?.length) return [];
      return must(await client.from('room_profiles').select(PROFILE_COLS).in('person_id', ids), 'reading people in your rooms');
    },

    async roomPresence(ids) {
      await myId();
      if (!ids?.length) return [];
      return must(await client.from('room_presence').select(PRESENCE_COLS).in('person_id', ids), 'reading who is working');
    },

    async myRoomProfile() {
      const me = await myId();
      const rows = must(await client.from('room_profiles').select(PROFILE_COLS).eq('person_id', me).limit(1), 'reading your room profile');
      return rows[0] ?? null;
    },

    async saveRoomProfile(fields) {
      const me = await myId();
      const row = pick(fields, PROFILE_FIELDS);
      const rows = must(await client.from('room_profiles').upsert({ person_id: me, ...row }, { onConflict: 'person_id' }).select(PROFILE_COLS), 'saving your room profile');
      return rows[0] ?? null;
    },

    async putPresence(device, fields) {
      const me = await myId();
      must(await client.from('room_presence').upsert({ person_id: me, device, ...pick(fields, PRESENCE_FIELDS) }, { onConflict: 'person_id,device' }), 'telling your rooms what you are doing');
    },

    async roomMessages(roomId, { before = null, limit = 200 } = {}) {
      await myId();
      let q = client.from('room_messages').select(MSG_COLS).eq('room_id', roomId).order('created_at', { ascending: false }).limit(limit);
      if (before) q = q.lt('created_at', new Date(before).toISOString());
      return must(await q, 'reading the chat').map(messageOut).reverse();
    },

    async sendRoomMessage(roomId, { body, inReplyTo = null, mentions = [] }) {
      const me = await myId();
      const row = must(await client.from('room_messages').insert({ room_id: roomId, by_person: me, body, in_reply_to: inReplyTo, mentions }).select(MSG_COLS).single(), 'sending your message');
      return messageOut(row);
    },

    async roomReads() {
      const me = await myId();
      const rows = must(await client.from('room_reads').select('room_id,read_at').eq('person_id', me), 'reading what you have read');
      return rows.map((r) => ({ roomId: r.room_id, readAt: Date.parse(r.read_at) }));
    },

    async markRoomRead(roomId, at) {
      await myId();
      await rpc('mark_room_read', { r: roomId, at: new Date(at).toISOString() }, 'marking the room read');
    },

    async roomLink(roomId) {
      await myId();
      return rpc('room_link', { r: roomId }, 'making an invite link');
    },

    async revokeRoomLink(roomId) {
      await myId();
      return rpc('revoke_room_link', { r: roomId }, 'turning the old link off');
    },

    async joinRoomByLink(token) {
      await myId();
      return rpc('join_room_by_link', { tok: token }, 'joining the room');
    },

    async joinListedRoom(roomId) {
      await myId();
      return rpc('join_listed_room', { r: roomId }, 'joining the room');
    },

    async listedRooms() {
      await myId();
      const rows = (await rpc('listed_rooms', {}, 'finding rooms')) ?? [];
      return rows.map((r) => ({ id: r.id, name: r.name, members: r.members, hereNow: r.here_now, joined: !!r.joined, faces: r.faces ?? [] }));
    },

    async roomPreview(token) {
      const rows = (await rpc('room_preview', { tok: token }, 'reading the invite')) ?? [];
      const r = rows[0];
      return r ? { name: r.name, members: r.members, agentsRunning: r.agents_running, faces: r.faces ?? [] } : null;
    },

    async createRoom({ name, kind = 'room', listed = false, people = [], inviteOnly = false }) {
      await myId();
      return rpc('create_room', { p_name: name, p_kind: kind, p_listed: listed, p_people: people, p_invite_only: inviteOnly }, 'starting the room');
    },

    async renameRoom(roomId, name) {
      await myId();
      const rows = must(await client.from('rooms').update({ name: String(name).trim() }).eq('id', roomId).select('id'), 'renaming the room');
      if (!rows.length) throw new Error('only the room’s owner can rename it');
    },

    async leaveRoom(roomId) {
      const me = await myId();
      must(await client.from('room_members').delete().eq('room_id', roomId).eq('person_id', me), 'leaving the room');
    },

    async removeRoomMember(roomId, personId) {
      await myId();
      await rpc('remove_room_member', { r: roomId, p: personId }, 'removing them from the room');
    },

    async inviteToRoom(roomId, email) {
      const me = await myId();
      const clean = String(email).trim().toLowerCase();
      const { error } = await client.from('room_email_invites').insert({ room_id: roomId, email: clean, invited_by: me });
      if (error && error.code !== '23505') throw new Error(`inviting ${clean}: ${error.message}`);
    },

    async pendingRoomInvites() {
      await myId();
      const rows = (await rpc('pending_room_invites', {}, 'reading your room invites')) ?? [];
      return rows.map((r) => ({ roomId: r.room_id, roomName: r.room_name, invitedBy: r.invited_by ?? null, invitedByName: r.invited_by_name || null }));
    },

    async acceptRoomInvite(roomId) {
      await myId();
      return rpc('accept_room_invite', { r: roomId }, 'joining the room');
    },

    async agentboxRanks(ids) {
      await myId();
      const rows = (await rpc('agentbox_ranks', { ps: ids ?? [] }, `reading places on ${Name}`)) ?? [];
      return Object.fromEntries(rows.map((r) => [r.person_id, r.rank]));
    },

    // Realtime sends inserts and updates through row level security, never a
    // delete, so leaving is heard as a room_events or access_events insert.
    subscribeRooms(onEvent) {
      const channel = client.channel(`rooms-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_messages' }, (p) => onEvent({ kind: 'message', message: messageOut(p.new) }))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'room_presence' }, () => onEvent({ kind: 'presence' }))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'room_profiles' }, () => onEvent({ kind: 'profile' }))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_events' }, () => onEvent({ kind: 'membership' }))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'access_events' }, () => onEvent({ kind: 'membership' }))
        .subscribe();
      return () => { client.removeChannel(channel); };
    },
  };
}
