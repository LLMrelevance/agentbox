import path from 'node:path';
import crypto from 'node:crypto';
import { readPortableFile, snapshotSkills, SKILL_LIMITS } from './skills.mjs';
import { run } from './exec.mjs';

const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const unavailable = () => ({ status: 'unavailable', message: 'The resource could not be delivered while this computer was available. Continue independent work and explain what is missing.' });

export function resourceContextFor(marker, defaults) {
  if (marker.resourceContext) return { ...marker.resourceContext, skillsAvailable: true };
  const engine = marker.engine || defaults.engine;
  const sessions = marker.bringDirs?.find((b) => b.name === 'sessions.tgz' && path.basename(b.dir) === 'sessions');
  const codexHome = engine === 'codex' && sessions ? path.dirname(sessions.dir) : null;
  return { ...defaults, engine, configDir: marker.configDir || defaults.configDir, codexHome,
    skillsAvailable: engine === 'codex' ? !!codexHome : !!marker.configDir };
}

function normalized(args) {
  if (!args || !['file', 'skill'].includes(args.kind) || typeof args.path !== 'string' || !args.path || args.path.length > 1024) return null;
  if (/[\\\r\n\0]/.test(args.path) || path.posix.isAbsolute(args.path) || args.path.split('/').includes('..')) return null;
  const name = path.posix.normalize(args.path);
  if (args.kind === 'skill') return /^(?:\.system\/)?[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) ? { kind: 'skill', name } : null;
  if (!['task', 'documents'].includes(args.scope) || name.split('/').some((p) => p.startsWith('.'))) return null;
  return { kind: 'file', scope: args.scope, name };
}

/** A run-bound resolver. Its durable state belongs to that run's marker, never the caller. */
export function createResourceRequests({ cwd, docs, engine, homeDir, configDir, codexHome, skillsAvailable = true, runId, state, save, upload, deliver, stopped = () => false, timeoutMs = 45_000, limits: overrides = {} }) {
  const limits = { file: SKILL_LIMITS.file, total: SKILL_LIMITS.total, requests: 5, ...overrides };
  state.requests ??= {};
  // An interrupted in-flight attempt is retriable; completed deliveries remain pinned.
  for (const [id, r] of Object.entries(state.requests)) if (r.status === 'pending') delete state.requests[id];
  const inFlight = new Map();
  const controllers = new Set();
  let active = 0; let closed = false;
  const used = () => Object.values(state.requests).reduce((sum, r) => sum + (r.bytes || 0), 0);

  const request = async (args) => {
    if (closed || stopped()) return unavailable();
    const named = normalized(args);
    if (!named) return { status: 'denied', message: 'Request a relative task/document path or an installed skill name.' };
    if (named.kind === 'skill' && !skillsAvailable) return unavailable();
    const id = digest(JSON.stringify(named));
    if (inFlight.has(id)) return inFlight.get(id);
    if (state.requests[id]?.status && state.requests[id].status !== 'pending') return state.requests[id].answer;
    if (active >= limits.requests) return unavailable();
    if (Object.keys(state.requests).length >= limits.requests) return { status: 'denied', message: 'This run has reached its resource-request count limit.' };
    state.requests[id] = { status: 'pending', bytes: 0 }; save();
    const controller = new AbortController();
    controllers.add(controller);
    const live = () => !controller.signal.aborted && !closed && !stopped();
    const reserve = (bytes) => {
      if (used() + bytes > limits.total) return false;
      state.requests[id].bytes = bytes; save(); return true;
    };
    let timer;
    active += 1;
    const work = Promise.resolve().then(async () => {
      let snapshot; let transferring = false;
      try {
        let content; let hash; let bytes; let basename; let skill = false; let mode = 0o644;
        if (named.kind === 'skill') {
          snapshot = await snapshotSkills({ engine, homeDir, configDir, codexHome, only: named.name, limits: { file: limits.file, total: limits.total, skill: Math.min(SKILL_LIMITS.skill, limits.total) } });
          if (!live()) return unavailable();
          const primary = path.join(engine === 'codex' ? codexHome : configDir, 'skills');
          const bundle = snapshot.bundles.find((b) => b.path === primary);
          if (!bundle) {
            const why = snapshot.skipped.map((s) => s.reason).join('; ');
            if (snapshot.skipped.some((s) => !s.status)) return unavailable();
            return { status: why ? (snapshot.skipped.some((s) => s.status === 'too_large') ? 'too_large' : 'denied') : 'not_found', message: why || 'That installed skill was not found or is disabled.' };
          }
          bytes = bundle.bytes; hash = bundle.hash; skill = true;
          if (!reserve(bytes)) return { status: 'too_large', message: 'This run has reached its resource byte limit.' };
          content = await run('tar', ['-czf', '-', '-C', bundle.dir, '.'], { encoding: null, env: { ...process.env, COPYFILE_DISABLE: '1' } });
        } else {
          const root = named.scope === 'task' ? cwd : docs;
          if (!root) return { status: 'denied', message: 'This run has no such resource folder.' };
          const file = await readPortableFile(path.join(root, named.name), root, limits.file, { allowHidden: false });
          if (!live()) return unavailable();
          content = file.body; mode = file.mode; bytes = content.length; hash = digest(content); basename = path.basename(named.name);
          if (!reserve(bytes)) return { status: 'too_large', message: 'This run has reached its resource byte limit.' };
        }
        if (!live()) return unavailable();
        const at = path.posix.join('/tmp/agentbox-resources', digest(runId), digest(`${id}:${hash}`));
        const key = `${skill ? 'skills' : 'resource'}-${hash}.${skill ? 'tgz' : 'bin'}`;
        transferring = true;
        const url = await upload(key, content);
        if (!live()) return unavailable();
        const target = skill ? path.posix.join(at, 'skills', named.name, 'SKILL.md') : path.posix.join(at, basename);
        const file = skill
          ? { path: path.posix.join(at, `.skills-${hash}.tgz`), url, untar: path.posix.join(at, 'skills') }
          : { path: target, url, mode };
        const ok = await deliver([file], controller.signal);
        if (!live() || !ok) return unavailable();
        return { status: 'delivered', path: target, bytes };
      } catch (err) {
        if (transferring || !live()) return unavailable();
        const status = ['ENOENT', 'ENOTDIR'].includes(err.code) ? 'not_found' : err.status || (['EACCES', 'EPERM', 'ELOOP'].includes(err.code) ? 'denied' : null);
        return status ? { status, message: status === 'not_found' ? 'That resource was not found.' : err.message } : unavailable();
      } finally { snapshot?.close(); active -= 1; }
    });
    const deadline = new Promise((resolve) => {
      controller.signal.addEventListener('abort', () => resolve(unavailable()), { once: true });
      timer = setTimeout(() => controller.abort(), timeoutMs); timer.unref?.();
    });
    const promise = Promise.race([work, deadline]).then((answer) => {
      clearTimeout(timer);
      if (answer.status === 'unavailable') { controller.abort(); delete state.requests[id]; }
      else state.requests[id] = { status: answer.status, bytes: answer.status === 'delivered' ? answer.bytes : 0, answer };
      save(); return answer;
    }).finally(() => { inFlight.delete(id); controllers.delete(controller); controller.abort(); });
    inFlight.set(id, promise);
    return promise;
  };
  request.close = () => { closed = true; for (const controller of controllers) controller.abort(); };
  return request;
}
