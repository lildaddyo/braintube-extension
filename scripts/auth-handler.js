// BrainTube - Google OAuth handler
// Runs inside auth.html (a persistent tab) so it survives popup close.
// Flow: launchWebAuthFlow → parse id_token from hash → exchange with Supabase →
//       save bt_session → close tab. Popup picks up session via storage.onChanged.

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
  const manifest    = chrome.runtime.getManifest();
  const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`;

  console.log('[BrainTube] auth-handler redirect_uri:', redirectUri);

  const url = new URL('https://accounts.google.com/o/oauth2/auth');
  url.searchParams.set('client_id',     manifest.oauth2.client_id);
  url.searchParams.set('response_type', 'token id_token');
url.searchParams.set('redirect_uri',  redirectUri);
  url.searchParams.set('scope',         manifest.oauth2.scopes.join(' '));
  const nonce = Math.random().toString(36).substring(2);
  url.searchParams.set('nonce', nonce);

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

      // Split on '#' and pass the raw string directly to URLSearchParams.
      // Do NOT use new URL().hash — it preserves the leading '#' which makes
      // the first key "#iss" instead of "iss", breaking all param lookups.
      const hashString = redirectedTo.split('#')[1] || '';
      const params     = new URLSearchParams(hashString);
      const idToken    = params.get('id_token');

      console.log('[BrainTube] id_token extracted:', idToken ? idToken.substring(0, 20) + '...' : 'NOT FOUND');

      if (!idToken) {
        const err = params.get('error') ?? 'id_token not found in redirect hash';
        console.error('[BrainTube] Could not extract id_token. hashString:', hashString);
        setStatus(`Could not extract id_token from redirect: ${err}`, true);
        return;
      }

      setStatus('Signing in to BrainTube…');

      try {
        const res = await fetch(
          `${SUPABASE_URL}/auth/v1/token?grant_type=id_token`,
          {
            method:  'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey':       SUPABASE_ANON,
            },
            body: JSON.stringify({ provider: 'google', id_token: idToken, nonce }),
          }
        );

        console.log('[BrainTube] Supabase status:', res.status);
        const data = await res.json();
        console.log('[BrainTube] Supabase response:', JSON.stringify(data));

        if (!res.ok || !data.access_token) {
          throw new Error(data.error_description ?? data.msg ?? `HTTP ${res.status}`);
        }

        const session = {
          access_token:  data.access_token,
          refresh_token: data.refresh_token,
          expires_in:    data.expires_in ?? 3600,
          token_type:    'bearer',
          user:          data.user,
        };

        await chrome.storage.local.set({ bt_session: session });
        console.log('✅ Signed in:', data.user?.email);

        setStatus(`Signed in as ${data.user?.email}. Closing…`);
        setTimeout(() => window.close(), 1200);

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[BrainTube] Token exchange failed:', msg);
        setStatus(`Sign-in failed: ${msg}`, true);
      }
    }
  );
}

// Start immediately when the page loads
document.addEventListener('DOMContentLoaded', runGoogleAuth);
