// Starting a GPT-Live session for Neo. The OpenAI key is read from the
// Keychain for the one request that needs it and dropped: it never goes into
// process.env (workers inherit that), never to a page, never into a log.
import { execFile } from 'node:child_process';

export const KEYCHAIN_SERVICE = 'OPENAI_API_KEY';
const LIVE_URL = 'https://api.openai.com/v1/live/sessions';
const MAX_SDP = 64 * 1024;

export function readKey({ run = execFile } = {}) {
  return new Promise((resolve, reject) => {
    run('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'], { encoding: 'utf8', timeout: 10_000 }, (err, out) => {
      if (err || !String(out ?? '').trim()) reject(new Error(`No OpenAI key in the Keychain under "${KEYCHAIN_SERVICE}".`));
      else resolve(String(out).trim());
    });
  });
}

// Trades the page's WebRTC offer for OpenAI's answer. The page can only hand
// over an offer; the endpoint, the model and the whole session are fixed here.
export async function startLive({ sdp, session, getKey = readKey, fetchImpl = fetch, timeoutMs = 30_000 }) {
  if (typeof sdp !== 'string' || !sdp.startsWith('v=') || sdp.length > MAX_SDP) throw new Error('Not a WebRTC offer.');
  const key = await getKey();
  let res;
  try {
    res = await fetchImpl(LIVE_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session, transport: { type: 'webrtc', sdp } }),
    });
  } catch {
    throw new Error('Could not reach OpenAI.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI refused the session (${res.status}${body?.error?.code ? `, ${body.error.code}` : ''}).`);
  const answer = body?.transport?.sdp;
  if (typeof answer !== 'string') throw new Error('OpenAI sent no answer.');
  return { sdp: answer, id: body?.session?.id ?? null };
}
