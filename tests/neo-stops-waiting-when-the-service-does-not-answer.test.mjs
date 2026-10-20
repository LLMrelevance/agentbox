// Long-session audit, 2026-10-17: all three Neo requests lacked a network
// deadline. A request that never resolved could leave every later turn waiting.
import { expect, it } from 'vitest';
import { decide, composeReply } from '../main/neo/decide.mjs';
import { startLive } from '../main/neo/live.mjs';

const signals = [];
const stalled = (_url, { signal }) => new Promise((_resolve, reject) => {
  signals.push(signal);
  if (!signal) return reject(new Error('No request deadline'));
  signal.addEventListener('abort', () => reject(new Error('timed out')), { once: true });
});
const common = { getKey: async () => 'test-key', fetchImpl: stalled, timeoutMs: 5 };

it('a decision stops waiting and reports that it could not connect', async () => {
  await expect(decide({ ...common, input: 'next', options: [{ value: 'next', description: 'Next' }] })).rejects.toThrow(/Could not reach OpenAI/);
  expect(signals.at(-1)).toBeInstanceOf(AbortSignal);
});
it('writing a reply stops waiting and reports failure', async () => {
  await expect(composeReply({ ...common, heard: 'Tell it to revise the heading.' })).rejects.toThrow(/Could not reach OpenAI/);
  expect(signals.at(-1)).toBeInstanceOf(AbortSignal);
});
it('starting a voice session stops waiting and reports failure', async () => {
  await expect(startLive({ ...common, sdp: 'v=0', session: {} })).rejects.toThrow(/Could not reach OpenAI/);
  expect(signals.at(-1)).toBeInstanceOf(AbortSignal);
});
