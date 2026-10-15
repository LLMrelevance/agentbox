// THE PHONE WITH THE MAC SHUT, AS A SITE OF ITS OWN (docs/cloud/PHONE-PLAN.md).
//
// The renderer as built, with the cloud's public address and public key put in
// the page (`<meta name="agentbox-cloud">`, read by renderer/src/cloud-bridge.ts),
// written to phone-site/, which is not committed. Both values come from
// cloud/team.config.json, which is not committed either; the public key is the
// one every browser of the site has, and row level security is what guards
// her rows. Nothing else of the Mac's goes in.
//
//   npm run build && node scripts/build-phone-site.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'renderer', 'dist');
const out = path.join(root, 'phone-site');
const configFile = path.join(root, 'cloud', 'team.config.json');

if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('build the renderer first: npm run build');
if (!fs.existsSync(configFile)) throw new Error('no cloud/team.config.json on this machine: the phone site needs the team cloud');
const { url, anonKey } = JSON.parse(fs.readFileSync(configFile, 'utf8'));
if (typeof url !== 'string' || typeof anonKey !== 'string') throw new Error('cloud/team.config.json has no url and anonKey');

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(dist, out, { recursive: true });
const meta = `<meta name="agentbox-cloud" content='${JSON.stringify({ url, anonKey }).replace(/'/g, '&#39;')}'>`;
const index = path.join(out, 'index.html');
fs.writeFileSync(index, fs.readFileSync(index, 'utf8').replace('<head>', `<head>\n    ${meta}`));
// Every address on the site is the page: a thread opened is a step in its history.
fs.writeFileSync(path.join(out, '_redirects'), '/* /index.html 200\n');
console.log(`phone site written to ${path.relative(root, out)}/`);
