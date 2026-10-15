// THE PHONE WITH THE COMPUTER CLOSED, AS A SITE OF ITS OWN (docs/cloud/PHONE-PLAN.md).
//
// The renderer as built, with the cloud's public address and public key put in
// the page (`<meta name="agentbox-cloud">`, read by renderer/src/cloud-bridge.ts),
// written to phone-site/, which is not committed. Both values come from
// cloud/team.config.json, which is not committed either; the public key is the
// one every browser of the site has, and row level security is what guards
// her rows. Nothing else of the computer's goes in: not the demo rows the
// window draws with no app behind it, not the corner tag, not a source map.
//
// The site answers with headers that let the page talk to its own files and
// the database and nothing else, keep its address (which briefly carries a
// sign-in code) out of every Referer, and refuse to be framed.
//
//   npm run phone:build
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function buildPhoneSite({ dist = path.join(root, 'renderer', 'dist'), out = path.join(root, 'phone-site'), configFile = path.join(root, 'cloud', 'team.config.json'), icon = path.join(root, 'main', 'phone-icon.png') } = {}) {
  if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('build the renderer first: npm run phone:build');
  if (!fs.existsSync(configFile)) throw new Error('no cloud/team.config.json on this machine: the phone site needs the team cloud');
  const { url, anonKey } = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  let origin;
  try { origin = new URL(url); } catch { throw new Error('cloud/team.config.json has no url'); }
  if (origin.protocol !== 'https:' || origin.pathname.replace(/\/+$/, '') !== '' || origin.search || origin.hash) throw new Error('the cloud url must be a plain https address');
  if (typeof anonKey !== 'string' || !/^[A-Za-z0-9._-]{20,4000}$/.test(anonKey)) throw new Error('cloud/team.config.json has no public key');

  fs.rmSync(out, { recursive: true, force: true });
  fs.cpSync(dist, out, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(dist, src);
      return !(rel === 'fixtures' || rel.startsWith(`fixtures${path.sep}`) || rel === 'corner-tag.html' || rel.endsWith('.map'));
    },
  });
  const config = JSON.stringify({ url: origin.origin, anonKey }).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/</g, '&lt;');
  const meta = `<meta name="agentbox-cloud" content='${config}'>`;
  const index = path.join(out, 'index.html');
  fs.writeFileSync(index, fs.readFileSync(index, 'utf8').replace('<head>', `<head>\n    ${meta}\n    <link rel="manifest" href="/manifest.webmanifest">`));
  fs.copyFileSync(icon, path.join(out, 'phone-icon.png'));
  fs.writeFileSync(path.join(out, 'manifest.webmanifest'), JSON.stringify({
    name: 'Agentbox', short_name: 'Agentbox', start_url: '/', scope: '/', display: 'standalone',
    background_color: '#1e1b1a', theme_color: '#1e1b1a',
    icons: [{ src: '/phone-icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' }],
  }));
  // Every address on the site is the page: a thread opened is a step in its history.
  fs.writeFileSync(path.join(out, '_redirects'), '/* /index.html 200\n');
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${origin.origin}`,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  fs.writeFileSync(path.join(out, '_headers'), [
    '/*',
    `  Content-Security-Policy: ${csp}`,
    '  Referrer-Policy: no-referrer',
    '  X-Content-Type-Options: nosniff',
    '  X-Frame-Options: DENY',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
    '',
  ].join('\n'));
  return { out, csp };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { out } = buildPhoneSite();
  console.log(`phone site written to ${path.relative(root, out)}/`);
}
