// SETTING UP THE CLOUD, ON ITS OWN SCREEN (renderer/src/cloud-setup.ts).
//
// The cloud menu only says whether the cloud is set up and offers Set up; this
// is where it happens. It is the first-run walk's own screen and setup card
// (components/PlanSetup.tsx, `.fr-screen .ps-over`), because that is how this
// app already gets somebody signed in, and she picked that card.
//
// Two layouts while she chooses between them (2026-10-14):
//   'walk'  an introduction, then one screen per account, then where threads
//           should start;
//   'list'  one card listing every account, the one signing in opened up.
// The sign-in itself happens in the cloud (main/cloud/logins.mjs); this only
// relays Claude's code and shows Codex's.
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { AppMark } from './AppMark';
import { AskList } from './PlanSetup';
import { Cap } from './Onboarding';
import { NAME } from '../../../shared/product-name.mjs';
import { engineWord, pageToOpen, type CloudAccount, type CloudMode, type CloudStatus } from '../cloud-menu';
import { SETUP, WHERE_ROWS, currentAccount, keyOf, stepsFor, type StepState } from '../cloud-setup';

const StepIcon = ({ state }: { state: StepState }) => (
  state === 'done' ? (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>
  ) : state === 'now' ? (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="4.5" fill="currentColor" /></svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="8" cy="8" r="5" /></svg>
  )
);

const sign = (a: CloudAccount, action: 'start' | 'code' | 'cancel', code?: string) => {
  void api.cloudSignIn({ action, engine: a.engine, profile: a.profile, code });
};

// What the step underway asks for: Claude's code pasted, or Codex's shown.
function StepAsk({ account }: { account: CloudAccount }) {
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const s = account.signIn;
  if (s?.state === 'needs-code') {
    return <form className="cs-paste" onSubmit={(e) => { e.preventDefault(); if (code.trim()) { sign(account, 'code', code); setCode(''); } }}>
      <input autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder={SETUP.pastePlaceholder} aria-label={`Claude’s sign-in code for ${account.name}`} spellCheck={false} />
      <button type="submit" className="fr-submit" disabled={!code.trim()}>{SETUP.pasteGo} <Cap cap="↵" /></button>
    </form>;
  }
  if (s?.state === 'waiting' && s.code) {
    return <div className="cs-code">
      <code>{s.code}</code>
      <button type="button" className="ps-link" onClick={() => { void navigator.clipboard?.writeText(s.code!); setCopied(true); }}>{copied ? SETUP.copied : SETUP.copy}</button>
    </div>;
  }
  return null;
}

function Steps({ account }: { account: CloudAccount }) {
  return <div className="fr-card fr-folders ps-steps">
    {stepsFor(account).map((row) => (
      <div key={row.key} className={`ps-step ${row.state}`}>
        <span className="ps-ic"><StepIcon state={row.state} /></span>
        <div>
          <div className="ps-t">{row.title}</div>
          {row.sub && <div className="ps-s">{row.sub}</div>}
          {row.key === 'code' && row.state === 'now' && <StepAsk account={account} />}
        </div>
        <span className="ps-r" />
      </div>
    ))}
  </div>;
}

function Trouble({ account, onSkip }: { account: CloudAccount; onSkip: () => void }) {
  if (account.signIn?.state !== 'failed' && !account.signIn?.message) return null;
  return <>
    {account.signIn?.message && <p className="fr-note fr-refused">{account.signIn.message}</p>}
    {account.signIn?.state === 'failed' && <div className="ps-acts">
      <button type="button" className="fr-finish-go" onClick={() => sign(account, 'start')}>{SETUP.tryAgain}</button>
      <button type="button" className="fr-gate-again" onClick={onSkip}>{SETUP.skip}</button>
    </div>}
  </>;
}

export function CloudSetup({ cloud, layout = 'walk', onMode, onClose }: {
  cloud: CloudStatus;
  layout?: 'walk' | 'list';
  onMode: (mode: CloudMode) => void;
  onClose: () => void;
}) {
  const accounts = cloud.accounts || [];
  // The accounts this setup set out to sign in, fixed when it opened, so the
  // count does not move as each one finishes.
  const [order] = useState(() => accounts.filter((a) => !a.ready && a.state !== 'renew' && a.state !== 'stale').map(keyOf));
  const [begun, setBegun] = useState(layout === 'list' || order.length === 0);
  const [skipped, setSkipped] = useState<string[]>([]);
  const current = begun ? currentAccount(accounts, order, skipped) : null;
  const finished = begun && !current;

  // Esc leaves, as the walk's own arrow does. A sign-in under way carries on.
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); else if (e.key === 'Enter' && !begun) { e.preventDefault(); setBegun(true); } };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [begun, onClose]);

  // In the walk, the account on screen starts signing in by itself; in the
  // list it starts when its row is pressed.
  const started = useRef<string | null>(null);
  useEffect(() => {
    if (layout !== 'walk' || !current || current.signIn || started.current === keyOf(current)) return;
    started.current = keyOf(current);
    sign(current, 'start');
  }, [layout, current ? keyOf(current) : null, current?.signIn?.state]);

  // Each vendor's page opens in the browser by itself, once per sign-in.
  const opened = useRef<string | null>(null);
  const page = pageToOpen(current);
  useEffect(() => {
    if (page && opened.current !== page.key) { opened.current = page.key; window.open(page.url, '_blank'); }
  }, [page?.key]);

  const skip = (a: CloudAccount) => { sign(a, 'cancel'); setSkipped((s) => [...s, keyOf(a)]); };
  const n = current ? order.indexOf(keyOf(current)) + 1 : 0;

  let body: JSX.Element;
  if (!begun) {
    body = <div className="fr-corner">
      <div>
        <h1 className="fr-head">{SETUP.introHead}</h1>
        <p className="fr-sub">{SETUP.introSub}</p>
      </div>
      <button type="button" className="fr-go" onClick={() => setBegun(true)}>{SETUP.introGo} <Cap cap="↵" /></button>
    </div>;
  } else if (finished) {
    body = <div className="fr-stack fr-stack-folders">
      <h1 className="fr-page">{SETUP.doneHead}</h1>
      <p className="fr-lede">{SETUP.doneLede}</p>
      <AskList rows={WHERE_ROWS.map((r) => ({ ...r }))} label={SETUP.doneLede} onPick={(key) => { onMode(key as CloudMode); onClose(); }} />
    </div>;
  } else if (layout === 'walk' && current) {
    body = <div className="fr-stack fr-stack-folders">
      <h1 className="fr-page">{SETUP.signInHead(current.engine)}</h1>
      <p className="fr-lede"><span className="fr-lede-path">{current.name}</span>{order.length > 1 && <span className="ps-of"> · {SETUP.of(n, order.length)}</span>}</p>
      <Steps account={current} />
      <Trouble account={current} onSkip={() => skip(current)} />
      <div className="ps-acts ps-acts-quiet">
        {current.signIn?.url && <button type="button" className="ps-link" onClick={() => window.open(current.signIn!.url!, '_blank')}>{SETUP.openAgain}</button>}
      </div>
    </div>;
  } else {
    body = <div className="fr-stack fr-stack-folders">
      <h1 className="fr-page">{SETUP.listHead}</h1>
      <p className="fr-lede">{SETUP.listLede}</p>
      <div className="fr-card fr-folders cs-list">
        {order.map((k) => {
          const a = accounts.find((x) => keyOf(x) === k);
          if (!a) return null;
          const open = current && keyOf(current) === k && !!a.signIn;
          const state: StepState = a.ready ? 'done' : open ? 'now' : 'todo';
          return <div key={k} className={`cs-row ${state}`}>
            <div className="cs-row-head">
              <span className="ps-ic"><StepIcon state={state} /></span>
              <span className="cs-row-name">{a.name}</span>
              <span className="cs-row-eng">{engineWord(a)}</span>
              {a.ready ? <span className="cs-row-ready">Ready</span>
                : !a.signIn || a.signIn.state === 'failed' ? <button type="button" className="fr-submit cs-row-go" onClick={() => sign(a, 'start')}>Sign in</button>
                : <span className="cs-row-ready">Signing in…</span>}
            </div>
            {open && <div className="cs-row-body">
              {stepsFor(a).filter((s) => s.state === 'now').map((s) => <div key={s.key}><div className="ps-t">{s.title}</div>{s.sub && <div className="ps-s">{s.sub}</div>}</div>)}
              <StepAsk account={a} />
              {a.signIn?.url && <button type="button" className="ps-link" onClick={() => window.open(a.signIn!.url!, '_blank')}>{SETUP.openAgain}</button>}
            </div>}
            {a.signIn?.state === 'failed' && a.signIn.message && <div className="cs-row-body"><span className="cs-row-trouble">{a.signIn.message}</span></div>}
          </div>;
        })}
      </div>
    </div>;
  }

  return <div className="fr-screen has-back ps-over" role="dialog" aria-label={SETUP.listHead}>
    <button type="button" className="back-esc fr-back" aria-label="Back" title="Back" onClick={onClose}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3.5L5.5 8l4.5 4.5" /></svg>
    </button>
    <div className="fr-brand"><AppMark size={22} />{NAME}</div>
    {body}
  </div>;
}
