// What each cloud plan allows (docs/cloud/PLAN.md, Plans). `agents` is how
// many run in the cloud at once; `hoursPerMonth` is the agent-hours behind it,
// null for none set yet. There is no free cloud: someone with no plan
// (`none`) can sign in and add accounts, and runs nothing until they pay. The
// paid plans' hours are to be set from measured cost (scripts/cloud-usage.mjs)
// before anyone pays for them.
export const PLANS = Object.freeze({
  none: Object.freeze({ agents: 0, hoursPerMonth: 0 }),
  pro: Object.freeze({ agents: 10, hoursPerMonth: null }),
  plus: Object.freeze({ agents: 25, hoursPerMonth: null }),
  max: Object.freeze({ agents: 60, hoursPerMonth: null }),
});

export const RUN_CEILING_MS = 8 * 60 * 60_000;
// The sandbox gives a sign-in 20 minutes, and checking it takes up to 4 more.
export const SIGNIN_CEILING_MS = 30 * 60_000;
export const SIGNINS_AT_ONCE = 3;
