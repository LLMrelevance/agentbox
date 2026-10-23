// Groups, photographed off a built renderer with a made-up team, in dark, at a
// full-screen window size: a group, a chat, the lists, its options, a person's
// page, everyone's threads, and the Inbox with its tabs in the top bar.
//
//   npx vite build renderer --outDir dist-x
//   GROUPS_FACES=<folder of p-*.jpg> node scripts/shot-groups.mjs renderer/dist-x <outDir> [name,name]
import fs from 'node:fs';
import path from 'node:path';
import { openStage } from './lib/groups-stage.mjs';

const [dist, out, only] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const tab = '.rm-tabname';
const shots = [
  { name: 'inbox', steps: [] },
  { name: 'group', steps: [tab] },
  { name: 'chat-two', steps: [tab, '.gr-bar .gr-chip:has-text("Maya, Priya")'] },
  { name: 'chat-one', steps: [tab, '.gr-bar .gr-chip:has(span:text-is("Maya"))'] },
  { name: 'more', steps: [tab, '.gr-chip.more'] },
  { name: 'tab-menu', steps: [tab, '.rm-tabpick'] },
  { name: 'options', steps: [tab, 'button[aria-label="Group options"]'] },
  { name: 'person', steps: [tab, '.gr-prow:has-text("Maya Chen")'] },
  { name: 'board', steps: [tab, 'button[aria-label="Group options"]', '.gr-optmenu .row:has-text("Everyone")'] },
].filter((s) => !only || only.split(',').includes(s.name));

for (const s of shots) {
  const app = await openStage({ dist: path.resolve(dist), init: { 'rooms.tab': 'r-team' } });
  for (const step of s.steps) await app.click(step);
  await app.shot(path.join(out, `${s.name}.png`));
  const errors = await app.errors();
  if (errors.length) console.log(s.name, errors);
  await app.close();
}
console.log('wrote', out);
