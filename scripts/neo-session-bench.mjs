// Interactive, silent GPT-Live drive. Private seeds and journals stay outside git.
// node scripts/neo-session-bench.mjs --live --webrtc [--seed <private.json>] [--port 7341]
// POST {"say":"..."}, {"screen":true}, {"capture":"/absolute/image.png"}, or {"stop":true} to /test.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'undici';
import ts from 'typescript';
import { PNG } from 'pngjs';
import { build } from 'esbuild';
import { guard } from './lib/chrome-guard.mjs';
import { connect } from '../.claude/skills/verify-agentbox/scripts/cdp.mjs';
import { runDecision } from '../main/neo/decided.mjs';
import { decide, composeReply } from '../main/neo/decide.mjs';
import { readKey } from '../main/neo/live.mjs';
import { neoSession, contextNote } from '../shared/neo-tools.mjs';
import { DOC_SCHEME } from '../shared/schemes.mjs';
import { neoBrowserSession } from '../tests/support/neo-browser-session.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
if (!process.argv.includes('--live')) throw new Error('Pass --live to spend OpenAI credits on this silent conversation test.');
const seeds = JSON.parse(fs.readFileSync(arg('--seed', path.join(root,'scripts/fixtures/neo-workday.json')), 'utf8'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-session-'));
const began = Date.now();
const journal = path.resolve(arg('--journal', path.join(temp, 'journal.jsonl')));
const record = (entry) => fs.appendFileSync(journal, JSON.stringify({ seconds: Math.round((Date.now() - began) / 1000), ...entry }) + '\n');
let tab, cleanChrome, app, control, boot, live, timer, native;
let busy = false, input = Buffer.alloc(0), lastOutput = 0, words = '', voiceSeconds = 0, calls = 0;
let closed = false, started = false;
const state = {}, history = [], errors = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (const k of Object.keys(process.env)) {
  if (/^(ZERO_|STORE_|AGENTBOX_|ASTRAL_|ANTHROPIC_|CLAUDE_CODE_|OPENAI_|CODEX_)/.test(k)) delete process.env[k];
}
process.env.AGENTBOX_HOME = path.join(temp, 'home');
process.env.AGENTBOX_FRESH_USER = '1';
process.env.ZERO_NO_SUPERVISOR = '1';
const cleanup = async () => {
  clearInterval(timer);
  if(native){if(!native.stats().closed)await native.stop();native.close();}
  live?.close(); tab?.detach(); cleanChrome?.();
  control?.closeAllConnections(); control?.close(); app?.closeAllConnections(); app?.close();
  boot?.supervisor.killAll(); boot?.supervisor.stop(); boot?.store.watchers.forEach((w) => w.close());
  fs.rmSync(temp, { recursive: true, force: true });
};
process.on('SIGINT', async () => { await cleanup(); process.exit(130); });
process.on('SIGTERM', async () => { await cleanup(); process.exit(143); });

try {
  const key = await readKey();
  const getKey = async () => key;
  const { bootHeadless, createServer, fileKey } = await import('../main/serve.mjs');
  const disk = await import('../main/store/work-items.mjs');
  const dataDir = path.join(temp, 'data'), storeRoot = path.join(temp, 'store');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'zero.config.json'), JSON.stringify({ storeRoot, accountId: 'neo-test', maxConcurrentSessions: 0, agentsAuto: false, engineChoice: '2026-01-01' }));
  const productDir = path.join(storeRoot, 'accounts', 'neo-test', 'sandbox');
  fs.mkdirSync(productDir, { recursive: true });
  fs.writeFileSync(path.join(productDir, 'project.json'), JSON.stringify({ schemaVersion: 2, id: 'sandbox', name: 'Sandbox' }));
  boot = await bootHeadless({ dataDir, userDir: dataDir, appDir: root });
  boot.supervisor.wake = () => {}; boot.supervisor.tick = async () => {};
  for (const seed of seeds) {
    if (seed.fixtures) {
      const folder = path.join(productDir, 'designs', `fixture-${seeds.indexOf(seed)}`);
      fs.mkdirSync(folder, { recursive:true });
      const assets = [];
      if (seed.fixtures.includes('pictures')) for (let i=1;i<=3;i++) {
        const image = new PNG({width:640,height:400});
        for(let p=0;p<image.data.length;p+=4){const x=p/4%640,y=Math.floor(p/4/640);image.data[p]=x>60&&x<580&&y>80&&y<320?30*i:20;image.data[p+1]=30+i*15;image.data[p+2]=65+i*25;image.data[p+3]=255;}
        const file=path.join(folder,`design-${i}.png`);fs.writeFileSync(file,PNG.sync.write(image));assets.push(file);
      }
      if (seed.fixtures.includes('page')) { const file=path.join(folder,'release-draft.html');fs.writeFileSync(file,'<!doctype html><html style="color-scheme:dark"><title>Release draft</title><h1>Work from your phone</h1><p>Read and reply to your agents wherever you are.</p></html>');assets.push(file); }
      if (seed.fixtures.includes('sound')) {
        const pcm=Buffer.alloc(48000*60), wav=Buffer.alloc(44+pcm.length);
        wav.write('RIFF');wav.writeUInt32LE(36+pcm.length,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(24000,24);wav.writeUInt32LE(48000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length,40);
        const file=path.join(folder,'connection-chime.wav');fs.writeFileSync(file,wav);assets.push(file);
      }
      if (seed.fixtures.includes('broken-sound')) { const file=path.join(folder,'broken-chime.wav');fs.writeFileSync(file,'Not a playable audio file.');assets.push(file); }
      seed.result=seed.result.replace('## Options',assets.join('\n\n')+'\n\n## Options');
    }
    const row = boot.store.composeItem('sandbox', { title: seed.title, body: seed.body });
    disk.updateWorkItem(productDir, row.id, { result: seed.result, problem: seed.problem, progress: seed.progress, status: 'done' }, { source: 'agent' });
    seed.id = row.id;
  }
  const token = 'neo-test-local-only';
  // The operator opts into reading assets named in their private seed; this server is loopback only.
  const assetRoots = [...new Set(seeds.flatMap((s) => [...String(s.result).matchAll(/\/Users\/[^\s)]+\/designs\//g)].map((m) => m[0])))];
  app = createServer({ channels: boot.channels, listeners: boot.window.listeners, token,
    files: { allows: (_kind, file) => file.startsWith(productDir + path.sep) || assetRoots.some((r) => file.startsWith(r)) } });
  await new Promise((r,j) => { app.once('error',j);app.listen(0, '127.0.0.1', r); });
  const url = `http://127.0.0.1:${app.address().port}/?token=${token}`;
  const chrome = spawn(process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--deny-permission-prompts', '--remote-debugging-port=0',
    `--user-data-dir=${path.join(temp, 'chrome')}`, '--no-first-run', '--window-size=1440,900', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  cleanChrome = guard(chrome, path.join(temp, 'chrome'));
  const wsUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Muted browser did not start.')), 20000);
    let out = ''; chrome.on('error', reject);
    chrome.stderr.on('data', (v) => { out += v; const m = out.match(/ws:\/\/\S+/); if (m) { clearTimeout(timeout); resolve(m[0]); } });
  });
  tab = await connect(wsUrl);
  const filesBundle = await build({ entryPoints:[path.join(root,'renderer/src/phone-files.ts')],bundle:true,write:false,format:'iife',globalName:'neoTestFiles' });
  await tab.call('Page.addScriptToEvaluateOnNewDocument', { source: filesBundle.outputFiles[0].text + `\naddEventListener('DOMContentLoaded',()=>neoTestFiles.installPhoneFiles(${JSON.stringify(fileKey(token))}));` });
  await tab.call('Page.addScriptToEvaluateOnNewDocument', { source: `
    let zero;
    Object.defineProperty(window, 'zero', { configurable:true, get:()=>zero, set:(bridge)=>{
      zero=bridge; let act, seq=0; const pending=new Map();
      const openArtifact=bridge.openArtifact;
      bridge.openArtifact=async(p)=>{
        const result=await openArtifact(p);
        if(p.mode==='resolve'&&result?.ok&&/\\.html?$/i.test(result.opened??''))return {...result,url:${JSON.stringify(DOC_SCHEME)}+'://file/'+result.opened.split('/').filter(Boolean).map(encodeURIComponent).join('/')};
        return result;
      };
      bridge.neoEnabled=async()=>true;
      bridge.onNeoAct=(fn)=>{act=fn;return()=>{act=null}};
      bridge.neoActResult=(id,result)=>{pending.get(id)?.(result);pending.delete(id)};
      window.neoTestAsk=(name,args={},heard='')=>new Promise((resolve,reject)=>{
        if(!act)return reject(new Error('Neo is not listening'));
        const id=++seq, timeout=setTimeout(()=>{pending.delete(id);reject(new Error(name+' timed out'))},15000);
        pending.set(id,r=>{clearTimeout(timeout);resolve(r)});act({id,name,args,heard});
      });
    }});
    localStorage.setItem('theme','dark');localStorage.setItem('zero.deliveredThrough','1');
    navigator.mediaDevices.getUserMedia=async()=>{throw new Error('No microphone in the test')};
    const play=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(){this.muted=true;return play.call(this)};
  ` });
  await tab.goto(url);
  await tab.until('!!window.neoTestAsk && !!document.querySelector(".list-pane")');
  const askMain = (name, args = {}, heard = '') => {
    if(name==='run_command' && !['reply','view-inbox','flip-view','settings','view-progress','view-snoozed','view-done'].includes(args.id)) return Promise.resolve({ok:false,status:'refused',said:'That command is outside this silent test.'});
    return tab.evaluate(`window.neoTestAsk(${JSON.stringify(name)},${JSON.stringify(args)},${JSON.stringify(heard)})`);
  };
  const screen = async () => ({ ...(await askMain('neo_screen')), text: (await tab.text()).slice(0, 16000),
    saved: seeds.map((s) => { const r = boot.store.readItem('sandbox', s.id); return { title:s.title,id:s.id,answer:r.answer,status:r.status,statusSource:r.wrote?.status?.source,snoozedUntil:r.snoozedUntil }; }),
    images: await tab.evaluate('[...document.images].map(i=>({src:i.currentSrc,loaded:i.complete&&i.naturalWidth>0}))'),
    frames: await tab.evaluate('[...document.querySelectorAll("iframe")].map(f=>({src:f.src,text:f.contentDocument?.body?.innerText?.slice(0,1000)}))'),
    media: await tab.evaluate('[...document.querySelectorAll("audio,video")].map(p=>({src:p.currentSrc,paused:p.paused,error:p.error?.code,time:p.currentTime}))'),
    overlays: await tab.evaluate('[...document.querySelectorAll(".neo-show img")].map(p=>p.src)'), words: native?await native.words():words, errors: [...errors,...tab.errors,...(native?.tab.errors??[])], voiceSeconds:native?native.stats().voiceSeconds:voiceSeconds, connections:native?.stats().connections, calls });
  let chain = Promise.resolve();
  const send = (ev) => { if (live?.readyState === 1) live.send(JSON.stringify(ev)); };
  if(process.argv.includes('--webrtc')){
    native=await neoBrowserSession({boot,mainTab:tab,wsUrl,url,userData:path.join(temp,'neo-data'),getKey,record,onDecision:()=>{if(++calls>600)throw new Error('Decision budget reached');}});
    timer=setInterval(()=>{if(Date.now()-began>35*60_000)void cleanup().then(()=>process.exit(2));},1000);
  }else{
  const source = fs.readFileSync(path.join(root, 'renderer/src/neo/live-driver.ts'), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const { liveDriver } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
  const driver = liveDriver({ send, tool: async()=>({ok:false,said:'Use client delegation'}),
    onWords: (text) => { words = text; lastOutput = Date.now(); }, onUsage: (s) => { voiceSeconds = s; }, onClosed: () => { closed = true; },
    onLine: (l) => { history.push(l); record({line:l}); console.log(JSON.stringify(l)); },
    onDelegate: (id, heard) => {
      const initialScreen = askMain('neo_screen');
      const task = chain.then(async () => {
        const r = await runDecision({ heard, askMain, state, history:history.slice(), initialScreen:await initialScreen,
          decideImpl: (o) => { if (++calls > 600) throw new Error('Decision budget reached'); return decide({...o,getKey}); },
          compose: (o) => composeReply({...o,getKey}) });
        record({decision:{heard,...r}});
        return {say:r.say,context:contextNote((await askMain('describe_open')).said)};
      });
      chain = task.catch(()=>{}); return task;
    },
  });
  live = new WebSocket('wss://api.openai.com/v1/live/sessions', { headers: { Authorization: `Bearer ${key}` } });
  live.onmessage = (e) => {
    const ev = JSON.parse(e.data);
    if (ev.type === 'session.started') started = true;
    if (ev.type === 'error') { errors.push(ev.error); record({error:ev.error}); console.error(JSON.stringify(ev)); }
    void driver.handle(ev).catch((e)=>{errors.push(e.message);record({error:e.message})});
  };
  await new Promise((r,j)=>{const timeout=setTimeout(()=>j(new Error('Live connection timed out')),15000);live.onopen=()=>{clearTimeout(timeout);r()};live.onerror=()=>{clearTimeout(timeout);j(new Error('Live connection failed'))}});
  send({ type:'session.start', session:{...neoSession({context:contextNote((await askMain('describe_open')).said)}),audio:{format:{type:'audio/pcm',rate:24000}}} });
  for (let i=0; i<200&&!started;i++) await wait(100);
  if (!started) throw new Error('Live did not start');
  // Continuous 24 kHz PCM replaces microphone capture. Output bytes are counted, never played.
  const silence = Buffer.alloc(960);
  timer = setInterval(()=>{
    const chunk = input.length ? input.subarray(0,960) : silence;
    input = input.subarray(chunk.length);
    send({type:'session.input_audio.append',audio:chunk.toString('base64')});
    if (Date.now()-began>35*60_000 || voiceSeconds>1800) { void cleanup().then(()=>process.exit(2)); }
  },20);
  }
  control = http.createServer(async(req,res)=>{
    if(req.headers.origin){res.writeHead(403).end();return}
    if(req.url!='/test'||req.method!=='POST'){res.writeHead(404).end();return}
    let ownsBusy=false;
    try {
      let body='';for await(const chunk of req){body+=chunk;if(body.length>16000)throw new Error('Test request is too large')}
      const q=JSON.parse(body);
      if(q.say && (typeof q.say!=='string'||q.say.length>3000))throw new Error('Use a spoken prompt under 3000 characters');
      if(q.say && (native?native.stats().closed:closed))throw new Error('The Live session has ended');
      if(q.screen){res.end(JSON.stringify(await screen()));return}
      if(q.capture){await tab.capture(q.capture);res.end(JSON.stringify({capture:q.capture}));return}
      if(q.stop){if(native){const stats=await native.stop();voiceSeconds=stats.voiceSeconds;closed=stats.closed;}else{send({type:'session.close'});for(let i=0;i<100&&!closed;i++)await wait(100);}const final={voiceSeconds,calls,closed,connections:native?.stats().connections};record({final});res.end(JSON.stringify(final));setTimeout(()=>void cleanup().then(()=>process.exit(0)),100);return}
      if(busy)throw new Error('Another turn is in progress');busy=true;ownsBusy=true;
      const start = history.length, decisionStart=calls;
      if(q.say){
        record({prompt:q.say});
        const speech = await fetch('https://api.openai.com/v1/audio/speech',{method:'POST',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4o-mini-tts',voice:'alloy',input:q.say,response_format:'pcm'})});
        if(!speech.ok)throw new Error(`TTS refused ${speech.status}`);
        const buffer=Buffer.from(await speech.arrayBuffer());
        if(native)await native.speak(buffer);
        else{
        input=buffer;
        const deadline=Date.now()+60000;
        while(input.length&&Date.now()<deadline)await wait(100);
        await wait(2000);
        await chain;
        await wait(3000);
        while(Date.now()<deadline && Date.now()-lastOutput<3000)await wait(200);
        }
      }
      res.end(JSON.stringify({lines:history.slice(start),decisions:calls-decisionStart,...await screen()}));
    }catch(e){res.writeHead(500).end(JSON.stringify({error:e.message}));}finally{if(ownsBusy)busy=false}
  });
  await new Promise((r,j)=>{control.once('error',j);control.listen(Number(arg('--port',7341)),'127.0.0.1',r)});
  record({started:true,seeds:seeds.map(({title,id,source})=>({title,id,source}))});
  console.log(JSON.stringify({ready:true,port:control.address().port,appUrl:url,chrome:wsUrl,targetId:tab.targetId,journal,seeds:seeds.map(({title,id})=>({title,id}))}));
} catch (e) { console.error(e); await cleanup(); process.exit(1); }
