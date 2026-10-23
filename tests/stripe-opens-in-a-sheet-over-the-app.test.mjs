// STRIPE OPENS IN A SHEET OVER THE APP, NOT IN THE BROWSER.
//
// Paying for a cloud plan sent the person to Stripe's checkout in their
// browser and left the app on a "Finish on Stripe" page. The owner
// (w-2c627fdea8, 2026-10-23): "It feels a little awkward for it to open
// separately ... why we wouldn't just have Stripe embedded here." Stripe's
// embeddable checkout needs an HTTPS page and the app's renderer is not one,
// so Stripe's own hosted page opens in a sheet on the app's window, and the
// sheet closes itself when Stripe sends the person back to the cloud server's
// /v1/paid: paid, or cancelled when the address says so.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { stripeNavigation } from '../main/cloud/stripe-window.mjs';

const GATEWAY = 'https://abc123.lambda-url.us-east-1.on.aws';
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('where the sheet may go', () => {
  it("Stripe's pages stay in the sheet", () => {
    expect(stripeNavigation('https://checkout.stripe.com/c/pay/cs_live_x', GATEWAY)).toBe('stay');
    expect(stripeNavigation('https://billing.stripe.com/p/session/x', GATEWAY)).toBe('stay');
  });
  it('so does a card check on another secure page, which some banks send people to', () => {
    expect(stripeNavigation('https://acs.examplebank.com/3ds', GATEWAY)).toBe('stay');
  });
  it("back at the cloud server's /v1/paid, the payment is done", () => {
    expect(stripeNavigation(`${GATEWAY}/v1/paid`, GATEWAY)).toBe('paid');
    expect(stripeNavigation(`${GATEWAY}/v1/paid?billing=1`, GATEWAY)).toBe('paid');
  });
  it('and with cancelled=1 it was cancelled', () => {
    expect(stripeNavigation(`${GATEWAY}/v1/paid?cancelled=1`, GATEWAY)).toBe('cancelled');
  });
  it('a page that only names the server in its address is not the server', () => {
    expect(stripeNavigation(`https://example.com/?next=${GATEWAY}/v1/paid`, GATEWAY)).toBe('stay');
    expect(stripeNavigation(`https://abc123.lambda-url.us-east-1.on.aws.example.com/v1/paid`, GATEWAY)).toBe('stay');
  });
  it('anything not secure is refused', () => {
    expect(stripeNavigation('http://checkout.stripe.com/c/pay/x', GATEWAY)).toBe('refuse');
    expect(stripeNavigation('file:///etc/passwd', GATEWAY)).toBe('refuse');
    expect(stripeNavigation('not a url', GATEWAY)).toBe('refuse');
  });
});

describe('the wiring', () => {
  const ipc = read('main/ipc.mjs');
  it('paying and the billing page both open in the sheet', () => {
    expect(ipc).toMatch(/cloudCall\('payForCloud', \{ plan \}, \{ sheet: true \}\)/);
    expect(ipc).toMatch(/cloudCall\('openCloudBilling', \{\}, \{ sheet: true \}\)/);
    expect(ipc).toContain('openStripeSheet(');
  });
  it('the sheet runs with no access to the app and keeps nothing between payments', () => {
    const sheet = read('main/cloud/stripe-window.mjs');
    expect(sheet).toMatch(/nodeIntegration: false/);
    expect(sheet).toMatch(/contextIsolation: true/);
    expect(sheet).toMatch(/sandbox: true/);
    expect(sheet).not.toMatch(/partition: 'persist:/);
  });
  it('no screen sends anyone to Stripe in their browser any more', () => {
    for (const f of ['renderer/src/components/Settings.tsx', 'renderer/src/components/CloudSetup.tsx', 'renderer/src/cloud-setup.ts']) {
      expect(read(f)).not.toMatch(/Stripe[^.\n]*in your browser|Checkout is open in your browser|Finish on Stripe/);
    }
  });
});
