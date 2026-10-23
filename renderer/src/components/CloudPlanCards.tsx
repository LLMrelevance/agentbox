// The cloud's plans as cards side by side: Settings › Cloud and the setup
// screen's first step draw the same three, so a plan looks the same wherever
// it is chosen.
import { planCards, usageLine, usedPercent, type PaidPlan } from '../cloud-upgrade';
import type { CloudPlan } from '../types';

export function CloudPlanCards({ plan, onChoose, opening = null }: {
  plan: CloudPlan | null;
  onChoose: (id: PaidPlan) => void;
  /** The plan whose Stripe sheet is open. */
  opening?: PaidPlan | null;
}) {
  return (
    <div className="set-group cloud-plans" data-find="cloud-plans">
      {planCards(plan).map((c) => (
        <div key={c.id} className={`cloud-plan${c.current ? ' mine' : ''}`}>
          <div className="cloud-plan-head"><span>{c.name}</span>{c.current && <span className="cloud-plan-mine">Your plan</span>}</div>
          <div className="cloud-plan-price">{c.price}<span> a month</span></div>
          <div className="cloud-plan-slots">{c.slots}</div>
          <div className="cloud-plan-where">running in the cloud</div>
          <div className="cloud-plan-hours">{c.hours}</div>
          {c.current && plan ? (
            <div className="cloud-plan-use">
              <span>{usageLine(plan)}</span>
              <span className="cloud-plan-bar"><i style={{ width: `${usedPercent(plan)}%` }} /></span>
            </div>
          ) : c.button && (
            <button type="button" className="set-ghost cloud-plan-go" disabled={!!opening} onClick={() => onChoose(c.id)}>
              {opening === c.id ? 'Paying on Stripe…' : c.button}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
