// THE CLOUD ASKS FOR A PLAN BEFORE ANY ACCOUNT.
//
// Signing up for Agentbox Cloud used to go: make an account, add a Claude or
// Codex account, and only later find the plans in Settings. The owner
// (w-2c627fdea8, 2026-10-23): "For sure you shouldn't add your Claude or Codex
// account before it charges you ... minimize friction and steps to payment",
// and, of the drawn options, the plans in the invitation, "expandable to get
// more detail". So the invitation lists the three plans, the picked one opens,
// the pick survives signing up, and the setup screen pays (Stripe opens by
// itself for a picked plan) before it asks for any account.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { planRows, setupStep, pickPlan, pickedPlan, forgetPick } from '../renderer/src/cloud-plan-pick.ts';
import { CloudPlanPick } from '../renderer/src/components/CloudPlanPick.tsx';
import { CloudSetup } from '../renderer/src/components/CloudSetup.tsx';
import { SETUP } from '../renderer/src/cloud-setup.ts';

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

describe('the plans, as the server sells them', () => {
  const rows = planRows();
  it('Pro, Plus and Max, at their prices', () => {
    expect(rows.map((r) => [r.name, r.price])).toEqual([['Pro', '$40 a month'], ['Plus', '$100 a month'], ['Max', '$200 a month']]);
  });
  it('each saying how many agents at once and how many hours', () => {
    expect(rows[0].short).toBe('10 agents at once');
    expect(rows[0].more).toContain('400 agent hours a month');
    expect(rows[1].more).toContain('1,200 agent hours a month');
    expect(rows[2].short).toBe('Unlimited agents at once');
    expect(rows[2].more).toContain('3,000 agent hours a month');
  });
  it('in plain words with no colon, semicolon or dash in them', () => {
    for (const r of rows) for (const s of [r.short, ...r.more]) expect(s).not.toMatch(/[:;—]/);
  });
});

describe('which step the setup screen opens on', () => {
  it('a signed-in cloud with no plan pays first', () => {
    expect(setupStep({ managed: true, plan: { signedIn: true, plan: 'none' } })).toBe('pay');
  });
  it('one with a plan goes to its accounts', () => {
    expect(setupStep({ managed: true, plan: { signedIn: true, plan: 'pro' } })).toBe('accounts');
  });
  it('a plan not read yet pays first only when one was picked in the invitation', () => {
    expect(setupStep({ managed: true, plan: null, picked: 'plus' })).toBe('pay');
    expect(setupStep({ managed: true, plan: null, picked: null })).toBe('accounts');
  });
  it('a Mac on its own AWS account is never asked to pay', () => {
    expect(setupStep({ managed: false, plan: { signedIn: true, plan: 'none' }, picked: 'pro' })).toBe('accounts');
  });
  it('nor is one the server no longer knows', () => {
    expect(setupStep({ managed: true, plan: { signedIn: false } })).toBe('accounts');
  });
});

describe('the pick, kept through signing up', () => {
  it('is kept, read back and spent', () => {
    const s = store();
    pickPlan('max', s);
    expect(pickedPlan(s)).toBe('max');
    forgetPick(s);
    expect(pickedPlan(s)).toBe(null);
  });
  it('and anything else in its place reads as no pick', () => {
    const s = store();
    s.setItem('agentbox.cloud.plan', 'free');
    expect(pickedPlan(s)).toBe(null);
  });
});

describe('the plan rows', () => {
  it('open only the picked plan, and go on with it', () => {
    const html = renderToStaticMarkup(React.createElement(CloudPlanPick, { go: () => {} }));
    expect((html.match(/role="radio"/g) || []).length).toBe(3);
    expect((html.match(/aria-expanded="true"/g) || []).length).toBe(1);
    expect(text(html)).toContain('400 agent hours a month');
    expect(text(html)).not.toContain('1,200 agent hours a month');
    expect(text(html)).toContain('Continue with Pro');
  });
  it('start on the plan already picked', () => {
    const html = renderToStaticMarkup(React.createElement(CloudPlanPick, { start: 'max', go: () => {} }));
    expect(text(html)).toContain('3,000 agent hours a month');
    expect(text(html)).toContain('Continue with Max');
  });
});

describe('the setup screen', () => {
  const cloud = { setUp: true, managed: true, offered: false, mode: 'full', whenOn: 'full', running: 0, accounts: [], signIns: [] };
  const draw = (plan) => text(renderToStaticMarkup(React.createElement(CloudSetup, { cloud, plan, onMode: () => {}, onClose: () => {} })));
  it('with no plan, asks for one and for no account', () => {
    const t = draw({ signedIn: true, plan: 'none' });
    expect(t).toContain(SETUP.payHead);
    expect(t).toContain('Pay for Pro on Stripe');
    expect(t).not.toContain(SETUP.homeLede);
    expect(t).not.toContain(SETUP.planClaude);
  });
  it('once paid, asks for the account it runs on', () => {
    const t = draw({ signedIn: true, plan: 'pro' });
    expect(t).toContain(SETUP.homeLede);
    expect(t).not.toContain(SETUP.payHead);
  });
});

describe('the invitation', () => {
  const pages = fs.readFileSync(new URL('../renderer/src/threads/Pages.tsx', import.meta.url), 'utf8');
  it('lists the plans to someone not signed in, and keeps them for the sign-up', () => {
    expect(pages).toMatch(/!cloud\.setUp\s*\?[\s\S]{0,200}<CloudPlanPick/);
    expect(pages).toMatch(/go=\{\(plan\) => \{ pickPlan\(plan\); goSetUp\(\); \}\}/);
  });
  it('and the sign-in it opens starts on Create account when a plan was picked', () => {
    const app = fs.readFileSync(new URL('../renderer/src/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain(`<SignInPage purpose="cloud" startOn={pickedPlan() ? 'sign-up' : 'sign-in'}`);
  });
});
