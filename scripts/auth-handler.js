// BrainTube - Google OAuth handler
// Runs inside auth.html (a persistent tab) so it survives popup close.
// Flow: launchWebAuthFlow → Supabase authorize (skip_http_redirect) →
//       parse access_token from redirect URL → save bt_session → close tab.
//       Popup picks up session via storage.onChanged.

const SUPABASE_URL  = 'https://iqjnmmtvhyavgrsxpoao.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlxam5tbXR2aHlhdmdyc3hwb2FvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MTE1NTEsImV4cCI6MjA4NzE4NzU1MX0.GF31S85XbTzYSHjWxjTasXguJ5GwasyQgdsLR9fBJtE';

const statusEl  = document.getElementById('status');
const spinnerEl = document.getElementById('spinner');

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  if (isError) {
    spinnerEl.classList.add('hidden');
    statusEl.style.color = '#fca5a5';
  }
}

async function runGoogleAuth() {
  // getRedirectURL('auth') appends /auth to the extension's chromiumapp.org base
  // URL — required for the skip_http_redirect flow so Supabase routes the token
  // response back to launchWebAuthFlow correctly.
  const redirectUri = chrome.identity.getRedirectURL('auth');

  console.log('[BrainTube] auth-handler redirect_uri:', redirectUri);
  console.log('[BrainTube] extension id:', chrome.runtime.id);

  // Use Supabase's OAuth authorize endpoint with skip_http_redirect=true.
  // Without skip_http_redirect, Supabase does a server-side 302 to the
  // configured site URL (brain-tube.com) with tokens appended — that's the
  // redirect bug. With skip_http_redirect=true, Supabase redirects the browser
  // directly to redirect_to with tokens in the URL fragment, which
  // launchWebAuthFlow captures without ever opening brain-tube.com.
  const url = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
  url.searchParams.set('provider',           'google');
  url.searchParams.set('redirect_to',        redirectUri);
  url.searchParams.set('skip_http_redirect', 'true');

  console.log('[BrainTube] Supabase authorize URL:', url.href);
  setStatus('Waiting for Google sign-in…');

  chrome.identity.launchWebAuthFlow(
    { url: url.href, interactive: true },
    async (redirectedTo) => {
      if (chrome.runtime.lastError || !redirectedTo) {
        const err = chrome.runtime.lastError?.message ?? 'Sign-in cancelled';
        console.error('[BrainTube] launchWebAuthFlow error:', err);
        setStatus('Sign-in cancelled or failed. You can close this tab.', true);
        return;
      }

      console.log('[BrainTube] Full redirect URL:', redirectedTo);
      console.log('[BrainTube] Hash:',   redirectedTo.split('#')[1]  ?? 'none');
      console.log('[BrainTube] Search:', redirectedTo.split('?')[1]  ?? 'none');

      // Parse tokens — try hash fragment first, fall back to query params.
      // Supabase returns tokens in the hash when skip_http_redirect=true,
      // but some versions / configurations use query params instead.
      const hashString  = redirectedTo.split('#')[1] || '';
      const hashParams  = new URLSearchParams(hashString);

      // Strip any trailing hash before splitting on '?' to avoid carrying it
      const queryString = (redirectedTo.split('?')[1] || '').split('#')[0];
      const queryParams = new URLSearchParams(queryString);

      const accessToken  = hashParams.get('access_token')  || queryParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token') || queryParams.get('refresh_token');
      const expiresIn    = hashParams.get('expires_in')    || queryParams.get('expires_in');

      console.log('[BrainTube] access_token extracted:', accessToken ? accessToken.substring(0, 20) + '...' : 'NOT FOUND');

      if (!accessToken) {
        const err = hashParams.get('error') || queryParams.get('error') || 'access_token not found in redirect';
        console.error('[BrainTube] Could not extract access_token. hashString:', hashString, 'queryString:', queryString);
        setStatus(`Could not extract access_token from redirect: ${err}`, true);
        return;
      }

      setStatus('Signing in to BrainTube…');

      try {
        // Fetch the user record for this token from Supabase
        const userRes = await fetch(
          `${SUPABASE_URL}/auth/v1/user`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'apikey':        SUPABASE_ANON,
            },
          }
        );

        console.log('[BrainTube] User fetch status:', userRes.status);
        const userData = await userRes.json();
        console.log('[BrainTube] User:', JSON.stringify(userData));

        if (!userRes.ok) {
          throw new Error(userData.error_description ?? userData.msg ?? `HTTP ${userRes.status}`);
        }

        const session = {
          access_token:  accessToken,
          refresh_token: refreshToken,
          expires_in:    parseInt(expiresIn ?? '3600', 10),
          token_type:    'bearer',
          user:          userData,
        };

        // Write both keys so getHeaders() in config.js always finds the token
        await chrome.storage.local.set({ bt_session: session, session: session });
        console.log('✅ Signed in:', userData.email);

        // Session saved — close this tab. window.close() is unreliable for tabs
        // opened via chrome.tabs.create(); use chrome.tabs.remove() instead.
        // Popup picks up the session via storage.onChanged automatically.
        try {
          const currentTab = await chrome.tabs.getCurrent();
          if (currentTab?.id != null) {
            chrome.tabs.remove(currentTab.id);
          } else {
            window.close();
          }
        } catch {
          window.close(); // last-resort fallback
        }

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[BrainTube] Session setup failed:', msg);
        setStatus(`Sign-in failed: ${msg}`, true);
      }
    }
  );
}

// Start immediately when the page loads
document.addEventListener('DOMContentLoaded', runGoogleAuth);
