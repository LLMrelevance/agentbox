// THE LINE A CLOUD RUN ENDS ON WHEN ITS REQUEST NEEDS THIS COMPUTER. The cloud
// run is told to write it (main/cloud/run.mjs CLOUD_NOTE); the supervisor reads
// it and moves the thread here (Supervisor#_noteCloudHandBack).
export const HAND_BACK = '[[agentbox: needs the computer]]';

/** Whether a reply hands its thread back: the marked line, at a line's start. */
export function handsBack(result) {
  return String(result ?? '').split('\n').some((line) => line.trimStart().startsWith(HAND_BACK));
}
