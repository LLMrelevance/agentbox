// THE APP WITH NO ACCOUNT BEHIND IT, for drawing its screens in a browser
// (EXPO_PUBLIC_PREVIEW=1). Made-up threads in the shape a Mac sends, and a
// stand-in for the cloud that keeps what the phone sends in memory.
import type { PhoneRows } from '../../../renderer/src/phone-rows';

const DEV = '0a1b2c3d4e5f';
const MIN = 60_000;
const her = (ts: number) => ({ ts, source: 'founder' });
const agent = (ts: number) => ({ ts, source: 'agent' });

export function previewRows(now = Date.now()): PhoneRows {
  const at = (m: number) => now - m * MIN;
  const iso = (ms: number) => new Date(ms).toISOString();
  const thread = (project: string, item: any, history: any[], extra: Record<string, unknown> = {}) => ({
    device: DEV, project, item: item.id, updated_at: iso(item.updatedAt),
    snapshot: { v: 3, item: { kind: 'directive', labels: ['founder'], priority: 0, ...item }, history: history.map((l) => ({ id: item.id, ...l })), olderLines: 0, ...extra },
  });
  const planAsk = 'Plan the phone app. I want alerts that reach my lock screen and a way to reply without opening the Mac.';
  const planResult = 'The plan is ready and Codex has reviewed it.\n\nThe first version signs you in, shows your inbox and lets you reply. Alerts come next, then messages between people.\n\n**Getting it approved** is mostly about two things: deleting an account has to delete what you shared, and messages need a report button.\n\n## Options\n1. Start building the first version (recommended)\n2. Wait until the Apple account is checked';
  const stuckAsk = 'Threads stuck on a Codex limit should land in Needs you.';
  const stuckNote = 'I found where a run that hits its limit is put back. Two ways to fix it:\n\n- Mark it stopped, so it shows in Needs you with the reason.\n- Retry on another account first, and only then show it.\n\n## Options\n1. Mark it stopped (recommended)\n2. Retry on another account first';
  const meterResult = 'Shipped. Each account meter now ends with its reset time, like 6:19pm.\n\n## Options\n1. Close this task';
  return {
    projects: [
      { device: DEV, project: 'agentbox', name: 'Agentbox', updated_at: iso(at(1)) },
      { device: DEV, project: 'film', name: 'Launch film', updated_at: iso(at(1)) },
      { device: DEV, project: 'site', name: 'Website', updated_at: iso(at(1)) },
    ],
    threads: [
      thread('agentbox', { id: 'w-1a2b3c4d5e', title: 'Plan the phone app', status: 'done', priority: 7, body: planAsk, result: planResult, createdAt: at(300), updatedAt: at(6), wrote: { body: her(at(300)), status: agent(at(6)), result: agent(at(6)) } }, [
        { ts: at(300), source: 'founder', patch: { body: planAsk } },
        { ts: at(120), source: 'agent', patch: { note: 'Read the phone site and the team messaging code. Checking what App Review asks of an app like this next.' } },
        { ts: at(6), source: 'agent', patch: { status: 'done', result: planResult } },
      ]),
      thread('agentbox', { id: 'w-2b3c4d5e6f', title: 'Stuck threads should land in Needs you', status: 'blocked', priority: 5, body: stuckAsk, note: stuckNote, createdAt: at(90), updatedAt: at(14), wrote: { body: her(at(90)), status: agent(at(14)), note: agent(at(14)) } }, [
        { ts: at(90), source: 'founder', patch: { body: stuckAsk } },
        { ts: at(14), source: 'agent', patch: { status: 'blocked', note: stuckNote } },
      ]),
      thread('site', { id: 'w-3c4d5e6f7a', title: 'Show when each account limit resets', status: 'done', priority: 0, body: 'I need to see when my limits reset.', result: meterResult, createdAt: at(200), updatedAt: at(52), wrote: { body: her(at(200)), status: agent(at(52)), result: agent(at(52)) } }, [
        { ts: at(200), source: 'founder', patch: { body: 'I need to see when my limits reset.' } },
        { ts: at(52), source: 'agent', patch: { status: 'done', result: meterResult } },
      ]),
      thread('agentbox', { id: 'w-4d5e6f7a8b', title: 'Draw the sign-in screen', status: 'claimed', priority: 5, body: 'Draw five sign-in screens on the real app.', createdAt: at(40), updatedAt: at(2), wrote: { body: her(at(40)) } }, [
        { ts: at(40), source: 'founder', patch: { body: 'Draw five sign-in screens on the real app.' } },
      ], { live: { since: at(12), at: at(0.5), where: 'cloud', doing: [{ label: 'Drawing the third screen', startedAt: at(1) }] } }),
      thread('film', { id: 'w-5e6f7a8b9c', title: 'Write the launch script', status: 'open', priority: 0, body: 'A script for the launch film.', answer: 'Shorter, and open with the inbox.', createdAt: at(500), updatedAt: at(25), wrote: { body: her(at(500)), answer: her(at(25)), result: agent(at(60)) }, result: 'Here is a first draft.' }, [
        { ts: at(500), source: 'founder', patch: { body: 'A script for the launch film.' } },
        { ts: at(60), source: 'agent', patch: { result: 'Here is a first draft.' } },
        { ts: at(25), source: 'founder', patch: { answer: 'Shorter, and open with the inbox.' } },
      ]),
      thread('site', { id: 'w-6f7a8b9c0d', title: 'Try a light theme for the phone', status: 'open', priority: 0, body: 'Try a light theme.', snoozedUntil: now + 20 * 60 * MIN, createdAt: at(800), updatedAt: at(700), wrote: { body: her(at(800)), snoozedUntil: her(at(700)) } }, [
        { ts: at(800), source: 'founder', patch: { body: 'Try a light theme.' } },
      ]),
      thread('agentbox', { id: 'w-7a8b9c0d1e', title: 'Rename the Display menu', status: 'done', priority: 0, body: 'Rename it to View.', result: 'Renamed.', createdAt: at(3000), updatedAt: at(1500), wrote: { body: her(at(3000)), result: agent(at(1600)), status: her(at(1500)) } }, [
        { ts: at(3000), source: 'founder', patch: { body: 'Rename it to View.' } },
        { ts: at(1600), source: 'agent', patch: { result: 'Renamed.' } },
      ]),
    ],
    commands: [],
  };
}

/** A stand-in for the sign-in client (renderer/src/cloud-rest.ts), signed in. */
export function previewCloud(now = () => Date.now()) {
  const rows = previewRows(now());
  let signedIn = true;
  const session = () => (signedIn ? { access_token: 'preview', refresh_token: 'preview', expires_at: now() + 3600_000, user: { id: 'preview', email: 'you@example.com' } } : null);
  return {
    session,
    signedIn: () => signedIn,
    generation: () => 0,
    async select(table: string, query: string) {
      if (table === 'phone_projects') return rows.projects;
      if (table === 'phone_threads') return rows.threads;
      if (table === 'phone_commands') return /taken_at=is\.null/.test(query) ? rows.commands.filter((c) => !c.taken_at) : rows.commands.filter((c) => c.taken_at);
      return [];
    },
    async insertCommand(row: Record<string, any>) {
      const made = { id: `c-${rows.commands.length + 1}`, payload: {}, item: null, ...row, created_at: new Date(now()).toISOString(), claimed_at: null, taken_at: null, outcome: null } as PhoneRows['commands'][number];
      rows.commands.push(made);
      return made;
    },
    async signInWithPassword() { signedIn = true; return session()!; },
    async signInWithIdToken() { signedIn = true; return session()!; },
    async googleUrl() { return ''; },
    async finishGoogle() { signedIn = true; return session()!; },
    signOut() { signedIn = false; },
  };
}
