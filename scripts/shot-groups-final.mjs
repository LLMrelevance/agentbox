// The chosen Groups layout (w-dcaa2c122e): a row of groups over the chat,
// people as a list beside it, the group's options in the top bar, with the
// sidebar and without. Photographed with a made-up team.
//
//   npx vite build renderer --outDir dist-x
//   GROUPS_FACES=<folder of p-*.jpg> node scripts/shot-groups-final.mjs renderer/dist-x <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { openStage } from './lib/groups-stage.mjs';

const [dist, out, only] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const base = { 'groups.tab': 'chips', 'groups.look': 'people' };
const bare = { ...base, 'groups.noSidebar': '1' };
const shots = [
  { name: 'b-team', init: base, steps: [] },
  { name: 'b-options', init: base, steps: ['button[aria-label="Group options"]'] },
  { name: 'b-chat', init: base, steps: ['.g6-chips .c:has-text("Maya, Priya")'] },
  { name: 'b-more', init: base, steps: ['.g6-chips .c.more'] },
  { name: 'bare-team', init: bare, steps: [] },
  { name: 'bare-chat', init: bare, steps: ['.g6-chips .c:has-text("Maya, Priya")'] },
  { name: 'bare-account', init: bare, steps: ['button[aria-label="Your account"]'] },
].filter((s) => !only || only.split(',').includes(s.name));

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
