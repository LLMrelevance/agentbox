import { it, expect, vi, afterEach } from 'vitest';
import { controlMedia } from '../renderer/src/neo/media.ts';
afterEach(()=>vi.useRealTimers());

it('reports a rejected play request rather than announcing playback',async()=>{
  const player={play:vi.fn(async()=>{throw new Error('Unsupported format')}),pause:vi.fn()};
  await expect(controlMedia(player,'play')).rejects.toThrow('Unsupported format');
  expect(player.pause).toHaveBeenCalledOnce();
});

it('stops an indefinitely pending play request before the app action times out',async()=>{
  vi.useFakeTimers();
  const player={play:vi.fn(()=>new Promise(()=>{})),pause:vi.fn()};
  const result=expect(controlMedia(player,'play')).rejects.toThrow('did not start');
  await vi.advanceTimersByTimeAsync(5001);await result;
  expect(player.pause).toHaveBeenCalledOnce();
});

it('does not attempt playback for a media element already reporting failure',async()=>{
  const player={error:{code:4},play:vi.fn(),pause:vi.fn()};
  await expect(controlMedia(player,'play')).rejects.toThrow('could not be played');
  expect(player.play).not.toHaveBeenCalled();
});
