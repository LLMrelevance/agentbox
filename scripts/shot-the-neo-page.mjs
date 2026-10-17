// THE NEO PAGE IN SETTINGS, drawn from the branch (w-6a1c405642).
//
// The inbox harness beside this one drives Chrome on a Mac and reads the real
// store; this runs where neither is there, so it serves `renderer/dist` and
// drives Playwright's Chromium with a stand-in `window.zero`. Nothing here is
// in the app: it is the shutter, not the page.
//
//   node scripts/shot-the-neo-page.mjs <outDir>
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Playwright is installed for the machine, not for this checkout, and an ESM
// import does not read NODE_PATH.
const { chromium } = createRequire(import.meta.url)('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'renderer', 'dist');
const out = process.argv[2] ?? path.join(root, 'scripts', 'scratch', 'neo-page');
fs.mkdirSync(out, { recursive: true });

const AT = Date.now();
const DAY = 86_400_000;
const MEMORY = {
  ok: true,
  instructions: 'Never read an id or a file path out loud. If a pick would merge, ship or delete something, ask me first even when I sound sure.\n\nWhen I open a thread, remind me what it is for in one sentence before anything else.',
  memories: [
    { id: 'm-1', text: 'Never close a thread without asking me first.', at: AT - 6 * DAY },
    { id: 'm-2', text: 'Say the option number before you read out what it does.', at: AT - 2 * DAY },
    { id: 'm-3', text: 'I am usually working on the pricing project in the mornings.', at: AT - DAY },
    { id: 'm-4', text: 'Do not play a film unless I ask for it by name.', at: AT - 3600_000 },
  ],
};

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.join(dist, decodeURIComponent(url.pathname));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const items = [
  { id: 'w-1', title: 'Neo memories and a Neo page in Settings', status: 'claimed', kind: 'directive', labels: ['founder'], priority: 0, product: 'agentbox', productName: 'Agentbox', createdAt: AT - DAY, updatedAt: AT - 3600_000, body: 'Give Neo a memory, and a page in Settings for it.' },
  { id: 'w-2', title: 'Pricing page copy', status: 'open', kind: 'task', labels: [], priority: 0, product: 'lantern', productName: 'Lantern', createdAt: AT - 2 * DAY, updatedAt: AT - 2 * DAY, body: 'Rewrite the three tiers.' },
];
const snapshot = {
  products: [{ slug: 'agentbox', name: 'Agentbox' }, { slug: 'lantern', name: 'Lantern' }],
  items, approvals: [],
  supervisor: { paused: false, pausedProducts: [], running: [], stalled: [], queued: [], scheduled: [], productOrder: ['agentbox', 'lantern'], hiddenProducts: [], personalProducts: [], capacity: 2 },
  restartNeeded: null, config: {},
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 2 });
await page.addInitScript(([snap, memory]) => {
  let kept = memory;
  let pace = 'normal';
  let captions = true;
  const w = window;
  w.zero = {
    snapshot: async () => snap,
    dashboard: async () => ({ ok: false }),
    repeats: async () => [],
    sessionTrace: async () => ({ sessions: [] }),
    onChanged: () => () => {},
    neoEnabled: async () => true,
    onNeoAct: () => () => {},
    onNeoMode: () => () => {},
    onNeoOrb: () => () => {},
    neoActResult: () => {},
    neoMemory: async (change = {}) => {
      if (typeof change?.instructions === 'string') kept = { ...kept, instructions: change.instructions };
      if (typeof change?.forget === 'string') kept = { ...kept, memories: kept.memories.filter((m) => m.id !== change.forget) };
      if (typeof change?.add === 'string') kept = { ...kept, memories: [...kept.memories, { id: `m-${Date.now()}`, text: change.add, at: Date.now() }] };
      return kept;
    },
    neoPace: async (p) => (p ? (pace = p) : pace),
    neoCaptions: async (on) => (typeof on === 'boolean' ? (captions = on) : captions),
  };
  localStorage.setItem('zero.firstRun.done', '1');
  localStorage.setItem('zero.theme', 'dark');
  w.addEventListener('error', (e) => { w.__ERR__ = `${e.message} @ ${e.filename ?? ''}`; });
}, [snapshot, MEMORY]);

const shoot = async (name, { full = false } = {}) => {
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await page.waitForTimeout(500);
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file, fullPage: full });
  console.log(file);
};

await page.goto(`${origin}/?settings=neo`, { waitUntil: 'load' });
await page.waitForSelector('.neo-page', { timeout: 15_000 });
await page.waitForTimeout(1200);
await shoot('neo-page');
// The foot of the page: the rest of the memories and the two controls under them.
await page.locator('.set-group[data-find="neo-talks"]').scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
await shoot('neo-page-foot');

// The same page next to one that was already there, so the house style is
// visible rather than argued about.
await page.goto(`${origin}/?settings=general`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await shoot('settings-general');

// The menu with the Neo row in it, so the place it sits is visible too.
await page.goto(`${origin}/?settings=1`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await shoot('settings-menu');

// And the search somebody would type to reach it.
await page.goto(`${origin}/?settings=1`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
await page.fill('.settings-screen input[type="search"], .settings-screen input', 'memories').catch(() => {});
await page.waitForTimeout(600);
await shoot('settings-search');

const err = await page.evaluate(() => window.__ERR__ ?? null);
if (err) console.error('page error:', err);
await browser.close();
server.close();
