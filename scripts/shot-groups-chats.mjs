// Every chat its own group (w-dcaa2c122e): a chat with Maya, then one with
// Maya and Priya, each reached from the Groups tab, by its row of chips and
// More, or by the tab's arrow. Photographed with a made-up team.
//
//   npx vite build renderer --outDir dist-x
//   GROUPS_FACES=<folder of p-*.jpg> node scripts/shot-groups-chats.mjs renderer/dist-x <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { openStage } from './lib/groups-stage.mjs';

const [dist, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const chips = { 'groups.tab': 'chips', 'groups.look': 'feedpick' };
const picker = { 'groups.tab': 'picker', 'groups.look': 'feedpick' };
const shots = [
  { name: 'chips-team', init: chips, steps: [] },
  { name: 'chips-more', init: chips, steps: ['.g6-chips .c.more'] },
  { name: 'chips-maya-priya', init: chips, steps: ['.g6-chips .c:has-text("Maya, Priya")'] },
  { name: 'chips-maya', init: chips, steps: ['.g6-chips .c:has(span:text-is("Maya"))'] },
  { name: 'picker-open', init: picker, steps: ['.rm-tabpick'] },
  { name: 'picker-maya-priya', init: picker, steps: ['.rm-tabpick', '.g7-row:has-text("Maya, Priya")'] },
];

for (const s of shots) {
  const app = await openStage({ dist: path.resolve(dist), init: { 'rooms.tab': 'r-team', ...s.init } });
  await app.click('.rm-tabname');
  for (const step of s.steps) await app.click(step);
  await app.shot(path.join(out, `${s.name}.png`));
  const errors = await app.errors();
  if (errors.length) console.log(s.name, errors);
  await app.close();
}
console.log('wrote', out);
