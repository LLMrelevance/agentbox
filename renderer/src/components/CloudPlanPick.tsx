// The cloud's three plans as rows; the one picked opens to say what it gives,
// and one button goes on with it (../cloud-plan-pick.ts).
import { useState } from 'react';
import { planName, planRows } from '../cloud-plan-pick';
import type { PaidPlan } from '../cloud-upgrade';
import './cloud-plan-pick.css';

const Chevron = () => <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5" /></svg>;

export function CloudPlanPick({ start = 'pro', go, busy = false, goLabel = (name) => `Continue with ${name}` }: {
  start?: PaidPlan;
  go: (plan: PaidPlan) => void;
  busy?: boolean;
  goLabel?: (name: string) => string;
}) {
  const [picked, setPicked] = useState<PaidPlan>(start);
  return <div className="cpp">
    <div className="cpp-rows" role="radiogroup" aria-label="Cloud plans">
      {planRows().map((r) => {
        const on = r.id === picked;
        return <div key={r.id} className={`cpp-row${on ? ' on' : ''}`}>
          <button type="button" role="radio" aria-checked={on} aria-expanded={on} className="cpp-head" onClick={() => setPicked(r.id)}>
            <span className="cpp-name">{r.name}<small>{r.short}</small></span>
            <span className="cpp-price">{r.price}</span>
            <span className="cpp-chev"><Chevron /></span>
          </button>
          {on && <ul className="cpp-more">{r.more.map((m) => <li key={m}>{m}</li>)}</ul>}
        </div>;
      })}
    </div>
    <button type="button" className="cpp-go" disabled={busy} onClick={() => go(picked)}>{goLabel(planName(picked))}</button>
  </div>;
}
