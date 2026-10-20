// ASK WHICH PLAN THEY PAY FOR, THEN DO IT FOR THEM (w-9f6975906c).
//
// Picked 2026-10-05 out of four drawn approaches, in the founder's words:
// "asking which plan, then doing it for them, makes the most sense", and "if we
// can detect it, we should just use it straight up". So a Mac where Claude Code
// or Codex is already found and signed in never sees any of this, and a Mac
// where neither is gets one question in words people know (Claude, ChatGPT),
// never the names of the tools underneath.
//
// Everything here has no window in it, so what the two screens say at every
// moment is tested rather than eyeballed. The screens are in
// components/PlanSetup.tsx.

import { NAME } from '../../shared/product-name.mjs';

export type Engine = 'claude' | 'codex';
export type Plan = 'claude' | 'codex' | 'both';
export type Phase = 'idle' | 'checking' | 'installing' | 'signing-in' | 'ready' | 'failed';

export interface EngineSetupState {
  engine: Engine;
  phase: Phase;
  error: string | null;
  log: string;
  /** Only on a `ready` question: whether the tool is on the Mac at all. */
  found?: boolean;
  signedIn?: boolean;
}

export const COPY = {
  planHead: 'Which AI plan do you pay for?',
  planLede: `Your agents run on your own plan. Pick it and ${NAME} sets everything up.`,
  claude: 'Claude',
  claudePlans: 'Pro, Max or a team plan',
  chatgpt: 'ChatGPT',
  chatgptPlans: 'A paid ChatGPT plan',
  both: 'Both',
  bothPlans: 'Agents use whichever has room left',
  /*
   * THE ANSWER FOR SOMEBODY WHO ALREADY HAS ONE (w-ce8c1a9275). The search asks
   * their own login shell first and then looks in sixteen places, which between
   * them cover every ordinary install; what is left is a copy somewhere nobody
   * would guess, and every one of those used to be a path we ship and a release
   * they wait for. It belongs here, beside the other way out, because "I
   * already have one" is an answer to "which plan do you pay for" and not a
   * separate screen.
   *
   * IT NAMES NO TOOL AND NO FILE. The question above it is asked in words
   * people know -- Claude, ChatGPT -- and this has to stay in them.
   */
  haveOne: 'I already have one, let me show you where',
  /** After the panel refused what came out of it, or found nothing there. */
  notThatOne: 'That is not something agents can run. Try another, or pick a plan above.',
  checking: 'Checking this computer…',
  nothingHere: 'Nothing is set up on this computer yet. Pick the plan you pay for above.',
  privacy: `You sign in on Claude's or OpenAI's own page. ${NAME} never sees your password.`,

  /*
   * THE OTHER HALF OF THIS SCREEN (w-e217e577e5). A computer with a plan
   * already signed in was walked straight past the question, and told nothing,
   * so the first anybody knew of it was an agent spending their tokens. In the
   * founder's words, a new user "was like, 'Oh my God, where are the tokens
   * coming from? I didn't even connect my account.'"
   *
   * It is the same screen, not a new one: you get the question or you get the
   * answer, so no machine walks a step another machine does not.
   */
  foundHead: 'Found on this computer.',
  signedIn: 'Signed in',
  /** On the disk already, so there is nothing to install. */
  signIn: 'Sign in',
  setUp: 'Set up',
  /**
   * The line under the found card. The same promise `privacy` makes, without
   * its second sentence: there is one sign-in left on this screen rather than
   * a whole setup, and the row it belongs to is the one with no tick.
   */
  foundNote: "You sign in on Claude's or OpenAI's own page.",

  setupHead: (name: string) => `Setting up ${name}.`,
  setupLedeWait: 'One step needs you: approve the sign-in in your browser.',
  setupLedeBusy: 'This takes about half a minute. Nothing needs you yet.',
  setupLedeFailed: 'Something stopped the setup. Try again, or skip it for now.',
  setupOf: (n: number, of: number) => `${n} of ${of}`,
  install: (tool: string) => `Install ${tool}`,
  signInStep: (name: string) => `Sign in to your ${name} plan`,
  signInSub: (name: string) => `A ${name === 'Claude' ? 'Claude' : 'ChatGPT'} page opened in your browser. Click Authorize there, then come back here.`,
  ready: 'Check that agents can start',
  done: 'Done',
  working: 'Working…',
  waiting: 'Waiting for you',
  openAgain: 'Open the sign-in page again',
  tryAgain: 'Try again',
  skip: 'Skip for now',
  showLog: 'Show what is happening',
  hideLog: 'Hide what is happening',

  barSay: 'Agents cannot start until they have a plan to run on.',
  barSub: 'Takes a couple of clicks.',
  barClaude: 'Set up with Claude',
  barChatgpt: 'Set up with ChatGPT',
} as const;

/** The plan's name, the word on screen. Never "Claude Code" or "Codex" here. */
export function planName(engine: Engine): string {
  return engine === 'claude' ? COPY.claude : COPY.chatgpt;
}

/** The tool's name, only where a tool is really being installed. */
export function toolName(engine: Engine): string {
  return engine === 'claude' ? 'Claude Code' : 'Codex';
}

/** Which tools a plan sets up, in the order they are set up. */
export function enginesFor(plan: Plan): Engine[] {
  return plan === 'both' ? ['claude', 'codex'] : [plan];
}

/**
 * WHETHER THE WALK ASKS AT ALL. One tool that is found and signed in is enough
 *  to run every agent, so any one ready means no question.
 */
export function needsPlan(readiness: Array<Pick<EngineSetupState, 'found' | 'signedIn'>>): boolean {
  return !readiness.some((r) => r.found && r.signedIn);
}

/**
 * WHAT "CHECK THIS MAC FOR ME" FOUND. A ready tool ends the question; one that
 *  is there but signed out goes straight to its sign-in, with no plan asked;
 *  nothing at all is said out loud, under the four rows.
 */
export function afterCheck(readiness: Array<Pick<EngineSetupState, 'engine' | 'found' | 'signedIn'>>):
  | { t: 'ready' } | { t: 'setup'; plan: Plan } | { t: 'nothing' } {
  if (!needsPlan(readiness)) return { t: 'ready' };
  const there = readiness.filter((r) => r.found).map((r) => r.engine);
  if (there.length === 2) return { t: 'setup', plan: 'both' };
  if (there.length === 1) return { t: 'setup', plan: there[0] };
  return { t: 'nothing' };
}

/* ------------------------- WHAT THE QUESTION OFFERS ----------------------- */
/**
 * A ROW ON A QUESTION CARD: a mark, a name, a sentence, and whether it belongs
 * to the separated group at the foot.
 *
 * These lists used to be built inline in components/PlanSetup.tsx, where no
 * test could read them, so what the one screen a brand new person meets
 * actually offers was eyeballed. Everything else in this file is here for that
 * reason and these were the exception.
 */
export interface AskRow {
  key: string;
  /** The plan this answers with, when it answers with one. */
  plan?: Plan;
  mark?: string;
  name: string;
  sub?: string;
  /**
   * In the group under the rule, which is "a way out" rather than "a plan".
   *
   * AN `other` ROW IS ONE LINE AND CARRIES NO `sub`. That is the shape the
   * screen was drawn in, and the stylesheet means it: `.fr-folder-other
   * .fr-folder-name` spans the sub's own grid column, so a sub on one of these
   * is squeezed against the right edge and clipped mid-word. Say it in the
   * name instead.
   */
  other?: boolean;
  /**
   * WHAT IS TRUE OF THIS ONE ALREADY, at the right of the row: signed in, or
   * the one word for what pressing it would do. Only the found screen has any,
   * because only the found screen knows anything yet.
   */
  right?: string;
  /** With a tick, which is for the one thing that needs nobody to do anything. */
  tick?: boolean;
  /**
   * A REAL LINK, when the row leaves the app. Drawn as an anchor rather than a
   * button so the address is in the page: it can be copied, opened in a new
   * window, and read by anything that reads pages. The gate's install row is
   * the only one, and tests/the-inbox-does-not-open-without-claude-code is
   * what noticed when it briefly stopped being one.
   */
  href?: string;
}

/**
 * WHICH AI PLAN DO YOU PAY FOR, and the one answer that is not a plan.
 *
 * THE COMPUTER IS ASKED BY THE SCREEN ITSELF, NOT BY A ROW (w-ce8c1a9275,
 * 2026-10-09). There used to be a fourth row, "I am not sure, check this
 * computer for me". The founder: "I would think this step is actually better
 * fit also checking first at the same time. Otherwise they may select something
 * we cant run. Best to figure it out now."
 *
 * So `afterCheck` runs when the screen opens, against the reading the welcome
 * step already took, and the question is only asked when asking is honest --
 * see `planNote` below for what the screen says while that is happening. A row
 * that re-runs something the screen has already done is a button that cannot
 * change its own answer.
 *
 * WHAT NO AMOUNT OF LOOKING CAN REPLACE stays: a copy somewhere nobody would
 * guess is exactly the case the search cannot reach, so "I already have one"
 * is still an answer somebody can give.
 */
export function planRows(): AskRow[] {
  return [
    { ...PLAN_ROW.claude },
    { ...PLAN_ROW.codex },
    { key: 'both', plan: 'both', mark: '+', name: COPY.both, sub: COPY.bothPlans },
    { key: 'mine', name: COPY.haveOne, other: true },
  ];
}

/**
 * ONE PLAN, DRAWN THE SAME WAY WHEREVER IT APPEARS. The question and the
 *  answer are the same screen, so a plan that is asked about and a plan that was
 *  found are the same row with different words at its right edge.
 */
const PLAN_ROW: Record<Engine, AskRow> = {
  claude: { key: 'claude', plan: 'claude', mark: 'C', name: COPY.claude, sub: COPY.claudePlans },
  codex: { key: 'codex', plan: 'codex', mark: 'G', name: COPY.chatgpt, sub: COPY.chatgptPlans },
};

type Reading = Pick<EngineSetupState, 'engine' | 'found' | 'signedIn'>;

/** The plans that can run an agent right now, in the order they are asked in. */
export function readyEngines(readings: Reading[]): Engine[] {
  return (['claude', 'codex'] as Engine[]).filter((e) => {
    const r = readings.find((x) => x.engine === e);
    return !!r?.found && !!r?.signedIn;
  });
}

/**
 * WHAT WAS FOUND, SAID IN THE PLAN'S OWN NAME. Never a tier: a row reading
 *  "Claude · Max 20x" shipped on 2026-10-07 and came out the same day, and the
 *  question being answered is "did it connect to something of mine", not "what
 *  am I paying for". Null when nothing is ready, because then there is nothing
 *  to claim and the screen is the question instead.
 */
export function foundLede(ready: Engine[]): string | null {
  if (!ready.length) return null;
  const names = ready.map(planName);
  return ready.length > 1
    ? `Your agents will run on your own ${names.join(' and ')} plans.`
    : `Your agents will run on your own ${names[0]} plan.`;
}

/**
 * THE TWO PLANS, EACH CARRYING WHAT IS TRUE OF IT. "Both" is not here: it is a
 *  thing to set up, and one is already set up. Neither is "I already have one",
 *  which answers a question nobody is being asked on this screen.
 *
 *  AND AN INSTALL IS NOT A SIGN-IN. A tool sitting on the disk signed out needs
 *  a sign-in, so offering to "Set up" it offers to install what is installed.
 */
export function foundRows(readings: Reading[]): AskRow[] {
  const ready = readyEngines(readings);
  return (['claude', 'codex'] as Engine[]).map((e) => {
    const r = readings.find((x) => x.engine === e);
    const isReady = ready.includes(e);
    return {
      ...PLAN_ROW[e],
      right: isReady ? COPY.signedIn : r?.found ? COPY.signIn : COPY.setUp,
      ...(isReady ? { tick: true } : {}),
    };
  });
}

/** Where Return rests: on the one that is already running agents. */
export function litRow(rows: AskRow[]): number {
  const at = rows.findIndex((r) => r.tick);
  return at === -1 ? 0 : at;
}

/**
 * WHAT A PRESS ON THE FOUND SCREEN MEANS. There are only two things it can
 *  mean, and which one depends on the row rather than on a button: the one that
 *  is ready is a yes, and the other one is a second plan to set up.
 */
export function afterFound(key: string, ready: Engine[]): { t: 'go' } | { t: 'setup'; plan: Plan } {
  return ready.includes(key as Engine) ? { t: 'go' } : { t: 'setup', plan: key as Plan };
}

/**
 * THE ONE LINE UNDER THE CARD, at this moment, and whether it is a complaint.
 *
 * Four states and the newest one wins. A refusal is about the press just made,
 * so it beats everything; then the look, while it is running; then its answer,
 * which is that the computer is empty -- NOT an error, because an empty
 * computer is the ordinary case for this screen and the question above it is
 * exactly the right question to be asking. The resting line is the promise
 * about passwords, which is what this screen said before any of this.
 */
export function planNote(s: { looking?: boolean; looked?: boolean; refused?: boolean }): { text: string; bad: boolean } {
  if (s.refused) return { text: COPY.notThatOne, bad: true };
  if (s.looking) return { text: COPY.checking, bad: false };
  if (s.looked) return { text: COPY.nothingHere, bad: false };
  return { text: COPY.privacy, bad: false };
}

export interface StepRow {
  state: 'done' | 'now' | 'todo';
  title: string;
  sub?: string;
  right?: string;
}

/**
 * THE THREE ROWS OF THE SETUP CARD for one tool, at one moment. Install is
 *  drawn even when the tool was already there, ticked, so the card has the
 *  same shape for everyone and nobody wonders what was skipped.
 */
export function setupRows(s: Pick<EngineSetupState, 'engine' | 'phase'>): StepRow[] {
  const name = planName(s.engine);
  const install: StepRow = { state: 'todo', title: COPY.install(toolName(s.engine)) };
  const sign: StepRow = { state: 'todo', title: COPY.signInStep(name) };
  const check: StepRow = { state: 'todo', title: COPY.ready };
  switch (s.phase) {
    case 'idle':
    case 'installing':
      install.state = 'now'; install.right = COPY.working;
      break;
    case 'checking':
      install.state = 'done'; install.right = COPY.done;
      sign.state = 'now'; sign.right = COPY.working;
      break;
    case 'signing-in':
      install.state = 'done'; install.right = COPY.done;
      sign.state = 'now'; sign.sub = COPY.signInSub(name); sign.right = COPY.waiting;
      break;
    case 'ready':
      install.state = 'done'; install.right = COPY.done;
      sign.state = 'done'; sign.right = COPY.done;
      check.state = 'done'; check.right = COPY.done;
      break;
    case 'failed':
      break;
  }
  return [install, sign, check];
}

/** The line under the heading, which is the one thing to do right now. */
export function setupLede(phase: Phase): string {
  if (phase === 'signing-in') return COPY.setupLedeWait;
  if (phase === 'failed') return COPY.setupLedeFailed;
  return COPY.setupLedeBusy;
}
