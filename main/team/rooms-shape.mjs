// The columns both room backends read and write, so they hand the app the
// same shapes.
export const PROFILE_FIELDS = ['display_name', 'avatar_url', 'headline', 'bio', 'show_working', 'show_agents', 'show_level', 'show_status', 'invisible_until', 'status_text', 'status_until'];
export const PRESENCE_FIELDS = ['gone', 'agents_running', 'working_on', 'working_private', 'working_at', 'hours_total', 'hours_week', 'week_start', 'hours_today', 'day', 'streak_days', 'active_days', 'hours_by_month'];
export const PROFILE_COLS = ['person_id', ...PROFILE_FIELDS, 'updated_at'].join(',');
export const PRESENCE_COLS = ['person_id', 'device', ...PRESENCE_FIELDS, 'updated_at'].join(',');

export const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o && k in o).map((k) => [k, o[k]]));

export const roomOut = (r) => ({
  id: r.id, name: r.name, kind: r.kind, teamId: r.team_id ?? null, listed: !!r.listed, inviteOnly: !!r.invite_only,
  role: r.role, members: Number(r.members) || 0, createdAt: Date.parse(r.created_at) || 0,
});

export const messageOut = (r) => ({
  id: r.id, roomId: r.room_id, by: r.by_person ?? null, body: r.body, inReplyTo: r.in_reply_to ?? null,
  mentions: r.mentions ?? [], at: Date.parse(r.created_at),
});
