// What each cloud plan allows (docs/cloud/PLAN.md, Plans). `agents` is how
// many run in the cloud at once; `hoursPerMonth` is the agent-hours behind it,
// null for none set yet. The paid plans' hours are to be set from measured
// cost (scripts/cloud-usage.mjs) before anyone pays for them.
export const PLANS = Object.freeze({
  free: Object.freeze({ agents: 2, hoursPerMonth: 5 }),
  pro: Object.freeze({ agents: 10, hoursPerMonth: null }),
  plus: Object.freeze({ agents: 25, hoursPerMonth: null }),
  max: Object.freeze({ agents: 60, hoursPerMonth: null }),
});

export const RUN_CEILING_MS = 8 * 60 * 60_000;
export const SIGNIN_CEILING_MS = 20 * 60_000;
export const SIGNINS_AT_ONCE = 3;
