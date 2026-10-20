// The risk gate from the agent's side (scripts/lib/risk-tier.mjs).
//
//   npm run risk            what the rules say about this branch, with no key and no network
//   npm run ship:approved   the person said ship it: record that for this exact commit
//   npm run risk -- --log   every verdict the ship script has logged on this Mac
//
// The rules here are only a preview. The verdict that counts is the ship
// script's, run by the app from the base checkout, which also asks the
// classifier about whatever the rules leave open.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { rulesTier, readFacts, readGate, approvalFile, riskLogFile } from './lib/risk-tier.mjs';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const arg = process.argv[2];

if (arg === '--approved') {
  const head = git('rev-parse', 'HEAD');
  fs.writeFileSync(approvalFile(git('rev-parse', '--absolute-git-dir')), `${head}\n`);
  console.log(`risk: approval recorded for ${head.slice(0, 9)}. A commit after this one needs approving again.`);
} else if (arg === '--log') {
  const file = riskLogFile(git('rev-parse', '--path-format=absolute', '--git-common-dir'));
  const rows = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
  const count = (t) => rows.filter((r) => r.tier === t).length;
  console.log(`${rows.length} ships judged: ${count('low')} low, ${count('look')} look, ${count('risky')} risky, ${rows.filter((r) => r.broke).length} where the gate broke.`);
  for (const r of rows.slice(-Number(process.argv[3] ?? 20))) {
    console.log(`${r.at}  ${r.branch}  ${r.tier ?? 'broke'}${r.confidence != null ? ` (${r.confidence})` : ''}  ${r.mode}${r.approved ? ' approved' : ''}  ${(r.reasons ?? [r.broke]).join('; ')}`);
  }
} else {
  const gate = readGate(new URL('./risk-gate.json', import.meta.url));
  const { tier, reasons } = rulesTier(readFacts(process.cwd(), 'origin/main'), gate);
  const said = tier ?? 'not settled by the rules: the classifier decides when it ships';
  console.log(`risk: ${said}${reasons.length ? `\n  ${reasons.join('\n  ')}` : ''}`);
  console.log(`gate: ${gate.mode}${gate.mode === 'shadow' ? ' (nothing is held back; ask the person as before)' : ''}`);
}
