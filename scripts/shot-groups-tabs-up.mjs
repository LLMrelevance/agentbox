// The page's tabs in the top bar where "Threads" was, one door to the page in
// the sidebar, and the chats in the row of groups (w-dcaa2c122e).
//
//   npx vite build renderer --outDir dist-x
//   GROUPS_FACES=<folder of p-*.jpg> node scripts/shot-groups-tabs-up.mjs renderer/dist-x <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { openStage } from './lib/groups-stage.mjs';

const [dist, out, only] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const up = { 'groups.tab': 'chips', 'groups.look': 'people', 'groups.tabsUp': '1', 'groups.oneDoor': '1' };
const shots = [
  { name: 'up-group', init: up, steps: ['.rm-tabname'] },
  { name: 'up-group-norule', init: { ...up, 'groups.tabsDivider': '0' }, steps: ['.rm-tabname'] },
  { name: 'up-needs', init: up, steps: [] },
  { name: 'up-needs-norule', init: { ...up, 'groups.tabsDivider': '0' }, steps: [] },
  { name: 'up-chat', init: up, steps: ['.rm-tabname', '.g6-chips .c:has-text("Maya, Priya")'] },
  { name: 'up-chat-one', init: up, steps: ['.rm-tabname', '.g6-chips .c:has(span:text-is("Maya"))'] },
].filter((s) => !only || only.split(',').includes(s.name));

for (const s of shots) {
  const app = await openStage({ dist: path.resolve(dist), init: { 'rooms.tab': 'r-team', ...s.init } });
  for (const step of s.steps) await app.click(step);
  await app.shot(path.join(out, `${s.name}.png`));
  const errors = await app.errors();
  if (errors.length) console.log(s.name, errors);
  await app.close();
}
console.log('wrote', out);
