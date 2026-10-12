#!/usr/bin/env node
// THE PRE-DEPLOY CHECK: ONE COMMAND, THE LAYERS A CHANGE NEEDS, ONE VERDICT.
//
//   node .claude/skills/verify-agentbox/scripts/verify.mjs            what this branch touches
//   node .claude/skills/verify-agentbox/scripts/verify.mjs --all      every layer
//   node .claude/skills/verify-agentbox/scripts/verify.mjs --real-claude   live drives on real Claude Code
//   node .claude/skills/verify-agentbox/scripts/verify.mjs --base <ref>    compare against <ref> (default origin/main)
//
// The unit tests are not repeated here: `npm run ship`, the push hook and CI
// run them. This is what they cannot see:
//
//   machines      the app's own finders and worker setup on 17 Macs unlike
//                 this one (check-machines.mjs). ~35 s.
//   this-machine  the same, for real, on the Mac it runs on (check-this-machine.mjs). ~2 s.
//   live          a throwaway copy of the app driven by keyboard in headless
//                 Chrome: inbox, new thread, reply (live.mjs + drives.mjs). ~40 s.
//
// Exit 0 only when every layer that ran held (known gaps excepted). The
// evidence of every layer goes in one folder under /tmp/agentbox-verify/runs.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '../../../..');

/**
 * WHICH LAYERS A SET OF CHANGED FILES NEEDS. Pure, so it is tested
 * (tests/the-pre-deploy-check-runs-what-a-change-needs.test.mjs).
 *
 * The rule is "could this change what a user's Mac does", not "is it code":
 * anything under main/, shared/, bin/, renderer/ or preload can, and the
 * verify skill itself is re-proved when it changes. Docs, tests and one-off
 * scripts cannot, so a branch of only those runs the cheap layer alone.
 */
export const MACHINE_FILES = [
  /^main\/(shell-path|claude-bin|codex-bin|codex-launch-env|config|harnesses|claude-input)(\.mjs|\/)/,
  /^main\/harnesses\//,
  /^shared\/(engines|fresh-user-home|product-name)\.mjs$/,
  /^package(-lock)?\.json$/,
  /^\.claude\/skills\/verify-agentbox\/scripts\/(machines|check-machines|check-this-machine)\.mjs$/,
];
export const LIVE_FILES = [
  /^(main|shared|bin|renderer|mcp)\//,
  /^preload\.cjs$/,
  /^package(-lock)?\.json$/,
  /^scripts\/lib\/stub-claude-worker\.mjs$/,
  /^\.claude\/skills\/verify-agentbox\/scripts\//,
];
export function layersFor(files, { all = false } = {}) {
  const hit = (rules) => files.filter((f) => rules.some((r) => r.test(f)));
  const machines = hit(MACHINE_FILES);
  const live = hit(LIVE_FILES);
  return {
    'this-machine': { run: true, why: 'always: it is two seconds and it is the only real Mac in the check' },
    machines: all || machines.length
      ? { run: true, why: all ? '--all' : `touches how the app finds or starts a tool: ${machines.slice(0, 3).join(', ')}${machines.length > 3 ? ' …' : ''}` }
      : { run: false, why: 'nothing here changes how the app finds or starts Claude Code or Codex' },
    live: all || live.length
      ? { run: true, why: all ? '--all' : `touches what the app does: ${live.slice(0, 3).join(', ')}${live.length > 3 ? ' …' : ''}` }
      : { run: false, why: 'only docs, tests or scripts changed, which a user never runs' },
  };
}

export const DRIVE_ORDER = ['inbox-opens', 'new-thread', 'reply'];

function changedFiles(base) {
  try {
    const committed = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: REPO, encoding: 'utf8' });
    const working = execFileSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8' })
      .split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, '').split(' -> ').pop());
    return [...new Set([...committed.split('\n').filter(Boolean), ...working])];
  } catch { return null; }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const real = args.includes('--real-claude');
  const b = args.indexOf('--base');
  const base = b >= 0 ? args[b + 1] : 'origin/main';
  const files = changedFiles(base);
  if (!files && !all) { console.error(`verify: could not diff against ${base}. Pass --all, or --base <ref>.`); process.exit(2); }
  const layers = layersFor(files ?? [], { all: all || real });
  const out = path.join('/tmp', 'agentbox-verify', 'runs', `${new Date().toISOString().replace(/[:.]/g, '-')}-verify`);
  fs.mkdirSync(out, { recursive: true });
  const node = (script, a, label) => {
    console.log(`\n── ${label} ${'─'.repeat(Math.max(0, 66 - label.length))}`);
    return spawnSync(process.execPath, [path.join(here, script), ...a], { cwd: REPO, stdio: 'inherit' }).status;
  };
  const results = [];
  console.log(`verify: ${files ? `${files.length} file(s) differ from ${base}` : 'every layer'}`);
  for (const [name, l] of Object.entries(layers)) console.log(`  ${l.run ? 'run ' : 'skip'}  ${name.padEnd(13)} ${l.why}`);

  if (layers['this-machine'].run) results.push(['this-machine', node('check-this-machine.mjs', ['--out', path.join(out, 'this-machine')], 'this machine')]);
  if (layers.machines.run) results.push(['machines', node('check-machines.mjs', ['--out', path.join(out, 'machines')], 'machines unlike this one')]);
  if (layers.live.run) {
    const upped = node('live.mjs', ['up', ...(real ? ['--real-claude'] : [])], 'live: up');
    if (upped !== 0) results.push(['live: up', upped]);
    else {
      try {
        const doc = node('live.mjs', ['doctor'], 'live: doctor');
        if (doc !== 0) results.push(['live: doctor', doc]);
        else {
          for (const d of DRIVE_ORDER) {
            const s = node('live.mjs', ['drive', d, '--out', path.join(out, `drive-${d}`)], `live: ${d}`);
            results.push([`live: ${d}`, s]);
            // Invariant: never drive an instance that has not been checked
            // since it last did something surprising.
            if (s !== 0 && node('live.mjs', ['doctor'], 'live: doctor after a failed drive') !== 0) break;
          }
        }
      } finally {
        node('live.mjs', ['down'], 'live: down');
      }
    }
  }
  const bad = results.filter(([, s]) => s !== 0);
  console.log(`\n── verdict ${'─'.repeat(59)}`);
  for (const [name, s] of results) console.log(`  ${s === 0 ? 'held' : 'FAIL'}  ${name}`);
  console.log(`\n${bad.length ? `NOT READY: ${bad.length} layer(s) failed.` : 'Ready to ship: every layer that ran held.'} Evidence: ${out}`);
  process.exit(bad.length ? 1 : 0);
}
