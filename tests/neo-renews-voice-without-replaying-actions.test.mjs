import { describe, it, expect, vi, afterEach } from 'vitest';
import { liveDriver, liveChunks } from '../renderer/src/neo/live-driver.ts';
import { canRenew, voiceConnection, RENEW_AFTER_MS, QUIET_MS } from '../renderer/src/neo/connection.ts';
import { neoSession, contextNote } from '../shared/neo-tools.mjs';

afterEach(()=>vi.useRealTimers());
const delegated=(id,offset_ms)=>({type:'session.delegation.created',offset_ms,delegation:{id,target:'client'}});
function driver(extra={}) {
  const sent=[], onDelegate=vi.fn(async()=>({say:'Done.'}));
  return {sent,onDelegate,d:liveDriver({send:e=>sent.push(e),tool:vi.fn(),onWords:vi.fn(),onUsage:vi.fn(),onClosed:vi.fn(),onDelegate,...extra})};
}

describe('long conversation boundaries',()=>{
  it('binds a handoff to its transcript even when the next utterance arrives during settlement',async()=>{
    const t=driver();
    await t.d.handle({type:'session.input_transcript.delta',delta:'Close this.',start_ms:100,end_ms:700});
    const first=t.d.handle(delegated('first',900));
    await t.d.handle({type:'session.input_transcript.delta',delta:'Open billing.',start_ms:1500,end_ms:2100});
    await first;
    expect(t.onDelegate).toHaveBeenCalledWith('first','Close this.');
    await t.d.handle(delegated('second',2300));
    expect(t.onDelegate).toHaveBeenLastCalledWith('second','Open billing.');
  });

  it('does not discard a late prefix continuation when Neo has begun speaking',async()=>{
    const t=driver();
    await t.d.handle({type:'session.input_transcript.delta',delta:'Tell the agent',start_ms:100,end_ms:600});
    await t.d.handle({type:'session.output_transcript.delta',delta:'One sec.'});
    await t.d.handle({type:'session.input_transcript.delta',delta:' to check resizing.',start_ms:650,end_ms:1500});
    await t.d.handle(delegated('one',1800));
    expect(t.onDelegate).toHaveBeenCalledWith('one','Tell the agent to check resizing.');
  });

  it('executes once if Live delegates the same utterance under two ids',async()=>{
    const t=driver();
    await t.d.handle({type:'session.input_transcript.delta',delta:'Next.',start_ms:100,end_ms:500});
    await Promise.all([t.d.handle(delegated('one',600)),t.d.handle(delegated('two',600))]);
    expect(t.onDelegate).toHaveBeenCalledOnce();
  });

  it('does not treat a replacement-character noise transcript as a new person interrupting Neo',async()=>{
    const words=vi.fn(),t=driver({onWords:words});
    await t.d.handle({type:'session.input_transcript.delta',delta:'Explain this.',start_ms:100,end_ms:500});
    await t.d.handle({type:'session.output_transcript.delta',delta:'This is '});
    await t.d.handle({type:'session.input_transcript.delta',delta:'�',start_ms:1000,end_ms:1001});
    await t.d.handle({type:'session.output_transcript.delta',delta:'the answer.'});
    expect(words).toHaveBeenLastCalledWith('This is the answer.');
  });

  it('keeps a space arriving between transcript words',async()=>{
    const t=driver();
    for(const delta of ['Open',' ','Billing'])await t.d.handle({type:'session.input_transcript.delta',delta});
    await t.d.handle(delegated('one'));
    expect(t.onDelegate).toHaveBeenCalledWith('one','Open Billing');
  });

  it('detects an undelegated request without executing it and blocks a late handoff',async()=>{
    vi.useFakeTimers();
    const recovery=vi.fn(), audit=vi.fn(async()=>true);
    const t=driver({onUndelegated:audit,onRecovery:recovery});
    await t.d.handle({type:'session.input_transcript.delta',delta:'Send this.',start_ms:100,end_ms:500});
    await t.d.handle({type:'session.output_transcript.delta',delta:'Sent.'});
    await vi.advanceTimersByTimeAsync(3001);
    expect(audit).toHaveBeenCalledWith('Send this.');
    expect(t.onDelegate).not.toHaveBeenCalled();
    expect(recovery).toHaveBeenCalledWith(true);
    await t.d.handle(delegated('late',600));
    expect(t.onDelegate).not.toHaveBeenCalled();
    expect(t.sent.at(-1).content).toMatch(/not completed/);
    t.d.dispose();
  });

  it('does not turn a follow-up answer into an app action or a reconnect',async()=>{
    vi.useFakeTimers();
    const recovery=vi.fn(), t=driver({onUndelegated:async()=>false,onRecovery:recovery});
    await t.d.handle({type:'session.input_transcript.delta',delta:'Why?',start_ms:100,end_ms:500});
    await t.d.handle({type:'session.output_transcript.delta',delta:'To keep it simple.'});
    await vi.advanceTimersByTimeAsync(3001);
    expect(recovery).not.toHaveBeenCalled();expect(t.onDelegate).not.toHaveBeenCalled();t.d.dispose();
  });

  it('drops a slow audit after new speech or disposal',async()=>{
    vi.useFakeTimers();
    let answer;const recovery=vi.fn(), t=driver({onUndelegated:()=>new Promise(r=>answer=r),onRecovery:recovery});
    await t.d.handle({type:'session.input_transcript.delta',delta:'Open billing.',start_ms:100,end_ms:500});
    await t.d.handle({type:'session.output_transcript.delta',delta:'Okay.'});
    await vi.advanceTimersByTimeAsync(3001);
    await t.d.handle({type:'session.input_transcript.delta',delta:'Actually do not.',start_ms:5000,end_ms:5500});
    t.d.dispose();answer(true);await Promise.resolve();await Promise.resolve();
    expect(recovery).not.toHaveBeenCalled();expect(t.onDelegate).not.toHaveBeenCalled();
  });

  it('bounds every multilingual append without losing any text',()=>{
    const text='Confirmé. 🦋 请检查附件。 '.repeat(200);
    const chunks=liveChunks(text);
    expect(chunks.join('')).toBe(text);
    expect(chunks.every(c=>Buffer.byteLength(c)<=450)).toBe(true);
  });

  it('accepts final cumulative usage from a retired connection without executing late work',async()=>{
    const usage=vi.fn(),t=driver({onUsage:usage});t.d.retire();
    await t.d.handle(delegated('late',500));
    await t.d.handle({type:'session.usage.updated',usage:{seconds:480}});
    await t.d.handle({type:'session.closed',usage:{seconds:483}});
    expect(t.onDelegate).not.toHaveBeenCalled();expect(usage.mock.calls).toEqual([[480],[483]]);
  });

  it('bounds startup context and completed history even for multilingual conversations',()=>{
    const session=neoSession({context:contextNote('🦋请检查附件。'.repeat(1000)),history:Array.from({length:20},(_,i)=>({who:i%2?'neo':'you',text:'🦋请检查附件。'.repeat(1000)}))});
    const text=session.instructions+session.input.flatMap(m=>m.content.map(c=>c.text)).join('');
    expect(Buffer.byteLength(text)).toBeLessThan(9000);
    expect(session.input).toHaveLength(1);
    expect(session.input[0].role).toBe('developer');
  });
});

function connectionFake({start=async()=>({ok:true,sdp:'answer'}),open=true,failTrack=false}={}) {
  const original={enabled:true,stop:vi.fn()},cloned={enabled:true,stop:vi.fn()};
  const stream={getTracks:()=>[original],clone:()=>({getTracks:()=>[cloned]})};
  const channel=Object.assign(new EventTarget(),{readyState:'connecting',close:vi.fn(),send:vi.fn()});
  const peer=Object.assign(new EventTarget(),{iceGatheringState:'complete',localDescription:{sdp:'offer'},createDataChannel:()=>channel,addTrack:vi.fn(()=>{if(failTrack)throw new Error('Cannot add input')}),
    createOffer:async()=>({type:'offer',sdp:'offer'}),setLocalDescription:async()=>{},setRemoteDescription:async()=>{if(open){channel.readyState='open';channel.dispatchEvent(new Event('open'))}},close:vi.fn()});
  const player={pause:vi.fn(),play:vi.fn(async()=>{}),srcObject:null};
  const dispose=vi.fn();
  let c,error;
  try { c=voiceConnection({stream,outside:false,start,driverFor:()=>({handle:async()=>{},dispose}),onTrack:vi.fn(),onClosed:vi.fn(),makePeer:()=>peer,makePlayer:()=>player,id:'test'}); } catch(e) { error=e; }
  return {c,error,original,cloned,channel,peer,player,dispose};
}

describe('renewing a voice transport',()=>{
  it('requires an old connection, a quiet boundary and no outstanding work',()=>{
    const now=RENEW_AFTER_MS+QUIET_MS;
    expect(canRenew({born:0,activity:now-QUIET_MS,busy:0,now})).toBe(true);
    expect(canRenew({born:0,activity:now-1,busy:0,now})).toBe(false);
    expect(canRenew({born:0,activity:0,busy:1,now})).toBe(false);
    expect(canRenew({born:now-100,activity:0,busy:0,now})).toBe(false);
  });

  it('prepares silently and keeps the microphone disabled until activation',async()=>{
    const t=connectionFake();await t.c.ready;
    expect(t.cloned.enabled).toBe(false);expect(t.original.enabled).toBe(true);expect(t.player.muted).toBe(true);
    t.c.activate();expect(t.cloned.enabled).toBe(true);expect(t.player.muted).toBe(false);
    t.c.close();expect(t.cloned.stop).toHaveBeenCalledOnce();expect(t.original.stop).not.toHaveBeenCalled();expect(t.dispose).toHaveBeenCalledOnce();
  });

  it('closes its tracks and peer on startup failure',async()=>{
    const t=connectionFake({start:async()=>({ok:false,error:'Network unavailable'})});
    await expect(t.c.ready).rejects.toThrow('Network unavailable');
    expect(t.cloned.stop).toHaveBeenCalledOnce();expect(t.peer.close).toHaveBeenCalledOnce();expect(t.original.stop).not.toHaveBeenCalled();
  });

  it('releases acquired resources when adding the cloned input throws synchronously',()=>{
    const t=connectionFake({failTrack:true});
    expect(t.error?.message).toBe('Cannot add input');expect(t.c).toBeUndefined();
    expect(t.cloned.stop).toHaveBeenCalledOnce();expect(t.original.stop).not.toHaveBeenCalled();
    expect(t.peer.close).toHaveBeenCalledOnce();expect(t.channel.close).toHaveBeenCalledOnce();expect(t.dispose).toHaveBeenCalledOnce();
  });

  it('stops the transmitted microphone immediately without waiting for the service to close',async()=>{
    const t=connectionFake();await t.c.ready;t.c.activate();
    t.c.stopInput();
    expect(t.cloned.stop).toHaveBeenCalledOnce();expect(t.channel.close).not.toHaveBeenCalled();
    expect(t.original.stop).not.toHaveBeenCalled();
  });

  it('drains a retired transport through the terminal event before closing its peer',async()=>{
    const t=connectionFake();await t.c.ready;
    const retired=t.c.retire();
    expect(t.cloned.stop).toHaveBeenCalledOnce();expect(t.channel.send).toHaveBeenCalledWith(JSON.stringify({type:'session.close'}));
    expect(t.peer.close).not.toHaveBeenCalled();
    t.channel.onmessage({data:JSON.stringify({type:'session.closed',usage:{seconds:483}})});
    await retired;expect(t.peer.close).toHaveBeenCalledOnce();
  });

  it('cancels a connection still waiting on the service without retaining a microphone track',async()=>{
    let answer;const t=connectionFake({start:()=>new Promise(r=>answer=r)});
    for(let i=0;i<5&&!answer;i++)await Promise.resolve();
    t.c.close();expect(t.cloned.stop).toHaveBeenCalledOnce();
    answer({ok:true,sdp:'late answer'});await expect(t.c.ready).rejects.toThrow('cancelled');
    expect(t.cloned.enabled).toBe(false);expect(t.original.stop).not.toHaveBeenCalled();
  });
});
