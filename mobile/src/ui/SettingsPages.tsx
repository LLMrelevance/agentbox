// The Settings pages, in the desktop's words (renderer/src/components/Settings.tsx).
// Each is only its plates, so a page can stand alone or sit with the others.
// A row that belongs to the computer reads its copy and sends a change to it
// (state/settings.tsx); the account and the alerts belong to this phone.
import { router } from 'expo-router';
import { useState, type ComponentType } from 'react';
import { View } from 'react-native';
import { CODEX_MODES, CODEX_MODE_ORDER } from '../../../renderer/src/codex-modes';
import { MODE_ORDER, MODE_SENTENCE, MODE_WORDS } from '../../../renderer/src/modes';
import { NAME } from '../../../shared/product-name.mjs';
import { withDeadline } from '../lib/deadline';
import { alertsHere, alertToken, sendTestAlert } from '../platform/alerts';
import { useCloud } from '../state/cloud';
import { useSettings, type SettingsState } from '../state/settings';
import { Tick } from './icons';
import { Sheet, SheetHead, SheetRow, SheetSep } from './parts';
import { Aside, Button, Chip, Choice, Group, NavRow, Row, Stepper, Switch } from './SettingsParts';
import { TeamPage } from './TeamPage';
import { color } from './theme';

const MODES = MODE_ORDER.filter((m) => m !== 'custom').map((m) => ({ value: m as string, label: MODE_WORDS[m] }));
const CODEX = CODEX_MODE_ORDER.map((m) => ({ value: m as string, label: CODEX_MODES[m].label }));
const AGENT_OPTIONS = [{ value: 'all', label: 'All of them' }, { value: 'waiting', label: 'Only the stuck ones' }, { value: 'off', label: 'None' }];
const AGENT_SENTENCE: Record<string, string> = {
  all: 'Each one is a row in your inbox. Closing it only takes it out of the inbox.',
  waiting: 'Only the ones waiting for you to type. The rest run without interrupting you.',
  off: 'None reach your inbox. Each is still in its project’s sidebar.',
};
const NOT_YET = 'Your computer has not sent its settings yet.';

/** A switch on the computer, with the phone's change laid over its copy. */
export function SettingSwitch({ label, desc, k, copy, first }: { label: string; desc?: string | null; k: string; copy: boolean; first?: boolean }) {
  const s = useSettings();
  const r = s.reading('workspace', k, copy);
  return <Row first={first} label={label} desc={desc} reading={r} control={<Switch label={label} on={!!r.value} onChange={(v) => void s.change({ scope: 'workspace', key: k, value: v })} />} />;
}

function General() {
  const c = useCloud();
  const s = useSettings();
  const w = s.settings?.workspace;
  return (
    <>
      <Group label="Account">
        <Row first label={`Signed in as ${c.cloud?.session()?.user.email ?? ''}`} control={<Button title="Sign out" onPress={() => { c.signOut(); router.replace('/sign-in'); }} />} />
      </Group>
      {w ? (
        <>
          <Group label={`What ${NAME} sends`}>
            <SettingSwitch first label="Counts and crash reports" desc={`That ${NAME} was opened, that a task was opened, that a reply was sent, and a report when something breaks. Never your code, your prompts, your keys or your paths, and never a title.`} k="diagnostics" copy={w.diagnostics} />
          </Group>
          <Group label="Updates"><Row first label={`${NAME} ${s.settings.version}`} /></Group>
        </>
      ) : <Aside>{NOT_YET}</Aside>}
    </>
  );
}

export function PhoneProjects({ first = true }: { first?: boolean }) {
  const s = useSettings();
  const [open, setOpen] = useState(false);
  const projects: { slug: string; name: string; onPhone: boolean }[] = s.settings?.projects ?? [];
  const r = s.reading('workspace', 'phoneProjects', null);
  const pending = r.value as { all: boolean; except: string[] } | null;
  const on = (slug: string) => (pending ? pending.all && !pending.except.includes(slug) : !!projects.find((p) => p.slug === slug)?.onPhone);
  const kept = projects.filter((p) => !on(p.slug)).map((p) => p.slug);
  const every = kept.length === 0 && projects.length > 0;
  const none = kept.length === projects.length;
  const word = every ? 'Every project' : none ? 'None' : `${projects.length - kept.length} of ${projects.length}`;
  const choose = (all: boolean, except: string[]) => void s.change({ scope: 'workspace', key: 'phoneProjects', value: { all, except } });
  const tick = (slug: string) => {
    const next = on(slug) ? [...kept, slug] : kept.filter((x) => x !== slug);
    choose(next.length < projects.length, next.length < projects.length ? next : []);
  };
  return (
    <>
      <Row first={first} label="Projects on your phone" desc="A copy of their threads is kept in your account, so your phone can read and reply with this computer closed." reading={r}
        control={<Chip label="Projects on your phone" now={word} onPress={() => setOpen(true)} />} />
      <Sheet open={open} close={() => setOpen(false)}>
        <SheetHead>Projects on your phone</SheetHead>
        <SheetRow label="Every project" aside="New ones too" on={every} onPress={() => choose(true, [])} />
        <SheetRow label="None" aside="Everything stays on this computer" on={none} onPress={() => choose(false, [])} />
        <SheetSep />
        {projects.map((p) => <SheetRow key={p.slug} label={p.name} lead={<View style={{ width: 22, alignItems: 'center' }}>{on(p.slug) ? <Tick size={18} tint={color.text} /> : null}</View>} onPress={() => tick(p.slug)} />)}
      </Sheet>
    </>
  );
}

export function AlertRows({ first = true }: { first?: boolean }) {
  const [token, setToken] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const attempt = (fn: () => Promise<void>) => async () => {
    setBusy(true); setSaid(null);
    try { await fn(); } catch (err) { setSaid(String((err as Error)?.message ?? err)); } finally { setBusy(false); }
  };
  if (!alertsHere) return <Row first={first} label="Alerts on this phone" desc="Alerts need the app on your phone." />;
  if (!token) return <Row first={first} label="Alerts on this phone" desc={said ?? 'A thread that needs you arrives on the lock screen.'} control={<Button title="Turn on" disabled={busy} onPress={attempt(async () => setToken(await alertToken()))} />} />;
  return (
    <>
      <Row first={first} label="Alerts on this phone" desc="On. A thread that needs you arrives on the lock screen." />
      <Row label="Send a test alert" desc={said ?? 'Lock your phone after sending to see it arrive.'} control={<Button title="Send" disabled={busy} onPress={attempt(async () => { await sendTestAlert(token, withDeadline(fetch)); setSaid('Sent. Lock your phone to see it arrive.'); })} />} />
    </>
  );
}

function Phone() {
  const s = useSettings();
  return (
    <>
      {s.settings ? <Group label="On your phone"><PhoneProjects /></Group> : null}
      <Group label="Alerts"><AlertRows /></Group>
    </>
  );
}

type Account = { id: string; email: string | null; name?: string | null; plan: string | null; chosen: boolean; note?: string | null; signedIn?: boolean };
function Accounts({ engine, list }: { engine: 'claude' | 'codex'; list: Account[] }) {
  const s = useSettings();
  const r = s.reading('workspace', 'activeAccount', null);
  const asked = r.value as { engine: string; account: string | null } | null;
  const mine = asked?.engine === engine ? asked : null;
  const chosen = (a: Account) => (mine ? mine.account === a.id : a.chosen);
  const picked = list.some(chosen);
  if (!list.length) return <Row first label="Not signed in" />;
  return (
    <>
      {list.map((a, i) => {
        const live = picked && chosen(a);
        return (
          <Row key={a.id} first={i === 0} label={a.email ?? a.name ?? 'Not signed in'} badge={live ? 'In use' : undefined}
            desc={a.note ?? (a.signedIn === false ? 'Finish signing in to use it' : a.plan ?? 'Signed in')}
            reading={mine && live ? r : undefined}
            control={!live && list.length > 1 ? <Button title={picked ? 'Use this one' : 'Use only this one'} onPress={() => void s.change({ scope: 'workspace', key: 'activeAccount', value: { engine, account: a.id } })} /> : undefined} />
        );
      })}
    </>
  );
}

function Claude() {
  const s = useSettings();
  const w = s.settings?.workspace;
  if (!w) return <Aside>{NOT_YET}</Aside>;
  const r = s.reading('workspace', 'permission', w.permission);
  return (
    <>
      {!w.claude.found ? <Group label="Status"><Row first label="Claude Code is not on this computer" /></Group> : null}
      <Group label="Signed in"><Accounts engine="claude" list={w.accounts} /></Group>
      <Group label="Permissions">
        {w.permission === 'custom'
          ? <Row first label="Permission mode" desc={MODE_SENTENCE.custom} />
          : <Row first label="Permission mode" desc={MODE_SENTENCE[r.value as keyof typeof MODE_SENTENCE]} reading={r}
            control={<Choice label="Permission mode" value={r.value as string} options={MODES} onChange={(v) => void s.change({ scope: 'workspace', key: 'permission', value: v })} />} />}
      </Group>
    </>
  );
}

function Codex() {
  const s = useSettings();
  const w = s.settings?.workspace;
  if (!w) return <Aside>{NOT_YET}</Aside>;
  const r = s.reading('workspace', 'codexMode', w.codexMode ?? 'auto');
  return (
    <>
      {!w.codex.found ? <Group label="Status"><Row first label="Codex is not on this computer" /></Group> : null}
      <Group label="Signed in"><Accounts engine="codex" list={w.codexAccounts} /></Group>
      <Group label="Permissions">
        <Row first label="Permission mode" desc={CODEX_MODES[r.value as keyof typeof CODEX_MODES]?.what} reading={r}
          control={<Choice label="Permission mode" value={r.value as string} options={CODEX} onChange={(v) => void s.change({ scope: 'workspace', key: 'codexMode', value: v })} />} />
      </Group>
    </>
  );
}

/** "How many run at once", one row, so a page of quick settings can carry it too. */
export function AgentsAtOnce({ first = true }: { first?: boolean }) {
  const s = useSettings();
  const w = s.settings!.workspace;
  const auto = s.reading('workspace', 'agentsAuto', w.agentsAuto);
  const count = s.reading('workspace', 'sessionsAtOnce', w.sessionsAtOnce);
  const isAuto = isAutoNow(s, w);
  const say = (n: number) => `${n} ${n === 1 ? 'agent' : 'agents'}`;
  const options = [{ value: 'auto', label: `Automatic (${say(w.agentsTotal)})` }, ...Array.from({ length: w.slotsMax ?? 12 }, (_, i) => ({ value: String(i + 1), label: say(i + 1) }))];
  return (
    <Row first={first} stack label="How many run at once" reading={auto.waiting || auto.refused ? auto : count}
      desc={isAuto ? 'From this computer’s memory, kept there as you add accounts or turn the memory check on.' : `You set this. Automatic would run ${w.agentsAutoTotal ?? w.sessionsAtOnce} on this computer.`}
      control={<Choice label="How many run at once" value={isAuto ? 'auto' : String(count.value)} options={options}
        onChange={(v) => void (v === 'auto' ? s.change({ scope: 'workspace', key: 'agentsAuto', value: true }) : s.change({ scope: 'workspace', key: 'sessionsAtOnce', value: Number(v) }))} />} />
  );
}
const isAutoNow = (s: SettingsState, w: any) => {
  const auto = s.reading('workspace', 'agentsAuto', w.agentsAuto);
  const count = s.reading('workspace', 'sessionsAtOnce', w.sessionsAtOnce);
  return auto.waiting ? !!auto.value : count.waiting ? false : !!auto.value;
};

export function PermissionRow({ first = true }: { first?: boolean }) {
  const s = useSettings();
  const w = s.settings!.workspace;
  const r = s.reading('workspace', 'permission', w.permission);
  if (w.permission === 'custom') return <Row first={first} label="Claude Code permission mode" desc={MODE_SENTENCE.custom} />;
  return <Row first={first} label="Claude Code permission mode" desc={MODE_SENTENCE[r.value as keyof typeof MODE_SENTENCE]} reading={r}
    control={<Choice label="Permission mode" value={r.value as string} options={MODES} onChange={(v) => void s.change({ scope: 'workspace', key: 'permission', value: v })} />} />;
}

function Running() {
  const s = useSettings();
  const w = s.settings?.workspace;
  if (!w) return <Aside>{NOT_YET}</Aside>;
  const two = w.engines.length > 1;
  const gate = s.reading('workspace', 'memoryGate', w.memoryGate.on);
  const slots = s.reading('workspace', 'memoryGateSlots', w.memoryGate.slots);
  const slow = s.reading('workspace', 'agentsFeltSlow', null);
  const outside = s.reading('workspace', 'outsideAgents', w.outsideAgents);
  return (
    <>
      <Group label="Agents">
        <AgentsAtOnce />
        <Row label="Hold heavy work when memory is short" reading={gate}
          desc={`Tests and builds take turns, urgent first, and new agents wait to start until memory frees up.${two ? ' Claude Code and Codex both.' : ''}`}
          control={<Switch label="Hold heavy work when memory is short" on={!!gate.value} onChange={(v) => void s.change({ scope: 'workspace', key: 'memoryGate', value: v })} />} />
        {gate.value && !isAutoNow(s, w) ? (
          <Row label="Heavy commands at once" reading={slots}
            desc={slots.value === null ? `Auto: ${w.memoryGate.slotsAuto} on this computer, one for every 8 GB of memory.` : `You picked ${slots.value}. Auto is ${w.memoryGate.slotsAuto} on this computer.`}
            control={<Stepper label="Heavy commands at once" value={(slots.value as number | null) ?? w.memoryGate.slotsAuto} min={1} max={w.memoryGate.slotsMax ?? 8}
              onChange={(v) => void s.change({ scope: 'workspace', key: 'memoryGateSlots', value: v === w.memoryGate.slotsAuto ? null : v })} />} />
        ) : null}
        <SettingSwitch label="Stop programs agents leave behind" k="cleanupLeftovers" copy={w.leftovers.on}
          desc={`Dev servers, previews and test runs an agent started keep running until you close its task, or until memory runs short. Apps installed on this computer are never stopped.${two ? ' Codex agents’ programs are not found yet.' : ''}`} />
        <Row label="Something felt slow" reading={slow}
          desc={w.agentsNudge ? `${NAME} is running ${w.agentsNudge} fewer than this computer suggests.` : `${NAME} runs one fewer from now on, and remembers that it did.`}
          control={<View style={{ flexDirection: 'row', gap: 8 }}>
            {w.agentsNudge ? <Button title="Undo" onPress={() => void s.change({ scope: 'workspace', key: 'agentsFeltSlow', value: 'reset' })} /> : null}
            <Button title="Tell it" onPress={() => void s.change({ scope: 'workspace', key: 'agentsFeltSlow', value: 'more' })} />
          </View>} />
      </Group>
      <Group label="Agents you started yourself">
        <OutsideAgents />
      </Group>
    </>
  );
}

function OutsideAgents() {
  const s = useSettings();
  const r = s.reading('workspace', 'outsideAgents', s.settings!.workspace.outsideAgents);
  return <Row first stack label="Show in your inbox" desc={`Claude Code started in a terminal, not from here. ${AGENT_SENTENCE[r.value as string] ?? ''}`} reading={r}
    control={<Choice label="Show in your inbox" value={r.value as string} options={AGENT_OPTIONS} onChange={(v) => void s.change({ scope: 'workspace', key: 'outsideAgents', value: v })} />} />;
}

function Instructions() {
  const s = useSettings();
  const w = s.settings?.workspace;
  if (!w) return <Aside>{NOT_YET}</Aside>;
  return (
    <>
      <Group><SettingSwitch first label="ADHD mode" k="adhdMode" copy={w.adhdMode} /></Group>
      <Aside>Your instructions are edited on your computer.</Aside>
    </>
  );
}

function Alpha() {
  const s = useSettings();
  const w = s.settings?.workspace;
  if (!w) return <Aside>{NOT_YET}</Aside>;
  return (
    <Group>
      <SettingSwitch first label="Neo" desc="A voice you wake by tapping ⌘ twice. Takes effect after a restart." k="alphaNeo" copy={w.alpha.neo} />
      <SettingSwitch label="Rooms" desc="See the people you work with and their agents, with a chat beside them. Needs a team sign-in." k="alphaRooms" copy={w.alpha.rooms} />
    </Group>
  );
}

function Projects() {
  const s = useSettings();
  const projects: { slug: string; name: string; running: number }[] = s.settings?.projects ?? [];
  if (!projects.length) return <Aside>{s.settings ? 'No projects yet.' : NOT_YET}</Aside>;
  return (
    <Group>
      {projects.map((p, i) => <NavRow key={p.slug} first={i === 0} label={p.name} aside={p.running ? `${p.running} running` : undefined} onPress={() => router.push({ pathname: '/settings/project/[slug]', params: { slug: p.slug } })} />)}
    </Group>
  );
}

export type PageId = 'general' | 'phone' | 'alpha' | 'claude' | 'codex' | 'running' | 'instructions' | 'projects' | 'team';
export interface SettingsPageDef { id: PageId; label: string; group: 'Personal' | 'Agents' | 'Workspace'; lede?: string; Body: ComponentType; shown: (s: SettingsState) => boolean }

const hasComputer = (s: SettingsState) => !!s.settings;
export const SETTINGS_PAGES: SettingsPageDef[] = [
  { id: 'general', label: 'General', group: 'Personal', Body: General, shown: () => true },
  { id: 'phone', label: 'Phone', group: 'Personal', lede: 'Read and reply from your phone, even with this computer closed.', Body: Phone, shown: () => true },
  { id: 'alpha', label: 'Alpha features', group: 'Personal', lede: 'Early features you can try before they are finished. They may change or go away.', Body: Alpha, shown: hasComputer },
  { id: 'claude', label: 'Claude Code', group: 'Agents', Body: Claude, shown: hasComputer },
  { id: 'codex', label: 'Codex', group: 'Agents', Body: Codex, shown: (s) => !!s.settings && (s.settings.workspace.engines.includes('codex') || s.settings.workspace.codex.found) },
  { id: 'running', label: 'Running', group: 'Agents', Body: Running, shown: hasComputer },
  { id: 'instructions', label: 'Instructions', group: 'Agents', Body: Instructions, shown: hasComputer },
  { id: 'projects', label: 'Projects', group: 'Workspace', Body: Projects, shown: hasComputer },
  { id: 'team', label: 'Team', group: 'Workspace', Body: TeamPage, shown: () => true },
];
export const GROUPS = ['Personal', 'Agents', 'Workspace'] as const;
