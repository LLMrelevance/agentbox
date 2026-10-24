// THE COMPUTER'S SIDE OF A KIT (shared/cloud-kit.mjs): where its copy is kept
// here, and the marker that makes a run the cloud server started from it this
// thread's own, so the import path joins it or brings it home
// (main/cloud/run.mjs `joining`, Supervisor#adoptCloudRun).
import fs from 'node:fs';
import path from 'node:path';
import { cloudSessionId } from '../../shared/cloud-kit.mjs';

const safe = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '_');

/** Where the last kit written for a thread is kept on this computer. */
export const kitCopyPath = (userDir, product, item) => path.join(userDir, 'cloud-kits', `${safe(product)}--${safe(item)}.json`);
/** Where the reply's place in the prompt waits for the kit writer, read once. */
export const kitFramePath = (userDir, product, item) => path.join(userDir, 'cloud-kits', `${safe(product)}--${safe(item)}.frame.json`);

export function readKitCopy(file) {
  try {
    const kit = JSON.parse(fs.readFileSync(file, 'utf8'));
    return kit && typeof kit === 'object' && kit.marker && typeof kit.cwd === 'string' ? kit : null;
  } catch { return null; }
}

// None of its events have been read here (`cursor`). Left `detached`, as one
// the app left going: the import path asks the sandbox which it is now, and
// numbers this computer's input on from what the sandbox says it took
// (`inSeq`), however many replies the server sent. Its input is closed when
// joined (`unsent`), so the turn it is on ends and its work comes home; her
// next reply is then an ordinary run here.
export function markerForCloudRun(kit, runId) {
  return {
    ...kit.marker,
    runId,
    sessionId: cloudSessionId(kit.item, runId),
    offline: true,
    state: 'detached', pid: null, cursor: 0, conns: {},
    unsent: [{ action: 'stdin', end: true }],
  };
}
