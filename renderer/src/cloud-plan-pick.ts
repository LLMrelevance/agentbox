// THE PLAN COMES FIRST: picked in the invitation, kept through signing up (an
// email sign-up leaves the app for its confirmation link), and paid on the
// setup screen before it asks for any Claude or Codex account.
import { PLANS } from '../../cloud/gateway/plans.mjs';
import type { PaidPlan } from './cloud-upgrade';
import type { CloudPlan } from './types';

const ORDER: PaidPlan[] = ['pro', 'plus', 'max'];
const NAME: Record<PaidPlan, string> = { pro: 'Pro', plus: 'Plus', max: 'Max' };
const n = (x: number) => x.toLocaleString('en-US');

export interface PlanRow { id: PaidPlan; name: string; price: string; short: string; more: string[] }

export function planRows(): PlanRow[] {
  return ORDER.map((id) => {
    const p = PLANS[id];
    return {
      id, name: NAME[id], price: `$${p.dollarsPerMonth} a month`,
      short: p.unlimited ? 'Unlimited agents at once' : `${p.agents} agents at once`,
      more: [
        'On top of the agents your computer runs',
        `${n(p.hoursPerMonth)} agent hours a month`,
        'Time counts only while an agent works. Waiting for your reply is free.',
      ],
    };
  });
}

export const planName = (id: PaidPlan) => NAME[id];

/**
 * The setup screen's first step: pay, while a signed-in cloud has no plan. A
 * plan not yet read counts as unpaid only when one was picked, so someone who
 * just signed up from the invitation never sees the accounts first.
 */
export function setupStep({ managed, plan, picked = null }: { managed?: boolean; plan: CloudPlan | null; picked?: PaidPlan | null }): 'pay' | 'accounts' {
  if (!managed) return 'accounts';
  if (!plan) return picked ? 'pay' : 'accounts';
  return plan.signedIn !== false && plan.plan === 'none' ? 'pay' : 'accounts';
}

const KEY = 'agentbox.cloud.plan';
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const local = (): Store | null => {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
};
export function pickPlan(id: PaidPlan, store: Store | null = local()): void { store?.setItem(KEY, id); }
export function pickedPlan(store: Store | null = local()): PaidPlan | null {
  const v = store?.getItem(KEY);
  return ORDER.includes(v as PaidPlan) ? (v as PaidPlan) : null;
}
export function forgetPick(store: Store | null = local()): void { store?.removeItem(KEY); }
