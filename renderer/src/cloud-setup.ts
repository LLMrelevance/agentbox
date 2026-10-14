// WHAT THE CLOUD SETUP SAYS AT EVERY MOMENT (components/CloudSetup.tsx draws
// it; tests/the-cloud-is-set-up-on-its-own-screen reads it).
//
// The founder, 2026-10-14, on a sign-in walked through inside the cloud menu:
// "If you're getting set up with Claude for the first time, it should maybe
// say, 'You're not set up. You should get set up,' and then it should walk
// you through it. The component shouldn't walk you through it." So the menu
// says one line and offers Set up, and the setup is its own screen, built
// from the first-run walk's setup card (components/PlanSetup.tsx), which is
// how this app already gets somebody signed in.
import { cloudNeedsSignIn, type CloudAccount, type CloudStatus } from './cloud-menu';

export type StepState = 'done' | 'now' | 'todo';
export interface SetupStep { key: string; title: string; sub?: string; state: StepState }

export const SETUP = {
  introHead: 'Run your agents in the cloud',
  introLede: 'Each account signs in once, on Claude’s or OpenAI’s own page.',
  introGets: [
    { key: 'lid', title: 'Keeps working with your laptop closed', sub: 'Threads carry on and land in your inbox.' },
    { key: 'many', title: 'As many at once as you need', sub: 'No longer held back by this Mac’s memory.' },
    { key: 'plans', title: 'On your own plans', sub: 'Your Claude and ChatGPT subscriptions, never an API key.' },
  ],
  introAccounts: 'To sign in',
  introGo: (n: number) => (n > 1 ? `Set up ${n} accounts` : 'Set up'),
  inviteHead: 'Run your agents in the cloud',
  inviteLine: 'They keep working with your laptop closed, and as many run at once as you need.',
  inviteGo: 'Set up the cloud',
  inviteNote: 'About a minute per account',
  screenLabel: 'Set up the cloud',
  signInHead: (engine: CloudAccount['engine']) => (engine === 'codex' ? 'Sign in to Codex' : 'Sign in to Claude'),
  of: (n: number, total: number) => `${n} of ${total}`,
  openAgain: 'Open the page again',
  tryAgain: 'Try again',
  skip: 'Skip this account',
  pastePlaceholder: 'Paste the code',
  pasteGo: 'Continue',
  copy: 'Copy',
  copied: 'Copied',
  doneHead: 'You’re set up',
  doneLede: 'Your agents can run in the cloud now. Where should new threads start?',
  menuNone: 'Not set up yet.',
  menuSome: (n: number) => (n === 1 ? '1 account still needs to sign in.' : `${n} accounts still need to sign in.`),
  menuBroken: 'An account needs to sign in again.',
  menuGo: 'Set up',
  menuFinish: 'Finish setup',
};

// The menu's one line, and its one button. Null once every account is ready.
export function menuSetupLine(status: CloudStatus): { say: string; go: string } | null {
  const pending = cloudNeedsSignIn(status);
  if (!pending.length) return null;
  const accounts = status.accounts || [];
  if (pending.some((a) => a.state === 'broken')) return { say: SETUP.menuBroken, go: SETUP.menuGo };
  if (pending.length === accounts.length) return { say: SETUP.menuNone, go: SETUP.menuGo };
  return { say: SETUP.menuSome(pending.length), go: SETUP.menuFinish };
}

const going = (a: CloudAccount) => !!a.signIn && ['starting', 'needs-code', 'waiting', 'checking'].includes(a.signIn.state);
export const keyOf = (a: CloudAccount) => `${a.engine}:${a.profile}`;

// The account the setup is on: one already signing in, else the first of the
// ones it set out to do that is not ready and was not skipped.
export function currentAccount(accounts: CloudAccount[], order: string[], skipped: string[] = []): CloudAccount | null {
  const live = accounts.find(going);
  if (live) return live;
  for (const k of order) {
    const a = accounts.find((x) => keyOf(x) === k);
    if (a && !a.ready && !skipped.includes(k)) return a;
  }
  return null;
}

// THE THREE STEPS OF ONE ACCOUNT'S SIGN-IN, the setup card's rows.
export function stepsFor(a: CloudAccount): SetupStep[] {
  const s = a.signIn?.state ?? null;
  const codex = a.engine === 'codex';
  const failed = s === 'failed';
  const opened = s === 'needs-code' || s === 'waiting' || s === 'checking' || s === 'saved' || a.ready;
  const entered = s === 'checking' || s === 'saved' || a.ready;
  return [
    {
      key: 'open',
      title: codex ? 'Open OpenAI’s sign-in page' : 'Open Claude’s sign-in page',
      sub: opened ? 'It opened in your browser.' : failed ? undefined : 'Opening it in your browser…',
      state: opened ? 'done' : failed ? 'todo' : 'now',
    },
    {
      key: 'code',
      title: codex ? 'Enter this code on that page' : 'Approve, then paste the code Claude shows',
      sub: codex && s === 'waiting' ? 'This step finishes by itself once you have.' : undefined,
      state: entered ? 'done' : opened ? 'now' : 'todo',
    },
    {
      key: 'ready',
      title: 'Ready for the cloud',
      sub: s === 'checking' ? 'Checking the sign-in works…' : undefined,
      state: a.ready || s === 'saved' ? 'done' : s === 'checking' ? 'now' : 'todo',
    },
  ];
}

// The last screen's question: where new threads start, now that they can.
export const WHERE_ROWS = [
  { key: 'all', name: 'Everything', sub: 'In the cloud first, wherever they can' },
  { key: 'full', name: 'When this Mac is full', sub: 'On this Mac first; the cloud takes the rest' },
] as const;
