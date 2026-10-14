// SETTING UP THE CLOUD, ON ITS OWN SCREEN (renderer/src/cloud-setup.ts).
//
// The cloud menu only invites; this is where it happens, on the first-run
// walk's screen and card (components/PlanSetup.tsx, `.fr-screen .ps-over`).
// Three views, and only one thing to do on each:
//   home     the accounts she added, and a button to add a Claude or a Codex
//            account; Done once one can run;
//   sign-in  one account signing in: Claude's code comes back from the
//            clipboard by itself, Codex's code is shown to type on OpenAI's
//            page; every wait wears a moving mark;
//   where    where new threads should start.
// The sign-in itself happens in the cloud (main/cloud/logins.mjs).
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { AppMark } from './AppMark';
import { AskList } from './PlanSetup';
import { Cap } from './Onboarding';
import { NAME } from '../../../shared/product-name.mjs';
import { accountLabel, engineWord, pageToOpen, type CloudAccount, type CloudMode, type CloudSignIn, type CloudStatus } from '../cloud-menu';
import { SETUP, WHERE_ROWS, activeSignIn, anyReady, signInView } from '../cloud-setup';

const Plus = () => <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>;
const Mark = ({ engine }: { engine: 'claude' | 'codex' }) => <span className="ps-mark" aria-hidden="true">{engine === 'codex' ? 'X' : 'C'}</span>;
const Busy = () => <span className="cs-busy" aria-hidden="true" />;

const send = (engine: 'claude' | 'codex', action: 'start' | 'code' | 'cancel' | 'remove', key?: string | null, code?: string) =>
  api.cloudSignIn({ action, engine, key: key ?? null, code });

// ONE SIGN-IN. Claude's code is read from the clipboard when she comes back
// to the app (and every two seconds while it is in front), and sent the
// moment it is there; the field is for pasting by hand if that fails.
function SignIn({ s, existing }: { s: CloudSignIn; existing: boolean }) {
  const view = signInView(s);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const sent = useRef<string | null>(null);
  const submit = (c: string) => {
    const v = c.trim();
    if (!v || sent.current === v) return;
    sent.current = v;
    void send(s.engine, 'code', s.key, v);
  };
  useEffect(() => {
    if (s.state !== 'needs-code') return;
    sent.current = null;
    const look = async () => { if (document.hasFocus()) { const c = await api.cloudClipboardCode(); if (c) submit(c); } };
    const timer = setInterval(look, 2000);
    window.addEventListener('focus', look);
    return () => { clearInterval(timer); window.removeEventListener('focus', look); };
  }, [s.state, s.attempt]);

  return <div className="fr-stack fr-stack-folders">
    <h1 className="fr-page">{SETUP.signInHead(s.engine)}</h1>
    <p className={`fr-lede${s.state === 'failed' ? ' cs-trouble' : ''}`}>{view.busy && <Busy />}{view.lead}</p>
    {view.paste && <form className="fr-card cs-paste-card" onSubmit={(e) => { e.preventDefault(); submit(code); }}>
      <input autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder={SETUP.pastePlaceholder} aria-label="Claude’s sign-in code" spellCheck={false} />
      <button type="submit" className="fr-submit" disabled={!code.trim()}>{SETUP.pasteGo} <Cap cap="↵" /></button>
    </form>}
    {view.codeToType && <div className="cs-code">
      <code>{view.codeToType}</code>
      <button type="button" className="cs-quiet" onClick={() => { void navigator.clipboard?.writeText(view.codeToType!); setCopied(true); }}>{copied ? SETUP.copied : SETUP.copy}</button>
    </div>}
    <div className="ps-acts ps-acts-quiet">
      {s.state === 'failed'
        ? <button type="button" className="fr-finish-go" onClick={() => void send(s.engine, 'start', existing ? s.key : null)}>{SETUP.tryAgain}</button>
        : s.url && <button type="button" className="ps-link" onClick={() => window.open(s.url!, '_blank')}>{SETUP.openAgain}</button>}
    </div>
  </div>;
}

export function CloudSetup({ cloud, onMode, onClose }: {
  cloud: CloudStatus;
  onMode: (mode: CloudMode) => void;
  onClose: () => void;
}) {
  const accounts = cloud.accounts || [];
  const active = activeSignIn(cloud);
  const [where, setWhere] = useState(false);
  // A failed sign-in stays on screen until she tries again or goes back.
  const [dismissed, setDismissed] = useState<string | null>(null);
  const shown = active && !(active.state === 'failed' && dismissed === (active.attempt ?? active.key)) ? active : null;

  // The vendor's page opens in the browser by itself, once per sign-in.
  const opened = useRef<string | null>(null);
  const page = pageToOpen(shown);
  useEffect(() => {
    if (page && opened.current !== page.key) { opened.current = page.key; window.open(page.url, '_blank'); }
  }, [page?.key]);

  // Back: out of a sign-in to the accounts, out of the screen from there.
  const back = () => {
    if (shown) {
      if (shown.state !== 'failed') void send(shown.engine, 'cancel', shown.key);
      setDismissed(shown.attempt ?? shown.key);
      return;
    }
    if (where) { setWhere(false); return; }
    onClose();
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') back(); };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  // The account that just came in, lit for a moment on the list.
  const [fresh, setFresh] = useState<string | null>(null);
  const seen = useRef(new Set(accounts.map((a) => a.key)));
  useEffect(() => {
    const added = accounts.find((a) => !seen.current.has(a.key));
    for (const a of accounts) seen.current.add(a.key);
    if (added) { setFresh(added.key); const t = setTimeout(() => setFresh(null), 2400); return () => clearTimeout(t); }
    return undefined;
  }, [accounts.map((a) => a.key).join()]);

  let body: JSX.Element;
  if (shown) {
    body = <SignIn s={shown} existing={accounts.some((a) => a.key === shown.key)} />;
  } else if (where) {
    body = <div className="fr-stack fr-stack-folders">
      <h1 className="fr-page">{SETUP.doneHead}</h1>
      <p className="fr-lede">{SETUP.doneLede}</p>
      <AskList rows={WHERE_ROWS.map((r) => ({ ...r }))} label={SETUP.doneLede} onPick={(key) => { onMode(key as CloudMode); onClose(); }} />
    </div>;
  } else {
    body = <div className="fr-stack fr-stack-folders">
      <h1 className="fr-page">{SETUP.homeHead}</h1>
      <p className="fr-lede">{SETUP.homeLede}</p>
      {/* ADDING LIVES IN THE LIST, as its last row, so the card is the one
          thing on the screen and an empty one says what to do (2026-10-14:
          two buttons side by side under the list felt "a little bit of bad
          UX"). One row, with the two kinds as its choices: she picked it over
          a row per kind, and with two kinds a menu behind it would only add a
          click. No tick on an account that works: it looked unpolished; only
          one that stopped working says anything. */}
      <div className="fr-card cs-accounts">
        {accounts.map((a: CloudAccount) => <div key={a.key} className={`cs-account${fresh === a.key ? ' fresh' : ''}${a.state === 'broken' ? ' broken' : ''}`}>
          <Mark engine={a.engine} />
          <span className="cs-account-name">{accountLabel(a, accounts)}</span>
          <span className="cs-account-eng">{engineWord(a)}</span>
          {a.state === 'broken'
            ? <button type="button" className="cs-quiet cs-again" onClick={() => void send(a.engine, 'start', a.key)}>{SETUP.again}</button>
            : <span />}
          <button type="button" className="cs-remove" aria-label={`${SETUP.remove} ${accountLabel(a, accounts)}`} title={SETUP.remove} onClick={() => void send(a.engine, 'remove', a.key)}>×</button>
        </div>)}
        <div className="cs-add-row cs-add-one">
          <span className="cs-add-ic"><Plus /></span>
          <span className="cs-add-say">{SETUP.addOne}</span>
          <span className="cs-add-pick">
            <button type="button" aria-label={SETUP.addClaude} onClick={() => void send('claude', 'start')}><Mark engine="claude" />Claude</button>
            <button type="button" aria-label={SETUP.addCodex} onClick={() => void send('codex', 'start')}><Mark engine="codex" />Codex</button>
          </span>
        </div>
      </div>
      {anyReady(accounts) && <div className="ps-acts"><button type="button" className="fr-finish-go cs-go" onClick={() => setWhere(true)}>{SETUP.done}</button></div>}
    </div>;
  }

  return <div className="fr-screen has-back ps-over" role="dialog" aria-label={SETUP.screenLabel}>
    <button type="button" className="back-esc fr-back" aria-label={SETUP.back} title={SETUP.back} onClick={back}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3.5L5.5 8l4.5 4.5" /></svg>
    </button>
    <div className="fr-brand"><AppMark size={22} />{NAME}</div>
    {body}
  </div>;
}
