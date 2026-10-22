// Groups (w-dcaa2c122e), photographed off a built renderer with a made-up team:
// the list, then a group in each look, in dark, at a full-screen window size.
//
//   npx vite build renderer --outDir dist-x
//   node scripts/shot-groups.mjs renderer/dist-x <outDir> [look,look] [light]
import fs from 'node:fs';
import path from 'node:path';
import { openStage } from './lib/groups-stage.mjs';

const [dist, out, only, theme = 'dark'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const looks = only ? only.split(',') : ['beside', 'above', 'woven', 'wall', 'title'];
const open = (look) => openStage({ dist: path.resolve(dist), theme, init: { 'groups.look': look } });

for (const look of looks) {
  const app = await open(look);
  await app.click('button[aria-label="Groups"]');
  if (look === looks[0]) await app.shot(path.join(out, `groups-list-${theme}.png`));
  await app.click('.rm-rooms .row:has-text("Northwind")');
  await app.shot(path.join(out, `look-${look}-${theme}.png`));
  if (look === 'title') { await app.click('.gp-tbtn'); await app.shot(path.join(out, `look-title-open-${theme}.png`)); }
  if (look === 'beside') {
    for (const [row, name] of [['Jonah', 'two'], ['General', 'big']]) {
      await app.click('button[aria-label="Groups"]');
      await app.click(`.rm-rooms .row:has-text("${row}")`);
      await app.shot(path.join(out, `look-beside-${name}-${theme}.png`));
    }
  }
  const errors = await app.errors();
  if (errors.length) console.log(look, errors);
  await app.close();
}
console.log('wrote', out);
