// Groups with people beside the chat (w-dcaa2c122e): named groups with a #,
// chats made from them after a rule; the people panel as a list or as cards;
// reached from the Threads tab or the sidebar's Groups row, and once with the
// sidebar condensed. Photographed with a made-up team.
//
//   npx vite build renderer --outDir dist-x
//   GROUPS_FACES=<folder of p-*.jpg> node scripts/shot-groups-people.mjs renderer/dist-x <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { openStage } from './lib/groups-stage.mjs';

const [dist, out, only] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const chips = (look) => ({ 'groups.tab': 'chips', 'groups.look': look });
const picker = (look) => ({ 'groups.tab': 'picker', 'groups.look': look });
const viaTab = '.rm-tabname';
const viaSidebar = 'button[aria-label="Groups"]';
const shots = [
  { name: 'chips-people', init: chips('people'), open: viaTab, steps: [] },
  { name: 'chips-people-chat', init: chips('people'), open: viaTab, steps: ['.g6-chips .c:has-text("Maya, Priya")'] },
  { name: 'chips-more', init: chips('people'), open: viaTab, steps: ['.g6-chips .c.more'] },
  { name: 'chips-people-open', init: chips('people-open'), open: viaTab, steps: [] },
  { name: 'picker-cards', init: picker('cards'), open: viaTab, steps: [] },
  { name: 'picker-cards-list', init: picker('cards'), open: viaTab, steps: ['.rm-tabpick'] },
  { name: 'picker-cards-general', init: picker('cards'), open: viaTab, steps: ['.rm-tabpick', '.g7-row:has-text("General")'] },
  { name: 'sidebar-people', init: chips('people'), open: viaSidebar, steps: [] },
  { name: 'condensed-people', init: { ...chips('people'), 'powerup.sidebar.collapsed': 'true' }, open: viaSidebar, steps: [] },
].filter((s) => !only || only.split(',').includes(s.name));

for (const s of shots) {
  const app = await openStage({ dist: path.resolve(dist), init: { 'rooms.tab': 'r-team', ...s.init } });
  await app.click(s.open);
  for (const step of s.steps) await app.click(step);
  await app.shot(path.join(out, `${s.name}.png`));
  const errors = await app.errors();
  if (errors.length) console.log(s.name, errors);
  await app.close();
}
console.log('wrote', out);
