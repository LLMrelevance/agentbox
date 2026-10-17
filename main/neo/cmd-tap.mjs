// Runs Neo's ⌘ listener (cmd-tap.swift) and turns what it reports into
// "wake" calls. The helper is compiled on this Mac on first use, into the
// app's data folder, and rebuilt when its source changes; no binary is in git.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile, spawn as spawnChild } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { doubleTap } from '../../shared/neo-double-tap.mjs';

const SOURCE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cmd-tap.swift');

function build(outDir) {
  const source = fs.readFileSync(SOURCE);
  const hash = crypto.createHash('sha256').update(source).digest('hex').slice(0, 16);
  const bin = path.join(outDir, `cmd-tap-${hash}`);
  if (fs.existsSync(bin)) return Promise.resolve(bin);
  fs.mkdirSync(outDir, { recursive: true });
  for (const old of fs.readdirSync(outDir)) if (old.startsWith('cmd-tap-')) fs.rmSync(path.join(outDir, old), { force: true });
  return new Promise((resolve, reject) => {
    execFile('xcrun', ['swiftc', '-O', SOURCE, '-o', bin], { timeout: 180_000 }, (err) => (err ? reject(new Error('Could not build the ⌘ listener (is Xcode\'s command line tools installed?).')) : resolve(bin)));
  });
}

// onWake: a double tap happened. onState: 'ready' | 'no-permission' | 'stopped' | 'failed'.
export function listenForDoubleCommand({ outDir, onWake, onState = () => {}, spawn = spawnChild }) {
  let child = null;
  let stopped = false;
  const detector = doubleTap();
  let restarts = 0;

  const start = async () => {
    let bin;
    try { bin = await build(outDir); } catch (err) { onState('failed', err.message); return; }
    if (stopped) return;
    child = spawn(bin, [], { stdio: ['ignore', 'pipe', 'ignore'] });
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        const [kind, ms] = line.split(' ');
        if (kind === 'ready') { restarts = 0; onState('ready'); continue; }
        if (kind === 'no-permission') { onState('no-permission'); continue; }
        // The helper turns its tap back on; a tap half-seen across the gap does not count.
        if (kind === 'tap-off') { detector.feed('other', Number(ms)); continue; }
        if (detector.feed(kind, Number(ms))) onWake();
      }
    });
    child.on('exit', (code) => {
      child = null;
      if (stopped) return;
      if (code === 2) return; // no permission; asked once, wait for a restart of the app
      if (restarts++ < 3) setTimeout(start, 1000 * restarts);
      else onState('stopped');
    });
  };
  start();
  return { stop() { stopped = true; try { child?.kill(); } catch {} } };
}
