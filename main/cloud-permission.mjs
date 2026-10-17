// THE CLOUD'S OWN PERMISSION MODE, put on a cloud run's arguments. Its own file
// because the Claude harness and the settings both need it, and the settings
// already import the harnesses.
import { CLAUDE_PERMISSION_MODES } from '../shared/work-items.mjs';

const SKIP_FLAGS = ['--dangerously-skip-permissions'];

/**
 * Only the permission flag changes, in place, so nothing else moves. Null
 * leaves the run on this computer's mode. With no flag to replace it goes
 * first, where a list flag such as --allowedTools cannot take it as a value.
 */
export function cloudPermissionArgs(args, mode) {
  if (mode == null) return args;
  if (!CLAUDE_PERMISSION_MODES.includes(mode)) throw new Error(`unknown permission mode: ${mode}`);
  const out = [];
  let at = -1;
  for (let i = 0; i < args.length; i += 1) {
    const arg = String(args[i]);
    const flag = arg === '--permission-mode' || arg.startsWith('--permission-mode=') || SKIP_FLAGS.includes(arg);
    if (!flag) { out.push(args[i]); continue; }
    if (at < 0) at = out.length;
    if (arg === '--permission-mode') i += 1;
  }
  out.splice(at < 0 ? 0 : at, 0, '--permission-mode', mode);
  return out;
}
