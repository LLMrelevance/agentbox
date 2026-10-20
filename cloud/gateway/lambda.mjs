// THE CLOUD SERVER IN LAMBDA. One function answers two kinds of event: HTTP
// from its function URL (a Mac), and S3's notice that a run's done.json
// landed. scripts/cloud-gateway-setup.mjs bundles this file and deploys it.
//
// Links are signed with a separate IAM user's key (SIGNER_*), not the
// function's role: a link lasts no longer than the credentials that signed
// it, and a role's last hours, where a run's results link must outlive the
// run's 8.
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { awsTransport, awsStorage } from '../../main/cloud/aws.mjs';
import { createGateway } from './gateway.mjs';

const TIMEOUT_MS = 20_000;
const http = { requestTimeout: TIMEOUT_MS, connectionTimeout: 5_000, throwOnRequestTimeout: true };

/** The ledger's objects in the bucket, with S3's conditional writes. */
export function bucketObjects({ region, bucket, client = new S3Client({ region, requestHandler: http }) }) {
  const conflicted = (err) => [409, 412].includes(err?.$metadata?.httpStatusCode) || /PreconditionFailed|ConditionalRequestConflict/.test(err?.name || '');
  return {
    async get(key) {
      try {
        const o = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return { body: await o.Body.transformToString(), etag: o.ETag };
      } catch (err) {
        if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) return null;
        throw err;
      }
    },
    async put(key, body, { ifMatch, ifNoneMatch } = {}) {
      try {
        await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'application/json', ...(ifMatch ? { IfMatch: ifMatch } : {}), ...(ifNoneMatch ? { IfNoneMatch: ifNoneMatch } : {}) }));
      } catch (err) {
        if (conflicted(err)) throw Object.assign(new Error('changed meanwhile'), { conflict: true });
        throw err;
      }
    },
    async del(key) { await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); },
  };
}

/** Who a database session belongs to, asked of the database itself. */
export function supabaseWhoIs({ url, anonKey, fetchImpl = fetch }) {
  return async (token) => {
    const res = await fetchImpl(`${url.replace(/\/+$/, '')}/auth/v1/user`, { headers: { apikey: anonKey, authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const u = await res.json();
    return u?.id ? { id: u.id, email: u.email ?? null } : null;
  };
}

export function gatewayFromEnv(env = process.env) {
  const need = ['REGION', 'BUCKET', 'RUNTIME_ARN', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SIGNER_KEY_ID', 'SIGNER_SECRET'];
  const missing = need.filter((k) => !env[k]);
  if (missing.length) throw new Error(`the cloud server is missing ${missing.join(', ')}`);
  const region = env.REGION;
  const bucket = env.BUCKET;
  const transport = awsTransport({ region, runtimeArn: env.RUNTIME_ARN });
  const signer = awsStorage({ region, bucket, credentials: { accessKeyId: env.SIGNER_KEY_ID, secretAccessKey: env.SIGNER_SECRET } });
  const objects = bucketObjects({ region, bucket });
  return createGateway({
    agentcore: transport,
    links: { get: signer.getUrl, put: signer.putUrl, head: signer.headUrl },
    removeObject: (key) => objects.del(key),
    objects,
    whoIs: supabaseWhoIs({ url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY }),
    log: (m) => console.log(m),
  });
}

/** A Lambda handler over a gateway: HTTP from the function URL, or S3's notices. */
export function lambdaHandler(gw) {
  return async (event) => {
    if (Array.isArray(event?.Records)) {
      for (const r of event.Records) {
        if (r?.eventSource !== 'aws:s3') continue;
        await gw.objectCreated(decodeURIComponent(String(r.s3?.object?.key || '').replace(/\+/g, ' ')));
      }
      return { ok: true };
    }
    const body = event?.body ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body) : '';
    const out = await gw.handle({ method: event?.requestContext?.http?.method, path: event?.rawPath, headers: event?.headers || {}, body });
    return { statusCode: out.status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(out.body) };
  };
}

let ready = null;
export const handler = async (event) => {
  ready ??= lambdaHandler(gatewayFromEnv());
  return ready(event);
};
