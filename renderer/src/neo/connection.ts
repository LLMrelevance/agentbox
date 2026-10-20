type Channel = RTCDataChannel;
type Driver = { handle(event: unknown): Promise<void>; retire?(): void; dispose?(): void; checkpoint?(): void };

export const RENEW_AFTER_MS = 8 * 60_000;
export const QUIET_MS = 5000;

export function canRenew({ born, activity, busy, now = Date.now(), forced = false }: { born: number; activity: number; busy: number; now?: number; forced?: boolean }) {
  return busy === 0 && now - activity >= QUIET_MS && (forced || now - born >= RENEW_AFTER_MS);
}

export function voiceConnection({ stream, outside, start, driverFor, onTrack, onClosed, makePeer = () => new RTCPeerConnection(), makePlayer = () => new Audio(), id = crypto.randomUUID() }: {
  stream: MediaStream; outside: boolean;
  start(sdp: string, outside: boolean, transportId: string): Promise<{ ok: boolean; sdp?: string; error?: string }>;
  driverFor(channel: Channel, id: string): Driver;
  onTrack(channel: Channel, stream: MediaStream): void;
  onClosed(channel: Channel): void;
  makePeer?(): RTCPeerConnection; makePlayer?(): HTMLAudioElement; id?: string;
}) {
  const input = stream.clone();
  input.getTracks().forEach((track) => { track.enabled = false; });
  const stopInput = () => { input.getTracks().forEach((track) => track.stop()); };
  let peer!: RTCPeerConnection, player!: HTMLAudioElement, channel!: Channel, driver!: Driver;
  try {
    peer = makePeer(); player = makePlayer();
    player.autoplay = true; player.muted = true;
    channel = peer.createDataChannel('oai-events');
    driver = driverFor(channel, id);
    input.getTracks().forEach((track) => peer.addTrack(track, input));
  } catch (error) {
    for (const release of [stopInput, () => driver?.dispose?.(), () => player?.pause(), () => channel?.close(), () => peer?.close()]) {
      try { release(); } catch {}
    }
    throw error;
  }
  let remote: MediaStream | null = null, closed = false, retiring = false;
  let drainTimer: ReturnType<typeof setTimeout> | null = null;
  let drained: (() => void) | null = null;
  let cancelWait: (() => void) | null = null;
  channel.onmessage = (e) => {
    if (closed) return;
    let event: {type?: string};
    try { event = JSON.parse(String(e.data)); } catch { return; }
    void driver.handle(event).finally(() => { if (retiring && event.type === 'session.closed') close(); });
  };
  channel.onclose = () => { if (closed) return; if (retiring) close(); else onClosed(channel); };
  peer.ontrack = (e) => { if (closed) return; remote = e.streams[0]; player.srcObject = remote; onTrack(channel, remote); };
  const check = () => { if (closed) throw new Error('Voice connection was cancelled.'); };
  const close = () => {
    if (closed) return;
    closed = true;
    if (drainTimer) clearTimeout(drainTimer);
    cancelWait?.();
    driver.dispose?.();
    stopInput();
    player.pause(); player.srcObject = null;
    channel.close(); peer.close();
    drained?.();
  };
  const ready = (async () => {
    try {
      await peer.setLocalDescription(await peer.createOffer()); check();
      if (peer.iceGatheringState !== 'complete') await new Promise<void>((resolve) => {
        const finish = () => { clearTimeout(timer); peer.removeEventListener('icegatheringstatechange', changed); cancelWait = null; resolve(); };
        const changed = () => { if (peer.iceGatheringState === 'complete') finish(); };
        const timer = setTimeout(finish, 3000);
        cancelWait = finish;
        peer.addEventListener('icegatheringstatechange', changed);
      });
      check();
      const answer = await start(peer.localDescription!.sdp, outside, id); check();
      if (!answer.ok || !answer.sdp) throw new Error(answer.error ?? 'Could not start the voice connection.');
      await peer.setRemoteDescription({type:'answer',sdp:answer.sdp}); check();
      if (channel.readyState !== 'open') await new Promise<void>((resolve, reject) => {
        const finish = (error?: Error) => { clearTimeout(timer); channel.removeEventListener('open', opened); channel.removeEventListener('close', cancelled); channel.removeEventListener('error', cancelled); cancelWait = null; error ? reject(error) : resolve(); };
        const opened = () => finish(), cancelled = () => finish(new Error('The voice connection closed before it opened.'));
        const timer = setTimeout(() => finish(new Error('The voice connection did not open.')), 10_000);
        cancelWait = cancelled;
        channel.addEventListener('open', opened); channel.addEventListener('close', cancelled); channel.addEventListener('error', cancelled);
      });
      check();
    } catch (error) { close(); throw error; }
  })();
  return { id, peer, channel, player, driver, ready, close, stopInput, born: Date.now(),
    retire() {
      stopInput(); player.muted = true; player.pause(); driver.retire?.();
      if (closed) return Promise.resolve();
      retiring = true;
      return new Promise<void>((resolve) => {
        drained = resolve;
        if (channel.readyState !== 'open') { close(); return; }
        drainTimer = setTimeout(close, 15_000);
        try { channel.send(JSON.stringify({type:'session.close'})); } catch { close(); }
      });
    },
    activate() { check(); input.getTracks().forEach((track) => { track.enabled = true; }); player.muted = false; if (remote) { void player.play(); onTrack(channel, remote); } },
  };
}
