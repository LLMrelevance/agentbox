// WHAT AN EMBEDDED PAGE MAY DO, DECIDED BELOW THE TAG THAT ASKED.
//
// The window has `webviewTag: true`, so the screen can attach a `<webview>`.
// Everything a webview is allowed to do comes off attributes on that tag, and
// attributes are written in the renderer, which is the half of the app most
// likely to gain a line in a hurry. This runs in the main process on
// `will-attach-webview`, after the attributes have been read and before the
// guest exists, and it pins the dangerous half of them whatever the tag said.
//
// THE PRELOAD IS THE ONE THAT MATTERS. `preload.cjs` is the bridge the app's
// own page talks to the store through: it can claim rows, read documents, spawn
// workers. A page off the web holding that holds everything the person holds.
// It has never been set on a webview here; nothing stopped it being set.
//
// The idea came from the outside pull request this work grew out of
// (savannahfeder/agentbox#31), which hardened the same seam. The code is ours.
//
// WHAT IS DELIBERATELY NOT TOUCHED: the partition. It is the one preference
// that is a decision about WHERE a page's sign-ins go rather than about what
// the page may reach, and flattening it would merge the website pane's store
// into whatever the default is. shared/websites.mjs holds that name and says
// why it is not the agent browser's.
//
// tests/a-website-in-the-pane-cannot-reach-the-app.test.mjs

/**
 * Pin one attaching webview to the floor. `webPreferences` and `params` are
 * Electron's own objects from `will-attach-webview`, mutated in place, which
 * is how that event is answered.
 */
export function hardenAttachedWebview(webPreferences, params) {
  if (webPreferences) {
    // Nothing of ours rides into the page.
    delete webPreferences.preload;
    delete webPreferences.preloadURL;
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.nodeIntegrationInWorker = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
    webPreferences.experimentalFeatures = false;
    webPreferences.enableBlinkFeatures = '';

    // NO PAGE IN AN EMBEDDED BROWSER STARTS SOUND BEFORE SHE HAS CLICKED IN
    // IT. This rule was already on this event and is kept here with the rest,
    // so one function is the whole answer to "what is true of every webview".
    // Measured 2026-09-10 on Electron 43 in a hidden webview on a YouTube
    // watch page: default, the video ran from 3s to 15s; with this it sat
    // paused at 0 for all 16s. A click anywhere in the page is activation, so
    // pressing play still works.
    webPreferences.autoplayPolicy = 'document-user-activation-required';
  }
  if (params) {
    // A window the guest opens for itself would be a window with none of the
    // above. Links that want one go out to the real browser instead
    // (setWindowOpenHandler in main/main.mjs).
    params.allowpopups = false;
    params.nodeintegration = false;
    params.nodeintegrationinsubframes = false;
  }
  return webPreferences;
}
