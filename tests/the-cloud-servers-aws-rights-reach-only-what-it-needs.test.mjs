// THE CLOUD SERVER'S AWS RIGHTS REACH ONLY WHAT IT NEEDS, AND IT DEPLOYS AS
// ONE FILE THAT STARTS.
//
// scripts/cloud-gateway-setup.mjs gives the cloud server (w-6633e825a7) its
// rights in our AWS account. Two of them guard everyone's data: the links it
// hands to Macs are signed by a user that must never reach the ledger (or a
// Mac could rewrite its own plan), and the function itself must start only
// our one runtime. And the function is bundled into one file for Lambda,
// where nothing is installed: a bundle that cannot even load is only found
// once it is deployed, by every caller at once.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolePolicy, signerPolicy, withDoneNotice, bundle } from '../scripts/cloud-gateway-setup.mjs';

const where = { bucket: 'agentbox-cloud-x', runtimeArn: 'arn:aws:bedrock-agentcore:us-east-1:000000000000:runtime/agentbox_sandbox-x', region: 'us-east-1', account: '000000000000' };
const resources = (p) => p.Statement.flatMap((s) => [].concat(s.Resource));
const actions = (p) => p.Statement.flatMap((s) => [].concat(s.Action));

describe('the links\' signer', () => {
  it('reads and writes runs and sign-ins, and nothing else', () => {
    const p = signerPolicy(where);
    expect(resources(p).sort()).toEqual(['arn:aws:s3:::agentbox-cloud-x/logins/*', 'arn:aws:s3:::agentbox-cloud-x/runs/*']);
    expect(actions(p).sort()).toEqual(['s3:GetObject', 's3:PutObject']);
    expect(JSON.stringify(p)).not.toContain('ledger');
  });
});

describe('the function\'s role', () => {
  it('starts and stops only our runtime', () => {
    const p = rolePolicy(where);
    const agentcore = p.Statement.find((s) => [].concat(s.Action).some((a) => a.startsWith('bedrock-agentcore:')));
    expect([].concat(agentcore.Resource)).toEqual([where.runtimeArn, `${where.runtimeArn}/runtime-endpoint/*`]);
    expect(actions(p).filter((a) => a.startsWith('bedrock-agentcore:')).sort()).toEqual(['bedrock-agentcore:InvokeAgentRuntime', 'bedrock-agentcore:StopRuntimeSession']);
  });

  it('touches only runs, sign-ins and its ledger in our bucket, and no action or resource is a bare wildcard', () => {
    const p = rolePolicy(where);
    expect(resources(p).filter((r) => r.startsWith('arn:aws:s3')).sort()).toEqual(['ledger/*', 'logins/*', 'runs/*'].map((x) => `arn:aws:s3:::agentbox-cloud-x/${x}`));
    expect(resources(p)).not.toContain('*');
    expect(actions(p).some((a) => a === '*' || a.endsWith(':*'))).toBe(false);
  });
});

describe('S3\'s notices', () => {
  it('ours is added once, and every other notice on the bucket is kept', () => {
    const other = { Id: 'someone-else', LambdaFunctionArn: 'arn:other', Events: ['s3:ObjectRemoved:*'] };
    const first = withDoneNotice({ LambdaFunctionConfigurations: [other], QueueConfigurations: [{ Id: 'q' }] }, 'arn:fn');
    const again = withDoneNotice(first, 'arn:fn2');
    expect(again.QueueConfigurations).toEqual([{ Id: 'q' }]);
    expect(again.LambdaFunctionConfigurations.map((c) => c.Id)).toEqual(['someone-else', 'agentbox-gateway-done']);
    expect(again.LambdaFunctionConfigurations[1]).toMatchObject({ LambdaFunctionArn: 'arn:fn2', Filter: { Key: { FilterRules: [{ Name: 'prefix', Value: 'runs/' }, { Name: 'suffix', Value: 'done.json' }] } } });
    expect(withDoneNotice({}, 'arn:fn').LambdaFunctionConfigurations).toHaveLength(1);
  });
});

describe('the bundle', () => {
  it('is one file that loads with nothing installed beside it, and says what settings it is missing', async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gateway-bundle-'));
    try {
      const zip = await bundle(out);
      expect(fs.statSync(zip).size).toBeGreaterThan(1000);
      // Loaded from a folder with no node_modules anywhere above it.
      const alone = fs.mkdtempSync(path.join(os.tmpdir(), 'gateway-alone-'));
      fs.copyFileSync(path.join(out, 'index.mjs'), path.join(alone, 'index.mjs'));
      const mod = await import(pathToFileURL(path.join(alone, 'index.mjs')).href);
      await expect(mod.handler({ rawPath: '/v1/me', headers: {}, requestContext: { http: { method: 'GET' } } })).rejects.toThrow(/missing REGION/);
      fs.rmSync(alone, { recursive: true, force: true });
    } finally {
      fs.rmSync(out, { recursive: true, force: true });
    }
  }, 60_000);
});
