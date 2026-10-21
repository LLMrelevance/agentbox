// WHAT THE SUPERVISOR SAYS ABOUT EVERY THREAD AT ONCE, for the surfaces that
// draw threads beside each other: the table, the board and the summary panel.
//
// `App` already holds all of it, off one snapshot, and already hands the
// running ids down as a context. This carries the rest of the same answer so a
// row can say what is happening without four more props threaded through two
// components that have nothing to do with agents.
import { createContext } from 'react';
import type { RunningSession } from './types';

export interface Fleet {
  /** The run on each thread an agent is on right now, by thread id. */
  sessions?: Map<string, RunningSession>;
  /** `supervisor.queued`: a tick spawns these as soon as a slot frees. */
  queued?: string[];
  /** `supervisor.runNow`: the queued ones pushed to the front. */
  runNow?: string[];
  /** `supervisor.signInNeeded`: the tool each held thread is signed out of. */
  signInNeeded?: Record<string, string>;
  /** `supervisor.atLimit`: the tool that is out of usage and when it resets. */
  atLimit?: Record<string, { tool: string; until: number }>;
  /** `supervisor.shipping`: the app still owes these a ship. */
  shipping?: string[];
  /** `supervisor.stalled`: a worker died on these. */
  stalled?: string[];
  /** `supervisor.silent`: the last run here ended and wrote nothing down. */
  silent?: Record<string, { runs: number; endedAt: number }>;
  /** Spawning is off altogether. */
  paused?: boolean;
}

export const FleetContext = createContext<Fleet>({});
