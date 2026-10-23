// Test-only transport for the real Neo renderer and main controller, with generated microphone input.
// Only Electron's window/IPC transport is replaced; all audio stays in this Chrome.
import fs from 'node:fs';
import path from 'node:path';
import { createNeo } from '../../main/neo/index.mjs';
import { startLive } from '../../main/neo/live.mjs';
import { decide, composeReply } from '../../main/neo/decide.mjs';
import { connect } from '../../.claude/skills/verify-agentbox/scripts/cdp.mjs';

export async function neoBrowserSession({ boot, mainTab, wsUrl, url, userData, getKey, record, onDecision, onLine = () => {} }) {
  fs.mkdirSync(userData,{recursive:true});
  const handlers = new Map(), listeners = new Map();
  let loaded, closed = false, renewals = 0;
  const send = (channel,payload) => boot.window.webContents.send(channel,payload);
  const contents = {send,once:(event,fn)=>{if(event==='did-finish-load')loaded=fn;}};
  class Window {
    constructor(){this.webContents=contents;}
    setAlwaysOnTop(){} setVisibleOnAllWorkspaces(){} setIgnoreMouseEvents(){}
    setBounds(bounds){this.bounds=bounds;} getBounds(){return this.bounds;}
    on(){} showInactive(){} hide(){} moveTop(){} isDestroyed(){return false;}
  }
  const mainWindow = {isDestroyed:()=>false,isFocused:()=>true,getContentBounds:()=>({x:0,y:0,width:1440,height:900}),on(){},webContents:{send:(channel,payload)=>{
    if(channel!=='neo:act'){send(channel,payload);return}
    const {id,name,args,heard}=payload;
    record({act:{name,args,heard}});
    const run = name==='run_command'&&!['reply','view-inbox','flip-view','settings','view-progress','view-snoozed','view-done'].includes(args?.id)
      ? Promise.resolve({ok:false,status:'refused',said:'That command is outside this silent test.'})
      : mainTab.evaluate(`window.neoTestAsk(${JSON.stringify(name)},${JSON.stringify(args)},${JSON.stringify(heard)})`);
    void run.catch(error=>({ok:false,status:'failed',said:error.message})).then(result=>{
      record({actResult:{name,status:result?.status,ok:result?.ok,said:result?.said?.slice(0,1200)}});
      listeners.get('neo:act-result')?.({sender:mainWindow.webContents},{id,result});
    });
  }}};
  const fromNeo = {sender:contents};
  const controller=createNeo({
    app:{on(){}},BrowserWindow:Window,ipcMain:{handle:(ch,fn)=>handlers.set(ch,fn),on:(ch,fn)=>listeners.set(ch,fn)},
    screen:{getCursorScreenPoint:()=>({x:0,y:0}),getDisplayNearestPoint:()=>({workArea:{x:0,y:0,width:1440,height:900}})},
    powerMonitor:{on(){}},systemPreferences:{getMediaAccessStatus:()=>'granted'},
    session:{fromPartition:()=>({setPermissionRequestHandler(){},setPermissionCheckHandler(){}})},globalShortcut:{register:()=>true,unregister(){}},
    mainWindow,preload:'unused-in-headless-test',load(){},userData,config:{alphaNeo:true},listen:()=>({stop(){}}),platform:'darwin',
    startLiveImpl:(o)=>startLive({...o,getKey}),
    decideImpl:async(o)=>{onDecision();const r=await decide({...o,getKey});record({decision:r});return r;},composeImpl:(o)=>composeReply({...o,getKey}),
  });
  boot.channels.set('neo:test-invoke',async(_e,{channel,payload,event}={})=>{
    if(!channel?.startsWith('neo:'))throw new Error('Not a Neo channel');
    if(event){
      listeners.get(channel)?.(fromNeo,payload);
      if(channel==='neo:log'){record({line:payload});onLine(payload);}
      if(channel==='neo:closed')closed=true;
      if(channel==='neo:test-wire')record({wire:payload});
      return null;
    }
    const handler=handlers.get(channel);if(!handler)throw new Error('Unknown Neo request');
    const result=await handler(fromNeo,payload);
    if(channel==='neo:activate-live'&&result?.ok){renewals++;record({connection:renewals});}
    if(channel==='neo:audit'&&result)record({missingDelegation:payload.heard});
    return result;
  });
  const target=await mainTab.call('Target.createTarget',{url:'about:blank',newWindow:true});
  const tab=await connect(wsUrl,{targetId:target.targetId});
  await tab.call('Page.addScriptToEvaluateOnNewDocument',{source:`
    const listeners=new Map();
    const listen=(name)=>(fn)=>{listeners.set(name,fn);if(name==='neo:wake')window.neoTestReady=true;return()=>listeners.delete(name)};
    window.neoTestBusy=0;window.neoTestWordsAt=Date.now();window.neoTestChannels=[];
    const rpc=async(channel,payload,event=false)=>{
      const tracked=/neo:(decide|tool|audit|start-live|activate-live)/.test(channel);if(tracked)window.neoTestBusy++;
      try{const r=await fetch('/api/neo%3Atest-invoke',{method:'POST',headers:{'x-agentbox-token':'neo-test-local-only','Content-Type':'application/json'},body:JSON.stringify({channel,payload,event})});if(!r.ok)throw new Error('Neo bridge '+r.status);const value=await r.json();if(channel==='neo:activate-live'&&value?.ok)window.neoTestActivated=(window.neoTestActivated??0)+1;return value}finally{if(tracked)window.neoTestBusy--}
    };
    const events=new EventSource('/events?token=neo-test-local-only');
    events.onopen=()=>{window.neoTestEventsReady=true};events.onmessage=e=>{const m=JSON.parse(e.data);listeners.get(m.channel)?.(...m.args)};
    window.neo={onWake:listen('neo:wake'),onSleep:listen('neo:sleep'),onResting:listen('neo:resting'),onNoMic:listen('neo:no-mic'),onNotice:listen('neo:notice'),onSide:listen('neo:side'),
      startLive:(sdp,outside,transportId)=>rpc('neo:start-live',{sdp,outside,transportId}),activateLive:transportId=>rpc('neo:activate-live',{transportId}),
      tool:(callId,name,args,heard,transportId)=>rpc('neo:tool',{callId,name,args,heard,transportId}),decide:(heard,transportId)=>rpc('neo:decide',{heard,transportId}),audit:(heard,transportId)=>rpc('neo:audit',{heard,transportId}),
      follow:said=>void rpc('neo:follow',{said},true),drag:(phase,dx,dy)=>void rpc('neo:drag',{phase,dx,dy},true),pace:value=>rpc('neo:pace',value),captions:value=>rpc('neo:captions',value),
      usage:(seconds,transportId)=>void rpc('neo:usage',{seconds,transportId},true),ending:()=>void rpc('neo:ending',null,true),closed:()=>void rpc('neo:closed',null,true),
      log:line=>void rpc('neo:log',line,true),clickable:on=>void rpc('neo:clickable',on,true),allowMic:()=>Promise.resolve('granted')};
    let ctx,destination;
    const NativePeer=RTCPeerConnection;
    window.RTCPeerConnection=new Proxy(NativePeer,{construct(Target,args){const peer=new Target(...args),create=peer.createDataChannel.bind(peer);peer.createDataChannel=(...args)=>{const channel=create(...args);window.neoTestChannels.push(channel);channel.addEventListener('message',e=>{const event=JSON.parse(String(e.data));if(!/audio.delta|transcript.delta|usage.updated/.test(event.type))void rpc('neo:test-wire',{type:event.type,delegation:event.delegation,error:event.error,reason:event.reason,usage:event.usage},true)});return channel};return peer}});
    navigator.mediaDevices.getUserMedia=async()=>{ctx=new AudioContext({sampleRate:24000});await ctx.resume();destination=ctx.createMediaStreamDestination();const silence=ctx.createConstantSource();silence.offset.value=0;silence.connect(destination);silence.start();window.neoTestMic=true;window.neoTestMicState=()=>({state:ctx.state,time:ctx.currentTime,tracks:destination.stream.getTracks().map(t=>({enabled:t.enabled,muted:t.muted,state:t.readyState}))});return destination.stream};
    window.neoTestSpeak=async(base64)=>{
      if(!destination)throw new Error('Generated microphone is not ready');
      const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));const pcm=new Int16Array(bytes.buffer);const buffer=ctx.createBuffer(1,pcm.length,24000);const samples=buffer.getChannelData(0);
      for(let i=0;i<pcm.length;i++)samples[i]=pcm[i]/32768;
      const source=ctx.createBufferSource();source.buffer=buffer;source.connect(destination);await ctx.resume();
      return new Promise(resolve=>{source.onended=()=>{source.disconnect();resolve(true)};source.start()});
    };
    addEventListener('DOMContentLoaded',()=>new MutationObserver(()=>{window.neoTestWordsAt=Date.now()}).observe(document.getElementById('words'),{childList:true,characterData:true,subtree:true}));
  `});
  const wake=controller.wake('silent-test');
  await tab.goto(new URL('/neo.html',url).href);
  await tab.until('window.neoTestReady && window.neoTestEventsReady');
  loaded?.();await wake;
  await tab.until('window.neoTestMic && document.getElementById("neo").classList.contains("awake")');
  await tab.until('window.neoTestActivated>0',{ms:45000});
  await mainTab.call('Page.bringToFront');
  if(await mainTab.evaluate('document.visibilityState')!=='visible'||await tab.evaluate('document.visibilityState')!=='visible')throw new Error('The app and Neo must both have visible test windows.');
  const stats=()=>{
    let voiceSeconds=0;try{voiceSeconds=JSON.parse(fs.readFileSync(path.join(userData,'neo','usage.json'),'utf8')).seconds??0}catch{}
    return {voiceSeconds,connections:renewals,closed};
  };
  return {tab,stats,
    speak:async(buffer)=>{
      await tab.evaluate(`window.neoTestSpeak(${JSON.stringify(buffer.toString('base64'))})`);
      await tab.wait(10_000);
      await tab.until('window.neoTestBusy===0 && Date.now()-window.neoTestWordsAt>4000 && !/^one sec[.!]?$/i.test(document.getElementById("words").textContent.trim())',{ms:60000});
    },
    words:()=>tab.evaluate('document.getElementById("words").textContent'),
    stop:async()=>{send('neo:sleep',{reason:'test'});for(let i=0;i<100&&!closed;i++)await tab.wait(100);return stats();},
    close:()=>tab.detach(),
  };
}
