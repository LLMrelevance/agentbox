// Work woven into a group's chat (w-dcaa2c122e), photographed on the room page
// as shipped, its board open beside the chat, with a made-up team.
//
//   npx vite build renderer --outDir dist-x
//   node scripts/shot-woven.mjs renderer/dist-x <outDir> [look,look]
import fs from 'node:fs';
import path from 'node:path';
import { openStage } from './lib/groups-stage.mjs';

const [dist, out, only] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const looks = only ? only.split(',') : ['none', 'quiet', 'twitch', 'cheer', 'bursts', 'lane', 'ticker'];

for (const look of looks) {
  const init = { 'rooms.view': 'board', ...(look === 'none' ? {} : { 'groups.woven': look }) };
  const app = await openStage({ dist: path.resolve(dist), init });
  for (const [row, name] of [['Northwind', 'team'], ['General', 'public']]) {
    await app.click('button[aria-label="Groups"]');
    await app.click(`.rm-rooms .row:has-text("${row}")`);
    await app.shot(path.join(out, `woven-${look}-${name}.png`));
  }
  const errors = await app.errors();
  if (errors.length) console.log(look, errors);
  await app.close();
}
console.log('wrote', out);
