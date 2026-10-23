// The Groups tab (w-dcaa2c122e, round 5), photographed with a made-up team:
// the room tab as shipped, then the Threads tab after Done called Groups and
// holding the last group open, switched by its arrow or by a row of groups.
//
//   npx vite build renderer --outDir dist-x
//   node scripts/shot-groups-tab.mjs renderer/dist-x <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { openStage } from './lib/groups-stage.mjs';

const [dist, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const shots = [
  { name: 'tab-today', init: {}, steps: [] },
  { name: 'tab-picker', init: { 'groups.tab': 'picker', 'groups.look': 'pulse2' }, steps: [] },
  { name: 'tab-picker-open', init: { 'groups.tab': 'picker', 'groups.look': 'pulse2' }, steps: ['.rm-tabpick'] },
  { name: 'tab-chips', init: { 'groups.tab': 'chips', 'groups.look': 'one' }, steps: [] },
  { name: 'tab-chips-general', init: { 'groups.tab': 'chips', 'groups.look': 'feedpick' }, steps: ['.g6-chips .c:has-text("General")'] },
  { name: 'tab-chips-drawer', init: { 'groups.tab': 'chips', 'groups.look': 'drawer2' }, steps: ['.gl-pill'] },
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
