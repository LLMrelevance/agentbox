// How well the Decisions API picks Neo's action, on hard cases.
//
//   node scripts/neo-decide-bench.mjs
//
// Runs on the Mac (the OpenAI key is read from the Keychain). Options are
// built by the app's own builder (shared/neo-options.mjs) from made-up
// screens, so nothing of anyone's inbox leaves the machine. Codex's review
// asked for: answers spread through the list, look-alike titles, negation,
// corrections, two requests at once, noise, and a changed screen.
import { execFileSync } from 'node:child_process';
import { buildOptions } from '../shared/neo-options.mjs';
import { decide } from '../main/neo/decide.mjs';

const key = execFileSync('security', ['find-generic-password', '-s', 'OPENAI_API_KEY', '-w'], { encoding: 'utf8' }).trim();
const getKey = async () => key;

const COMMANDS = [
  ['pause', 'Pause agents', 'no new sessions spawn'], ['resume-stopped', 'Resume interrupted agents'], ['settings', 'Settings…', 'the workspace, and every project'],
  ['flip-view', 'Show as a board'], ['search', 'Search threads'], ['filter', 'Filter…', 'Project, priority or agent'], ['projects-page', 'Projects…'],
  ['new-project', 'New project…'], ['shortcuts', 'Keyboard shortcuts'], ['panel', 'Collapse sidebar'], ['import-agents', 'Import agents from Claude Code or Codex'],
  ['tutorial', 'Take the tutorial'], ['standing', 'General agent instructions…'], ['update-check', 'Check for updates'], ['open-terminal', 'Open Terminal'],
  ['remote-control', 'Remote Control'], ['read', 'Mark Read'], ['resume-any', 'Resume This Agent'], ['view-inbox', 'Inbox'], ['view-progress', 'In progress'], ['view-done', 'Closed'],
].map(([id, label, hint]) => ({ id, label, ...(hint ? { hint } : {}) }));

// Look-alike titles on purpose: two pricing threads, two login threads.
const TITLES = ['Pricing page copy', 'Pricing page: annual toggle default', 'Fix the login bug', 'Login page redesign', 'JARVIS for Agentbox', 'Draggable orb with voice speed control', 'Booster animation is too slow on the second card', 'Account status display in plan settings', 'Disk storage optimization', 'Cloud agent execution strategy', 'Daily analytics report', 'Glass card designs for the launch film'];
const filler = Array.from({ length: 90 }, (_, i) => `Fix the ${['billing', 'export', 'webhook', 'search', 'avatar', 'sync', 'calendar', 'audit', 'cache'][i % 9]} issue #${100 + i}`);
const rows = [...TITLES, ...filler].map((title, i) => ({ id: `w-${i}`, title }));

const jarvis = {
  open: { id: 'w-4', title: 'JARVIS for Agentbox', options: [{ n: 1, text: 'Ship it all so you can try it (recommended)' }, { n: 2, text: 'Change the show layouts first' }], pictures: [{ n: 1, name: 'design-1.png' }, { n: 2, name: 'design-2.png' }, { n: 3, name: 'design-3.png' }], films: [{ n: 1, name: 'walkthrough.mp4' }] },
  rows, commands: COMMANDS, canGoBack: true,
};
const inbox = { open: null, rows, commands: COMMANDS, canGoBack: false };

// [screen, what she said, the values that count as right]
const CASES = [
  [jarvis, 'Full screen the picture.', ['show:1']],
  [jarvis, 'Compare designs one and three side by side.', ['compare']],
  [jarvis, 'Snooze this thread for ten minutes.', ['later']],
  [jarvis, 'Put this in the chat as feedback: the picture stayed up after you snoozed it.', ['reply']],
  [jarvis, 'Tell the agent the orb should go higher.', ['reply']],
  [jarvis, 'Go back to the one I was on.', ['back']],
  [jarvis, "Scroll up, I can't see that.", ['scroll:up']],
  [jarvis, 'Option one.', ['pick:1']],
  [jarvis, 'Go with the second one.', ['pick:2']],
  [jarvis, 'Ship it.', ['pick:1']],
  [jarvis, "Don't ship it yet.", ['none', 'pick:2']],
  [jarvis, 'Wait, not option one.', ['none']],
  [jarvis, 'Close it.', ['close']],
  [jarvis, 'Why did it pick design two?', ['ask']],
  [jarvis, "What's it saying?", ['summary']],
  [jarvis, 'Play the video.', ['play:1']],
  [jarvis, 'Open the annual toggle one.', ['open:w-1']],
  [jarvis, 'Open the pricing copy thread.', ['open:w-0']],
  [jarvis, 'The login redesign, open it.', ['open:w-3']],
  [jarvis, 'Pause the agents.', ['cmd:pause']],
  [jarvis, 'Open settings.', ['cmd:settings']],
  [jarvis, 'Show it as a board.', ['cmd:flip-view']],
  [jarvis, 'Start a new task to redo the pricing page copy.', ['new']],
  [jarvis, 'Snooze it, actually no, close it.', ['close']],
  [jarvis, 'Hmm.', ['none']],
  [jarvis, 'Okay, let me see.', ['none']],
  [jarvis, "That's all, thanks Neo.", ['signoff']],
  [jarvis, 'Undo that.', ['undo']],
  [inbox, 'What needs me?', ['inbox']],
  [inbox, 'Next.', ['next']],
  [inbox, 'Open the orb one.', ['open:w-5']],
  [inbox, 'Reply to it saying looks good.', ['none', 'next', 'inbox']], // nothing is open: there is nothing to reply to
];

let right = 0;
const times = [];
const misses = [];
for (const [screen, said, want] of CASES) {
  const { list } = buildOptions(screen);
  const shuffled = [...list].sort(() => Math.random() - 0.5);
  const input = `${screen.open ? `Screen: the open thread is "${screen.open.title}".` : 'Screen: no thread is open.'} ${screen.rows.length} threads are listed.\nThe person just said: "${said}"`;
  const r = await decide({ input, options: shuffled, getKey });
  times.push(r.ms);
  if (want.includes(r.choice)) right++;
  else misses.push(`"${said}" -> ${r.choice} (${r.confidence?.toFixed(2)}), wanted ${want.join(' or ')}`);
}
times.sort((a, b) => a - b);
console.log(`${right}/${CASES.length} right; median ${times[times.length >> 1]} ms, slowest ${times.at(-1)} ms; ${buildOptions(jarvis).list.length} options with a thread open`);
for (const m of misses) console.log('  miss:', m);
