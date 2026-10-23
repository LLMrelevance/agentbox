// A group as a chat first (w-dcaa2c122e, round 4), photographed with a made-up
// team: each layout in the team, opened where it opens, and in General.
//
//   npx vite build renderer --outDir dist-x
//   node scripts/shot-chat-first.mjs renderer/dist-x <outDir> [look,look]
import fs from 'node:fs';
import path from 'node:path';
import { openStage } from './lib/groups-stage.mjs';

const [dist, out, only] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const looks = only ? only.split(',') : ['rail', 'pulse', 'drawer', 'band', 'digest'];
const opener = { drawer: '.gl-pill', drawer2: '.gl-pill', band: '.gl-band .more', digest: '.gl-digest .more', one: '.g5-faces .g5-f >> nth=2', feedpick: '.g5-faces .g5-f >> nth=2' };

for (const look of looks) {
  const app = await openStage({ dist: path.resolve(dist), init: { 'groups.look': look } });
  for (const [row, name] of [['Northwind', 'team'], ['General', 'public']]) {
    await app.click('button[aria-label="Groups"]');
    await app.click(`.rm-rooms .row:has-text("${row}")`);
    await app.shot(path.join(out, `chat-${look}-${name}.png`));
    if (opener[look] && name === 'team') {
      await app.click(opener[look]);
      await app.shot(path.join(out, `chat-${look}-${name}-open.png`));
      await app.click(opener[look]);
    }
  }
  const errors = await app.errors();
  if (errors.length) console.log(look, errors);
  await app.close();
}
console.log('wrote', out);
