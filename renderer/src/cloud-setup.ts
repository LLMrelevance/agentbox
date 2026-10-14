// WHAT THE CLOUD SETUP SAYS AT EVERY MOMENT (components/CloudSetup.tsx draws
// it; tests/the-cloud-is-set-up-on-its-own-screen reads it).
//
// Three rounds of her words shaped it, all on 2026-10-14:
//   - "The component shouldn't walk you through it": the cloud menu offers
//     Set up, and the setup is its own screen.
//   - "nobody reads text that's just in the bottom corner", then "this is way
//     too much reading ... I can't tell if these are components that I had to
//     click or read through": one line under each heading, and what can be
//     pressed looks pressable and nothing else does.
//   - "we shouldn't predefine which accounts to sign up with. Give people the
//     option": she adds whichever Claude and Codex accounts she wants.
// And she waited on Claude's page "stuck for about 30 seconds", not seeing
// that its code had to come back: the code is now read from the clipboard
// the moment she returns, and every wait says so with a moving mark.
import { signingIn, type CloudAccount, type CloudSignIn, type CloudStatus } from './cloud-menu';

export const SETUP = {
  screenLabel: 'Set up the cloud',
  homeHead: 'Run your agents in the cloud',
  homeLede: 'Add the accounts it should use. Add more any time.',
  addClaude: 'Add Claude account',
  addCodex: 'Add Codex account',
  addOne: 'Add account',
  addWhich: 'Add which account?',
  kindClaude: 'Claude',
  kindCodex: 'Codex',
  planClaude: 'Pro or Max plan',
  planCodex: 'ChatGPT plan',
  remove: 'Remove',
  again: 'Sign in again',
  done: 'Done',
  signInHead: (engine: CloudSignIn['engine']) => (engine === 'codex' ? 'Sign in to Codex' : 'Sign in to Claude'),
  openAgain: 'Open the page again',
  tryAgain: 'Try again',
  back: 'Back',
  pastePlaceholder: 'Paste the code',
  pasteGo: 'Continue',
  copy: 'Copy',
  copied: 'Copied',
  doneHead: 'You’re set up',
  doneLede: 'Where should new threads start?',
  inviteHead: 'Run your agents in the cloud',
  inviteLine: 'They keep working with your laptop closed, and as many run at once as you need.',
  inviteGo: 'Set up the cloud',
  inviteNote: 'About a minute per account',
  menuBroken: 'A cloud account needs to sign in again.',
  menuFix: 'Fix',
  menuAccounts: (n: number) => (n === 1 ? '1 account' : `${n} accounts`),
  menuManage: 'Manage',
};

// The menu's one line about setup, when there is one: an account that
// stopped working. With no accounts at all the menu is the invitation.
export function menuSetupLine(status: CloudStatus): { say: string; go: string } | null {
  const accounts = status.accounts || [];
  if (!accounts.length) return null;
  if (accounts.some((a) => a.state === 'broken')) return { say: SETUP.menuBroken, go: SETUP.menuFix };
  return null;
}

// The sign-in on screen: one going, else one that just failed.
export function activeSignIn(status: CloudStatus): CloudSignIn | null {
  const all = status.signIns || [];
  return all.find(signingIn) ?? all.find((s) => s.state === 'failed') ?? null;
}

// WHAT ONE SIGN-IN SAYS, in a line, and what it asks for. `busy` draws the
// moving mark beside the line, so a wait never looks like a stop.
export function signInView(s: CloudSignIn): { lead: string; busy: boolean; paste: boolean; codeToType: string | null } {
  const claude = s.engine === 'claude';
  if (s.state === 'starting') return { lead: claude ? 'Opening Claude’s sign-in…' : 'Opening OpenAI’s sign-in…', busy: true, paste: false, codeToType: null };
  if (s.state === 'needs-code') return { lead: 'Approve on Claude’s page, then copy the code it shows.', busy: false, paste: true, codeToType: null };
  if (s.state === 'waiting') return { lead: 'Enter this code on OpenAI’s page.', busy: true, paste: false, codeToType: s.code };
  if (s.state === 'checking') return { lead: 'Checking…', busy: true, paste: false, codeToType: null };
  if (s.state === 'failed') return { lead: s.message || 'That didn’t work.', busy: false, paste: false, codeToType: null };
  return { lead: '', busy: false, paste: false, codeToType: null };
}

// Whether Done may be pressed: at least one account can run.
export const anyReady = (accounts: CloudAccount[]) => accounts.some((a) => a.ready);

// The last screen's question: where new threads start, now that they can.
export const WHERE_ROWS = [
  { key: 'all', name: 'Everything', sub: 'In the cloud first' },
  { key: 'full', name: 'When this Mac is full', sub: 'On this Mac first' },
] as const;
