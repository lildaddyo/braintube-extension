/**
 * BrainTube content script for brain-tube.com
 *
 * Reads the Supabase session token from localStorage and makes it available
 * to the background service worker so other extension pages can authenticate
 * without the user manually pasting API keys.
 *
 * The Supabase client stores the session under:
 *   sb-{project_ref}-auth-token
 * where project_ref = iqjnmmtvhyavgrsxpoao
 */
(function () {
  'use strict';

  const SUPABASE_STORAGE_KEY = 'sb-iqjnmmtvhyavgrsxpoao-auth-token';

  // ── Token reader ──────────────────────────────────────────────────────────
  function readToken() {
    try {
      const raw = localStorage.getItem(SUPABASE_STORAGE_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      // Supabase stores either the session directly or under a 'currentSession' key
      const accessToken = session?.access_token ?? session?.currentSession?.access_token;
      if (!accessToken) return null;
      // Check expiry — don't hand out an already-expired token
      const expiry = getJwtExpiry(accessToken);
      if (expiry && expiry < Date.now()) return null;
      return accessToken;
    } catch {
      return null;
    }
  }

  function getJwtExpiry(token) {
    try {
      // atob requires standard base64; JWT uses url-safe base64
      const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(b64));
      return (payload.exp ?? 0) * 1000;
    } catch {
      return 0;
    }
  }

  // ── Push token to background (caches it for offline use) ─────────────────
  function pushTokenToBackground() {
    const token = readToken();
    chrome.runtime.sendMessage({
      action: 'auth_token_update',
      token,        // null means logged out
    }).catch(() => {});
  }

  // ── Respond to direct token requests (background polling open tab) ────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'get_auth_token') {
      sendResponse({ token: readToken() });
      return true;
    }
  });

  // ── Watch localStorage for login / logout / token refresh ─────────────────
  // The 'storage' event fires for changes made by other tabs/windows.
  // For same-page changes we poll briefly on load instead.
  window.addEventListener('storage', (event) => {
    if (event.key === SUPABASE_STORAGE_KEY) {
      pushTokenToBackground();
    }
  });

  // Initial push — also retries once after 2 s in case Supabase hasn't
  // written the token yet when the content script first runs.
  pushTokenToBackground();
  setTimeout(pushTokenToBackground, 2000);
})();
