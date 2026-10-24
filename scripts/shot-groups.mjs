// Groups, photographed off a built renderer with a made-up team, at a
// full-screen window size, in light and dark: the Inbox, the page-name menu, a
// group, a chat, its options, a person's page, everyone's threads, a thread,
// and your account menu.
//
//   npx vite build renderer --outDir dist-x
//   GROUPS_FACES=<folder of p-*.jpg> node scripts/shot-groups.mjs renderer/dist-x <outDir> [name,name]
// GROUPS_CHROME points at a Chromium when Playwright's own is not installed.
import fs from 'node:fs';
import path from 'node:path';
import { openStage } from './lib/groups-stage.mjs';

const [dist, out, only] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const groups = ['.gt-titlemenu', '.gt2-row:has-text("Groups")'];
const shots = [
  { name: 'inbox', steps: [] },
  { name: 'menu', steps: ['.gt-titlemenu'] },
  { name: 'group', steps: groups },
  { name: 'chat-two', steps: [...groups, '.gt-topchips .gr-chip:has-text("Maya, Priya")'] },
  { name: 'options', steps: [...groups, 'button[aria-label="Group options"]'] },
  { name: 'person', steps: [...groups, '.gr-prow:has-text("Maya Chen")'] },
  { name: 'board', steps: [...groups, 'button[aria-label="Group options"]', '.gr-optmenu .row:has-text("Everyone")'] },
  { name: 'thread', steps: ['.row:has-text("The first row a new project")'] },
  { name: 'account', steps: ['button[aria-label="Your account"]'] },
].filter((s) => !only || only.split(',').includes(s.name));

for (const s of shots) {
  for (const theme of ['light', 'dark']) {
    const app = await openStage({ dist: path.resolve(dist), width: 1710, height: 1063, theme, init: { 'rooms.tab': 'r-team' } });
    for (const step of s.steps) await app.click(step);
    await app.shot(path.join(out, `${s.name}-${theme}.png`));
    const errors = await app.errors();
    if (errors.length) console.log(s.name, theme, errors);
    await app.close();
  }
}
console.log('wrote', out);
