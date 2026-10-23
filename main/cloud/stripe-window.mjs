// STRIPE'S OWN PAGES, IN A SHEET ON THE APP'S WINDOW.
//
// Stripe's embeddable checkout needs an HTTPS page and the app's renderer is
// not one, so its hosted checkout and billing pages open here instead of in
// the browser. The sheet closes itself when Stripe sends the person back to
// the cloud server's /v1/paid, the address the server gives as the success,
// cancel and return link. It has no access to the app, and nothing it stores
// outlives the app's run.

/** Where a page in the sheet is going: done, cancelled, fine, or not allowed. */
export function stripeNavigation(url, gateway) {
  let to; let home;
  try { to = new URL(url); home = new URL(gateway); } catch { return 'refuse'; }
  if (to.protocol !== 'https:') return 'refuse';
  if (to.origin === home.origin && to.pathname === '/v1/paid') return to.searchParams.get('cancelled') === '1' ? 'cancelled' : 'paid';
  return 'stay';
}

const SHEET = { width: 480, height: 760 };

/**
 * Opens `url` in a sheet on `parent` and settles with how it ended: 'paid',
 * 'cancelled', or 'closed' (Escape, or the window closed some other way).
 */
export function openStripeSheet({ BrowserWindow, shell, parent, url, gateway, log = () => {} }) {
  return new Promise((resolve) => {
    let ended = null;
    const win = new BrowserWindow({
      parent, modal: true, show: false, ...SHEET,
      resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
      title: 'Stripe', backgroundColor: '#ffffff', autoHideMenuBar: true,
      webPreferences: { partition: 'agentbox-stripe', nodeIntegration: false, contextIsolation: true, sandbox: true, webviewTag: false },
    });
    const end = (how) => {
      if (ended) return;
      ended = how;
      if (!win.isDestroyed()) win.close();
    };
    const watch = (event, to) => {
      const where = stripeNavigation(to, gateway);
      if (where === 'stay') return;
      event.preventDefault();
      if (where === 'refuse') { log(`stripe sheet: refused ${String(to).slice(0, 80)}`); return; }
      end(where);
    };
    win.webContents.on('will-navigate', watch);
    win.webContents.on('will-redirect', watch);
    win.webContents.on('did-navigate', (_e, to) => {
      const where = stripeNavigation(to, gateway);
      if (where === 'paid' || where === 'cancelled') end(where);
    });
    // A link meant for a new tab (Stripe's own terms) opens in the browser.
    win.webContents.setWindowOpenHandler(({ url: to }) => {
      if (stripeNavigation(to, gateway) === 'stay') void shell.openExternal(to);
      return { action: 'deny' };
    });
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape') { event.preventDefault(); end('closed'); }
    });
    win.once('ready-to-show', () => { if (!win.isDestroyed()) win.show(); });
    win.on('closed', () => resolve(ended || 'closed'));
    win.loadURL(url).catch((err) => { log(`stripe sheet: ${err?.message || err}`); end('closed'); });
  });
}
