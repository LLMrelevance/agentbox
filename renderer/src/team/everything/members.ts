// Everything else's cards: you, the team chat, the people on your team, your AI
// teammates and your other chats, in the order you dragged them into.

export type MemberKind = 'me' | 'person' | 'mate' | 'chat';

export interface Member {
  /** `me`, `person:<id>`, `mate:<id>`, or a chat's own key (`room:<id>`, `direct:<id>`). */
  key: string;
  kind: MemberKind;
  name: string;
  /** The name a face's initials come from, where the card says "You". */
  faceName?: string;
  avatarUrl?: string | null;
  /** An AI teammate's letter. */
  letter?: string;
  role?: string | null;
  level?: number | null;
  /** Agents running now; null when they keep it to themselves. */
  agents: number | null;
  /** What they are on, or the line that says why nothing is running. */
  now: string | null;
  /** A chat's people, its newest line, and whether it holds something you have not read. */
  faces?: { name: string; url: string | null }[];
  last?: string;
  unread?: boolean;
  /** The team's own chat. */
  team?: boolean;
  /** When a chat last moved, for the order of chats nobody dragged. */
  at?: number;
}

type PersonIn = { id: string; name: string; avatarUrl: string | null };
type CardIn = { id: string; name: string; me: boolean; avatarUrl: string | null; agents: number | null; level: number | null; workingOn: string | null; workingPrivate: boolean; status: string | null; away?: boolean };
type MateIn = { id: string; name: string; letter: string; role: string | null; now: string | null; status: string; paused: boolean };
type ChatIn = { key: string; name: string; faces: { name: string; url: string | null }[]; last: string; at: number; unread: boolean };
type ThreadIn = { personId: string; state: string; title: string | null; updatedAt: number };

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

function quietLine(c: CardIn): string | null {
  if (c.agents) return c.workingOn ?? (c.workingPrivate ? 'Private thread' : null);
  return c.status ?? (c.away ? 'Not on Rooms yet' : c.workingOn);
}

export function buildMembers({ me, people = [], wall = null, cards = [], teammates = [], mateAgents = new Map(), chats = [], personChats = new Map(), teamRoomId = null, myAgents = 0, myNow = null }: {
  me: PersonIn | null;
  /** The people on your team, you among them. */
  people?: readonly PersonIn[];
  /** The team room's cards, when Rooms is on: level, agents running and what each is on. */
  wall?: readonly CardIn[] | null;
  /** Teammates' shared threads, which say who is running something when there is no wall. */
  cards?: readonly ThreadIn[];
  teammates?: readonly MateIn[];
  /** Agents running now for each AI teammate. */
  mateAgents?: ReadonlyMap<string, number>;
  /** Every chat you are in: rooms, groups, and direct records. */
  chats?: readonly ChatIn[];
  /** A teammate's one-to-one chat, by their id: their card opens it, so it is no card of its own. */
  personChats?: ReadonlyMap<string, string>;
  teamRoomId?: string | null;
  /** This Mac's own count and newest thread, when there is no wall to say. */
  myAgents?: number; myNow?: string | null;
}): Member[] {
  const cardOf = new Map((wall ?? []).map((c) => [c.id, c]));
  const meCard = (wall ?? []).find((c) => c.me) ?? (me ? cardOf.get(me.id) : undefined);
  const out: Member[] = [{
    key: 'me', kind: 'me', name: 'You', faceName: me?.name, avatarUrl: me?.avatarUrl ?? meCard?.avatarUrl ?? null, level: meCard?.level ?? null,
    agents: meCard ? meCard.agents : myAgents, now: meCard ? quietLine(meCard) ?? myNow : myNow,
  }];
  const team = teamRoomId ? chats.find((c) => c.key === `room:${teamRoomId}`) : undefined;
  const humans = people.filter((p) => p.id !== me?.id).slice().sort(byName);
  // A named room has no faces of its own; the team's chat wears the team's.
  const teamFaces = team?.faces.length ? team.faces : humans.map((p) => ({ name: p.name, url: p.avatarUrl ?? cardOf.get(p.id)?.avatarUrl ?? null }));
  if (team) out.push({ key: team.key, kind: 'chat', team: true, name: 'Team chat', faces: teamFaces, last: team.last, unread: team.unread, agents: null, now: null, at: team.at });
  for (const p of humans) {
    const c = cardOf.get(p.id);
    const running = cards.filter((t) => t.personId === p.id && t.state === 'running').sort((a, b) => b.updatedAt - a.updatedAt);
    out.push(c
      ? { key: `person:${p.id}`, kind: 'person', name: p.name, avatarUrl: p.avatarUrl ?? c.avatarUrl, level: c.level, agents: c.agents, now: quietLine(c) }
      : { key: `person:${p.id}`, kind: 'person', name: p.name, avatarUrl: p.avatarUrl, level: null, agents: running.length, now: running[0]?.title ?? null });
  }
  for (const t of teammates) {
    out.push({ key: `mate:${t.id}`, kind: 'mate', name: t.name, letter: t.letter || t.name.slice(0, 1), role: t.role, agents: mateAgents.get(t.id) ?? 0,
      now: t.paused ? 'Paused' : t.status === 'draft' ? 'Setting up' : t.now });
  }
  const teamCard = out.find((m) => m.team);
  if (teamCard) teamCard.agents = out.reduce((n, m) => n + (m.kind === 'person' || m.kind === 'mate' ? m.agents ?? 0 : 0), 0);
  // A chat with one person is that person's card; a chat with several, or a group, is a chat of its own.
  const theirs = new Set(personChats.values());
  const others = chats.filter((c) => c !== team && !theirs.has(c.key) && !(c.key.startsWith('direct:') && c.faces.length <= 1)).slice().sort((a, b) => b.at - a.at);
  for (const c of others) out.push({ key: c.key, kind: 'chat', team: false, name: c.name, faces: c.faces, last: c.last, unread: c.unread, agents: null, now: null, at: c.at });
  return out;
}

const OPEN_FIRST: Record<string, number> = { running: 0, claimed: 0, waiting: 1, open: 1, blocked: 1, scheduled: 2, done: 3 };

/** An AI teammate's threads for its Agents tab: everything not finished, then what it finished today. */
export function mateRunsOf<T extends { id: string; labels?: string[]; status: string; updatedAt?: number }>(items: readonly T[], mateId: string, dayStart: number): T[] {
  const label = `teammate:${mateId}`;
  return items.filter((i) => i.labels?.includes(label) && (i.status !== 'done' || (i.updatedAt ?? 0) >= dayStart))
    .sort((a, b) => (OPEN_FIRST[a.status] ?? 1) - (OPEN_FIRST[b.status] ?? 1) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

/** A person's shared threads for their Agents tab: running, waiting, later, then what they finished today. */
export function personCardsOf<T extends ThreadIn & { visible: boolean }>(cards: readonly T[], personId: string, dayStart: number): T[] {
  return cards.filter((c) => c.personId === personId && c.visible && (c.state !== 'done' || c.updatedAt >= dayStart))
    .sort((a, b) => (OPEN_FIRST[a.state] ?? 1) - (OPEN_FIRST[b.state] ?? 1) || b.updatedAt - a.updatedAt);
}

export type TeamRun<C, I> = { card: C; item?: undefined } | { item: I; card?: undefined };

/** The team chat's Agents tab: the people's shared threads and the AI teammates' threads together, working first. */
export function teamRunsOf<C extends ThreadIn & { visible: boolean }, I extends { id: string; labels?: string[]; status: string; updatedAt?: number }>(
  cards: readonly C[], items: readonly I[], people: readonly string[], mates: readonly string[], dayStart: number,
): TeamRun<C, I>[] {
  const all = [
    ...people.flatMap((p) => personCardsOf(cards, p, dayStart)).map((card) => ({ run: { card } as TeamRun<C, I>, state: card.state, at: card.updatedAt })),
    ...mates.flatMap((t) => mateRunsOf(items, t, dayStart)).map((item) => ({ run: { item } as TeamRun<C, I>, state: item.status, at: item.updatedAt ?? 0 })),
  ];
  return all.sort((a, b) => (OPEN_FIRST[a.state] ?? 1) - (OPEN_FIRST[b.state] ?? 1) || b.at - a.at).map((r) => r.run);
}

/** The saved order, with anyone new where they would be by default and anyone gone left out. */
export function orderMembers<T extends { key: string }>(members: readonly T[], saved: readonly string[] | null): T[] {
  if (!saved?.length) return [...members];
  const byKey = new Map(members.map((m) => [m.key, m]));
  const out: T[] = saved.filter((k) => byKey.has(k)).map((k) => byKey.get(k)!);
  members.forEach((m, i) => {
    if (out.includes(m)) return;
    // Right after whoever comes before it by default, or first.
    const before = i > 0 ? out.indexOf(members[i - 1]) : -1;
    out.splice(before + 1, 0, m);
  });
  return out;
}

/** One card dropped on another: before it, or after it when dropped on its far half. */
export function moveMember(keys: readonly string[], from: string, onto: string, side: 'before' | 'after' = 'before'): string[] {
  if (from === onto || !keys.includes(from) || !keys.includes(onto)) return [...keys];
  const rest = keys.filter((k) => k !== from);
  const at = rest.indexOf(onto) + (side === 'after' ? 1 : 0);
  rest.splice(at, 0, from);
  return rest;
}

const ORDER_KEY = 'agentbox.everything.order';
type Store = Pick<Storage, 'getItem' | 'setItem'> | null;
const local = (): Store => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function readOrder(store: Store = local()): string[] | null {
  try {
    const raw = store?.getItem(ORDER_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return Array.isArray(v) && v.every((k) => typeof k === 'string') ? v : null;
  } catch { return null; }
}

export function writeOrder(keys: readonly string[], store: Store = local()) {
  try { store?.setItem(ORDER_KEY, JSON.stringify(keys)); } catch { /* kept for this window only */ }
}
