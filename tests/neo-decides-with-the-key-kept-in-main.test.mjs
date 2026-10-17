// The Decisions API call behind Neo's trial run (plans/neo-decisions.md).
// Measured live on 2026-10-16: POST /v1/decisions refused a 300-choice
// question ("maximum length 255"). The key is read in main for the call and
// never leaves it, like the GPT-Live session's.
import { describe, expect, it, vi } from 'vitest';
import { decide } from '../main/neo/decide.mjs';

const KEY = 'sk-test-not-a-real-key-0123456789';
const options = [{ value: 'later', description: 'Put the open thread off' }, { value: 'none', description: 'Nothing to do' }];
const answer = (choice, confidence) => ({ ok: true, json: async () => ({ answers: [{ type: 'choice', name: 'action', choice, confidence, probabilities: [{ value: choice, probability: confidence }, { value: 'none', probability: 1 - confidence }] }] }) });

describe('deciding', () => {
  it('asks one choice question with the options and her words, and returns the pick', async () => {
    const fetchImpl = vi.fn(async () => answer('later', 0.97));
    const r = await decide({ input: 'Screen...\nShe said: "snooze it"', options, getKey: async () => KEY, fetchImpl });
    expect(r).toMatchObject({ choice: 'later', confidence: 0.97 });
    expect(typeof r.ms).toBe('number');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/decisions');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('gpt-6-luna');
    expect(body.questions).toHaveLength(1);
    expect(body.questions[0].choices).toEqual(options);
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
  });

  it('keeps the two next most likely, for asking "A or B?"', async () => {
    const r = await decide({ input: 'x', options, getKey: async () => KEY, fetchImpl: async () => answer('later', 0.55) });
    expect(r.runnersUp.map((p) => p.value)).toEqual(['none']);
  });

  it('refuses more choices than the API takes, before calling it', async () => {
    const fetchImpl = vi.fn();
    const many = Array.from({ length: 256 }, (_, i) => ({ value: `v${i}`, description: 'x' }));
    await expect(decide({ input: 'x', options: many, getKey: async () => KEY, fetchImpl })).rejects.toThrow(/255/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('a refusal or a failed call is an error that never shows the key', async () => {
    const refused = async () => ({ ok: true, json: async () => ({ answers: [{ type: 'refusal', name: 'action' }] }) });
    await expect(decide({ input: 'x', options, getKey: async () => KEY, fetchImpl: refused })).rejects.toThrow(/refused/);
    const failed = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: `bad key ${KEY}` } }) });
    const err = await decide({ input: 'x', options, getKey: async () => KEY, fetchImpl: failed }).catch((e) => e);
    expect(err.message).toMatch(/401/);
    expect(err.message).not.toContain(KEY);
  });
});
