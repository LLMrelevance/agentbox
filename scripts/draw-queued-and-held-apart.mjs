// QUEUED AND HELD WORK, DRAWN APART FROM WORK THAT IS RUNNING (w-ec2b04d449).
//
// The power test found queued threads drawn exactly like working ones, in the
// list and on the board, with nothing saying a limit held them. This boots the
// renderer built from the branch on the fleet the testers had (2 of 2 agents
// busy, 4 waiting their turn, one out of usage, one signed out), draws today's
// screens, then draws five options over them.
//
//   node scripts/draw-queued-and-held-apart.mjs <outDir>
//
// The options are injected over the real screen rather than built: the type,
// the ink, the spacing and the marks are the app's own, and nothing here is in
// the app. It is the shutter, not the page.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'renderer', 'dist');
const out = process.argv[2] ?? path.join(root, 'scripts', 'scratch', 'queued-and-held');
fs.mkdirSync(out, { recursive: true });

const NOW = Date.now();
const MIN = 60_000;
const HOUR = 3_600_000;

const products = [
  { slug: 'payments', name: 'Payments API', dir: '/f/payments', repoPath: '/Users/you/dev/payments' },
  { slug: 'web', name: 'Web app', dir: '/f/web', repoPath: '/Users/you/dev/web' },
  { slug: 'mobile', name: 'Mobile', dir: '/f/mobile', repoPath: null },
  { slug: 'infra', name: 'Infra', dir: '/f/infra', repoPath: null },
  { slug: 'data', name: 'Data', dir: '/f/data', repoPath: null },
];
const nameOf = Object.fromEntries(products.map((p) => [p.slug, p.name]));

// Sent to an agent and not answered yet: `threadState` puts these in In
// progress, which is where the testers found them.
const sent = (id, slug, title, { ago, priority = 2, note = null }) => ({
  id, product: slug, productName: nameOf[slug], status: 'open', kind: 'task',
  title, body: title, note, labels: ['founder'], priority, epoch: 1, claim: null,
  createdAt: NOW - ago, updatedAt: NOW - ago,
});

const asks = (id, slug, title, { ago, note, priority = 2 }) => ({
  id, product: slug, productName: nameOf[slug], status: 'open', kind: 'question',
  title, body: title, note, labels: [], priority, epoch: 2, claim: null,
  createdAt: NOW - ago - HOUR, updatedAt: NOW - ago,
});

const items = [
  // IN PROGRESS, the shape of run 1 at 8:31: two agents up, four waiting their
  // turn, one out of usage, one signed out.
  sent('w-work1', 'web', 'Dark mode for the web app, with css variables', {
    ago: 4 * MIN, priority: 6,
    // An agent has already said something here, which is the case that read
    // "Status: Waiting" while it was plainly thinking (run 1, issue 17).
    note: 'The tokens are in three files. I am moving them into one and leaving the old names pointing at it.',
  }),
  sent('w-work2', 'infra', 'Find out why last night’s deploy rolled back', { ago: 40_000, priority: 5 }),
  sent('w-q1', 'payments', 'Write tests for the refund flow', { ago: 6 * MIN, priority: 4 }),
  sent('w-q2', 'payments', 'Review the last three commits for bugs', { ago: 6 * MIN, priority: 4 }),
  sent('w-q3', 'web', 'Rename the pricing helpers so they read the same way', { ago: 9 * MIN, priority: 3 }),
  sent('w-q4', 'mobile', 'A rollout plan for the new pricing page', { ago: 11 * MIN, priority: 3 }),
  sent('w-limit', 'data', 'Port the nightly export to the new schema', { ago: 14 * MIN, priority: 3 }),
  sent('w-signin', 'mobile', 'Audit the API for endpoints nothing calls', { ago: 21 * MIN, priority: 2 }),
  // NEEDS YOU, so the tab strip and the board are not drawn on an empty app.
  asks('w-ask1', 'payments', 'Idempotency keys on the refund endpoint, two ways', {
    ago: 12 * MIN, priority: 6,
    note: 'Two ways to do it. One key per refund request, or one per order with a window on it.',
  }),
  asks('w-ask2', 'web', 'The bundle is 180kb smaller. Ship it?', { ago: 26 * MIN, priority: 5, note: 'Three charts came off the first paint.' }),
  asks('w-ask3', 'infra', 'The failing test was a clock, not the cache', { ago: 48 * MIN, priority: 4, note: 'It passes on a frozen clock.' }),
];

const supervisor = {
  paused: false, pausedProducts: [], capacity: 2,
  productOrder: ['payments', 'web', 'mobile', 'infra', 'data'],
  hiddenProducts: [], personalProducts: [], stalled: [], scheduled: [], shipping: [], silent: {}, runNow: [],
  queued: ['w-q1', 'w-q2', 'w-q3', 'w-q4'],
  atLimit: { 'w-limit': { tool: 'Codex', until: NOW + 52 * MIN } },
  signInNeeded: { 'w-signin': 'Codex' },
  running: [
    {
      itemId: 'w-work1', product: 'web', startedAt: NOW - 4 * MIN,
      activity: [{ id: 'a1', label: 'Editing tokens.css', detail: 'tokens.css', startedAt: NOW - 25_000 }],
      tail: ['tool: Read', 'tool: Edit'],
    },
    {
      itemId: 'w-work2', product: 'infra', startedAt: NOW - 40_000,
      activity: [{ id: 'a2', label: 'Reading the deploy log', detail: 'deploy.log', startedAt: NOW - 9_000 }],
      tail: ['tool: Bash'],
    },
  ],
};

const snapshot = { products, items, approvals: [], supervisor, restartNeeded: null, config: { pins: [] } };

// The conversation behind each row, in the store's own line shape, so a thread
// opens on what was said rather than on "Nothing has been said here yet."
const history = Object.fromEntries(items.map((it) => {
  const lines = [{
    id: it.id, ts: it.createdAt, source: it.labels.includes('founder') ? 'founder' : 'agent',
    patch: { title: it.title, body: it.body, kind: it.kind, status: 'open', labels: it.labels, priority: it.priority },
  }];
  if (it.note) lines.push({ id: it.id, ts: it.updatedAt, source: 'agent', patch: { note: it.note } });
  return [it.id, lines];
}));

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

const W = 1440, H = 920;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text().slice(0, 160)); });
await page.addInitScript(([snap, lines]) => {
  const known = {
    snapshot: async () => snap,
    itemHistory: async (p) => ({ ok: true, lines: lines[p?.id] ?? [] }),
    // Nothing is waiting to be picked up on a phone, so the offer card stays
    // off these pictures.
    remoteControl: async () => ({ state: 'off', at: 0 }),
    settings: async () => ({ ok: false }),
    dashboard: async () => ({ ok: false }),
    repeats: async () => [],
    sessionTrace: async () => ({ ok: true, sessions: [] }),
    compactionStatus: async () => null,
    codeChange: async () => ({ ok: false }),
    neoEnabled: async () => false,
    // Signed in on both, so the setup bar stays off these pictures.
    engineSetup: async () => ({ ok: true, phase: 'ready', found: true, signedIn: true }),
  };
  window.zero = new Proxy(known, {
    get(target, key) {
      if (key in target) return target[key];
      if (typeof key === 'string' && key.startsWith('on')) return () => () => {};
      return async () => ({ ok: false });
    },
    has: () => true,
  });
  localStorage.setItem('zero.firstRun.done', '1');
  localStorage.setItem('zero.theme', 'dark');
  // The reset time, read and written exactly as live-line.ts writes it.
  window.__RESET__ = new Date(snap.supervisor.atLimit['w-limit'].until)
    .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(/\s/g, '').toLowerCase();
  window.addEventListener('error', (e) => { window.__ERR__ = `${e.message} @ ${e.filename ?? ''}`; });
}, [snapshot, history]);

const shoot = async (name) => {
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await page.waitForTimeout(350);
  const file = path.join(out, `${name}.png`);
  await page.screenshot({ path: file });
  console.log(file);
};

const openInProgress = async () => {
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('button, [role="tab"], a')].find((b) => /in progress/i.test(b.textContent || ''));
    tab?.click();
  });
  await page.waitForTimeout(800);
};

const start = async ({ board = false } = {}) => {
  await page.addInitScript((wantBoard) => {
    localStorage.setItem('threads.display.inbox', JSON.stringify({ view: wantBoard ? 'board' : 'list', sort: 'priority', priorities: [], projects: [], updated: 'any' }));
  }, board);
  await page.goto(origin, { waitUntil: 'load' });
  await page.waitForSelector(board ? '.th-card' : '.row', { timeout: 20_000 });
  await page.waitForTimeout(1000);
};

/* ------------------------------------------------------- the five options */
// Each one is a function run inside the page over the drawn In progress table.
const paint = (option) => page.evaluate((opt) => {
  const STATE = {
    'w-work1': { s: 'working', word: 'Working', when: '4m' },
    'w-work2': { s: 'working', word: 'Working', when: 'just now' },
    'w-q1': { s: 'queued', word: 'Queued' },
    'w-q2': { s: 'queued', word: 'Queued' },
    'w-q3': { s: 'queued', word: 'Queued' },
    'w-q4': { s: 'queued', word: 'Queued' },
    'w-limit': { s: 'limit', word: 'Codex at its limit', col: 'At its limit' },
    'w-signin': { s: 'signin', word: 'Codex signed out', col: 'Signed out' },
  };
  const rows = () => [...document.querySelectorAll('.row[data-item-id]')];
  const head = () => document.querySelector('.row.th-head .th-grid');
  const css = (text) => {
    const tag = document.createElement('style');
    tag.id = 'option-style';
    tag.textContent = text;
    document.head.append(tag);
  };
  // The still ring a thread waiting its turn wears, and the dot a held one
  // wears, drawn from the app's own state mark.
  const mark = (s) => {
    const el = document.createElement('span');
    el.className = `th-st opt-st opt-${s}`;
    return el;
  };
  css(`
    .opt-st { width: 12px; height: 12px; border-radius: 50%; box-sizing: border-box; margin-right: 9px; position: relative; top: 1px; flex: none; display: inline-block; }
    .opt-queued { border: 1.5px solid var(--text-faint); }
    .opt-limit, .opt-signin { border: 1.5px solid var(--accent); background: none; }
    .opt-working { border: 1.5px solid var(--accent); background: conic-gradient(var(--accent) 0 50%, transparent 50% 100%); }
    .opt-held-ink { color: var(--text-dim); }
  `);

  if (opt === 1) {
    // THE LAST COLUMN SAYS WHAT IS HAPPENING instead of when the row was last
    // touched. On In progress, every row is about an agent.
    css('.th-grid, .th-grid.with-person { grid-template-columns: minmax(0, 1fr) 150px 112px 176px; }');
    const h = head();
    if (h) h.lastElementChild.textContent = 'Status';
    for (const row of rows()) {
      const st = STATE[row.dataset.itemId];
      if (!st) continue;
      const cell = row.querySelector('.th-when');
      if (!cell) continue;
      cell.textContent = st.s === 'working' ? `Working  ${st.when}` : st.word;
      if (st.s !== 'working') cell.classList.add('opt-held-ink');
    }
  }

  if (opt === 2) {
    // HEADINGS IN THE LIST'S OWN GROUP LABEL, so the shape of the fleet is
    // read without reading a single row, and the held group's heading is the
    // reason itself.
    const order = [['Working', 2, ['w-work1', 'w-work2']],
      ['Waiting their turn', 4, ['w-q1', 'w-q2', 'w-q3', 'w-q4']],
      [`Codex is at its limit until ${window.__RESET__}`, 1, ['w-limit']],
      ['Codex is signed out', 1, ['w-signin']]];
    const list = rows()[0]?.parentElement;
    if (list) {
      css('.day-label .opt-n { color: var(--text-faint); margin-left: 7px; } .day-label { margin-top: 26px; }');
      for (const [label, n, ids] of order) {
        const head = document.createElement('div');
        head.className = 'day-label';
        head.innerHTML = `${label}<span class="opt-n">${n}</span>`;
        list.append(head);
        for (const id of ids) {
          const row = rows().find((r) => r.dataset.itemId === id);
          if (row) list.append(row);
        }
      }
    }
  }

  if (opt === 3) {
    // ONE LINE OVER THE LIST, and the limit that caused it is the thing you
    // can press.
    const bar = document.querySelector('.th-table') ?? document.querySelector('.list');
    const line = document.createElement('div');
    line.className = 'opt-line';
    line.innerHTML = 'Both agents are busy, so 4 threads are waiting their turn and 2 cannot start. <button type="button">Run more at once</button>';
    bar?.parentElement?.insertBefore(line, bar);
    css(`
      .opt-line { padding: 2px var(--row-r, 24px) 14px var(--text-x, 32px); font-size: 13px; line-height: 20px; color: var(--text-dim); }
      .opt-line button { font: inherit; color: var(--text); background: none; border: 0; border-bottom: 1px solid var(--line-strong); padding: 0 0 1px; margin-left: 6px; cursor: pointer; }
    `);
  }

  if (opt === 4) {
    // A COLUMN OF ITS OWN, which is the table's own way of saying a fact about
    // every row.
    css('.th-grid, .th-grid.with-person { grid-template-columns: minmax(0, 1fr) 168px 150px 112px 96px; }');
    const h = head();
    if (h) {
      const cell = document.createElement('div');
      cell.textContent = 'Status';
      h.firstElementChild.after(cell);
    }
    for (const row of rows()) {
      const st = STATE[row.dataset.itemId];
      if (!st) continue;
      const title = row.querySelector('.th-cell-title');
      const cell = document.createElement('div');
      cell.className = 'th-cell-proj opt-state-cell';
      cell.append(mark(st.s), document.createTextNode(st.col ?? st.word));
      title.after(cell);
      // The mark moves out of the title and into the column that is about it.
      title.querySelector('.th-st')?.remove();
    }
    css('.opt-state-cell { display: flex; align-items: center; color: var(--text-dim); }');
  }

  if (opt === 5) {
    // QUEUED IS ITS OWN TAB, and work nothing can start goes back to Needs
    // you, because only you can fix it. In progress then means one thing: an
    // agent is on it. Drawn on Needs you, where the held threads now are.
    const tabs = [...document.querySelectorAll('.tm-tab')];
    for (const tab of tabs) {
      const text = (tab.textContent || '').trim();
      if (/^needs you/i.test(text)) { tab.innerHTML = tab.innerHTML.replace(/>3</, '>5<'); tab.classList.add('active', 'on'); }
      if (/^in progress/i.test(text)) {
        tab.innerHTML = tab.innerHTML.replace(/>8</, '>2<');
        tab.classList.remove('active', 'on');
        const queued = tab.cloneNode(true);
        queued.innerHTML = '<span>Queued</span><b>4</b>';
        queued.classList.remove('active', 'on');
        tab.after(queued);
      }
    }
    // The two threads nothing can start, now in Needs you, each saying what it
    // is waiting for where the time sits.
    const list = rows()[0]?.parentElement;
    const held = [['Port the nightly export to the new schema', 'Data', `Codex is at its limit until ${window.__RESET__}`],
      ['Audit the API for endpoints nothing calls', 'Mobile', 'Codex is signed out']];
    for (const [title, project, why] of held) {
      const row = rows()[0].cloneNode(true);
      row.className = 'row  ';
      const cell = row.querySelector('.th-cell-title');
      cell.textContent = title;
      const aside = document.createElement('span');
      aside.className = 'th-aside';
      aside.textContent = why;
      cell.append(aside);
      row.querySelector('.th-cell-proj').textContent = project;
      row.querySelector('.th-when').textContent = '14 min ago';
      list.append(row);
    }
    const count = document.querySelector('.workspace-running');
    if (count) count.textContent = '5';
  }
  return document.querySelectorAll('.row[data-item-id]').length;
}, option);

/* --------------------------------------------------------------- the run */
await start();
await shoot('00-today-needs-you');
await openInProgress();
await shoot('01-today-in-progress');

// The board, as it is today. Taller, because the In progress column is eight
// cards deep and the whole of it is the point.
await page.setViewportSize({ width: W, height: 1240 });
await start({ board: true });
await shoot('02-today-board');
await page.setViewportSize({ width: W, height: H });
console.log('BOARD CARD:', await page.evaluate(() => document.querySelector('.th-card')?.outerHTML.slice(0, 600) ?? 'none'));

// A thread with an agent working in it, which is where Status says Waiting.
await start();
await openInProgress();
await page.evaluate(() => document.querySelector('[data-item-id="w-work1"] .th-cell-title')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
await page.waitForTimeout(1200);
await shoot('03-today-thread-working');
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
await openInProgress();
await page.evaluate(() => document.querySelector('[data-item-id="w-limit"] .th-cell-title')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
await page.waitForTimeout(1000);
await shoot('04-today-thread-at-its-limit');

console.log('STATUS ROW:', await page.evaluate(() => {
  const row = [...document.querySelectorAll('*')].find((el) => el.children.length === 2 && /^Status/.test(el.textContent || '') && el.textContent.length < 40);
  return row?.outerHTML.slice(0, 500) ?? 'none';
}));

for (const option of [1, 2, 3, 4, 5]) {
  await start();
  if (option !== 5) await openInProgress();
  const n = await paint(option);
  await page.waitForTimeout(500);
  await shoot(`1${option}-option-${option}`);
  console.log(`option ${option}: ${n} rows`);
}

/* ------------------- the same vocabulary on the board and in the thread */
// The headings of option 2, inside the board's In progress column.
await page.setViewportSize({ width: W, height: 1240 });
await start({ board: true });
console.log('board groups:', await page.evaluate((reset) => {
  const head = [...document.querySelectorAll('*')].find((el) => /^IN PROGRESS/i.test((el.textContent || '').trim()) && el.children.length <= 2);
  const cards = [...document.querySelectorAll('.th-card')];
  const column = cards.find((c) => c.closest('*')) && cards[0]?.parentElement;
  // The In progress column is the one holding the eight sent threads.
  const inProgress = [...document.querySelectorAll('.th-card')].filter((c) => ['w-work1', 'w-work2', 'w-q1', 'w-q2', 'w-q3', 'w-q4', 'w-limit', 'w-signin'].includes(c.dataset.boardId));
  const box = inProgress[0]?.parentElement;
  if (!box) return 'no column';
  const tag = document.createElement('style');
  tag.textContent = '.opt-board-head { font-size: 12px; line-height: 17px; color: var(--text-dim); margin: 18px 0 8px; } .opt-board-head:first-child { margin-top: 0; } .opt-board-head b { color: var(--text-faint); font-weight: 400; margin-left: 7px; }';
  document.head.append(tag);
  const groups = [['Working', ['w-work1', 'w-work2']], ['Waiting their turn', ['w-q1', 'w-q2', 'w-q3', 'w-q4']],
    [`Codex is at its limit until ${reset}`, ['w-limit']], ['Codex is signed out', ['w-signin']]];
  for (const [label, ids] of groups) {
    const head = document.createElement('div');
    head.className = 'opt-board-head';
    head.innerHTML = `${label}<b>${ids.length}</b>`;
    box.append(head);
    for (const id of ids) {
      const card = inProgress.find((c) => c.dataset.boardId === id);
      if (card) box.append(card);
    }
  }
  return `${head ? 'head found' : 'no head'} / ${inProgress.length} cards`;
}, await page.evaluate(() => window.__RESET__)));
await page.waitForTimeout(400);
await shoot('20-option-2-on-the-board');
await page.setViewportSize({ width: W, height: H });

// THE STATUS ROW, which says Waiting today while the agent is plainly working.
const paintThread = (word, glyph) => page.evaluate(([word, glyph]) => {
  const label = [...document.querySelectorAll('.ts-label')].find((el) => (el.textContent || '').trim() === 'Status');
  const value = label?.nextElementSibling;
  const button = value?.querySelector('.ts-prop-btn') ?? value;
  if (!button) return 'no status row';
  const mark = button.querySelector('.ts-st');
  if (mark) mark.className = `ts-st ts-st-${glyph}`;
  for (const node of [...button.childNodes]) if (node.nodeType === 3) node.textContent = word;
  return button.textContent;
}, [word, glyph]);

await start();
await openInProgress();
await page.evaluate(() => document.querySelector('[data-item-id="w-work1"] .th-cell-title')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
await page.waitForTimeout(1200);
console.log('status row ->', await paintThread('Working', 'run'));
await shoot('21-status-says-working');
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
await openInProgress();
await page.evaluate(() => document.querySelector('[data-item-id="w-limit"] .th-cell-title')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
await page.waitForTimeout(1000);
console.log('status row ->', await paintThread('At its limit', 'wait'));
await shoot('22-status-says-at-its-limit');

// And the recommended option on the light theme, which is the other one she reads in.
// The look is a theme and a skin together: without the skin the saved Dark
// picture is normalised back over the light theme before the first paint.
await page.addInitScript(() => {
  localStorage.setItem('zero.theme', 'light');
  localStorage.setItem('zero.skin', 'none');
});
await start();
await openInProgress();
await paint(2);
await page.waitForTimeout(500);
await shoot('23-option-2-light');
console.log('error:', await page.evaluate(() => window.__ERR__ ?? ''));
await browser.close();
server.close();
