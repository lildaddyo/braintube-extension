// BrainTube - Google OAuth handler
// Runs inside auth.html (a persistent tab) so it survives popup close.
//
// Flow:
//   1. Build Google OAuth URL directly (accounts.google.com) — bypasses
//      Supabase's /auth/v1/authorize which 302s to brain-tube.com.
//   2. launchWebAuthFlow → Google login → redirect back with id_token in hash.
//   3. Exchange id_token with Supabase /auth/v1/token?grant_type=id_token.
//   4. Save bt_session to chrome.storage.local.
//   5. Close this tab via chrome.tabs.remove (window.close unreliable here).
//   Popup detects session via chrome.storage.onChanged — no new tabs opened.

const SUPABASE_URL  = 'https://iqjnmmtvhyavgrsxpoao.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlxam5tbXR2aHlhdmdyc3hwb2FvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MTE1NTEsImV4cCI6MjA4NzE4NzU1MX0.GF31S85XbTzYSHjWxjTasXguJ5GwasyQgdsLR9fBJtE';
const GOOGLE_CLIENT_ID = '605016349499-803pbseargk44vm20k6qgv1th7fqsarm.apps.googleusercontent.com';

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
  // chrome.identity.getRedirectURL() (no suffix) returns the canonical
  // chromiumapp.org URL that Chrome registers as the OAuth redirect for this
  // extension. This must match exactly what is registered in:
  //   Google Cloud Console → OAuth 2.0 Client → Authorized redirect URIs
  //   Supabase Dashboard → Auth → Providers → Google → Authorized Client IDs
  const redirectUri = chrome.identity.getRedirectURL();

  console.log('[BrainTube] auth-handler redirect_uri:', redirectUri);
  console.log('[BrainTube] extension id:', chrome.runtime.id);

  // Nonce handling — Supabase's grant_type=id_token verification works like this:
  //   1. We generate a raw random nonce.
  //   2. We SHA-256 hash it and send the HASH to Google as the nonce param.
  //   3. Google embeds the hashed nonce in the id_token JWT's `nonce` claim.
  //   4. We send the RAW nonce to Supabase in the token exchange body.
  //   5. Supabase hashes the raw nonce and compares it to the JWT claim → match.
  // Sending the same plain value to both sides breaks step 5 ("Nonces mismatch").
  const rawNonce = crypto.randomUUID();

  const encoder    = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(rawNonce));
  const hashedNonce = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Build the Google OAuth URL directly. Using accounts.google.com bypasses
  // Supabase's /auth/v1/authorize endpoint entirely, which is what causes the
  // 302 redirect to brain-tube.com. Google returns the id_token directly in
  // the redirect URL hash — launchWebAuthFlow captures it without any browser
  // tab ever navigating to brain-tube.com.
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id',     GOOGLE_CLIENT_ID);
  url.searchParams.set('response_type', 'id_token');
  url.searchParams.set('redirect_uri',  redirectUri);
  url.searchParams.set('scope',         'openid email profile');
  url.searchParams.set('nonce',         hashedNonce); // hashed → Google embeds in JWT

  console.log('[BrainTube] Google OAuth URL (no secret):', url.origin + url.pathname + '?client_id=...&response_type=id_token&redirect_uri=' + redirectUri);
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
      console.log('[BrainTube] Hash:',   redirectedTo.split('#')[1] ?? 'none');
      console.log('[BrainTube] Search:', redirectedTo.split('?')[1] ?? 'none');

      // Google returns id_token in the URL hash fragment.
      // Do NOT use new URL().hash — it keeps the leading '#', which makes the
      // first key "#id_token" instead of "id_token", breaking the lookup.
      const hashString = redirectedTo.split('#')[1] || '';
      const params     = new URLSearchParams(hashString);
      const idToken    = params.get('id_token');

      console.log('[BrainTube] id_token extracted:', idToken ? idToken.substring(0, 20) + '...' : 'NOT FOUND');

      if (!idToken) {
        const err = params.get('error') ?? 'id_token not found in redirect hash';
        console.error('[BrainTube] Could not extract id_token. hashString:', hashString);
        setStatus(`Sign-in failed: ${err}`, true);
        return;
      }

      setStatus('Signing in to BrainTube…');

      try {
        // Exchange the Google id_token for a Supabase session.
        // This is a direct server-to-server style call — no browser redirect,
        // no brain-tube.com involvement.
        const res = await fetch(
          `${SUPABASE_URL}/auth/v1/token?grant_type=id_token`,
          {
            method:  'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey':       SUPABASE_ANON,
            },
            body: JSON.stringify({
              provider:  'google',
              id_token:  idToken,
              nonce:     rawNonce, // raw nonce — Supabase hashes this and checks against JWT claim
            }),
          }
        );

        console.log('[BrainTube] Supabase token status:', res.status);
        const data = await res.json();
        console.log('[BrainTube] Supabase response keys:', Object.keys(data));

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

        // Write both keys so getHeaders() in config.js always finds the token
        // regardless of which code path reads it.
        await chrome.storage.local.set({ bt_session: session, session: session });
        console.log('✅ Signed in:', data.user?.email);

        // Close this tab. window.close() is unreliable for tabs opened via
        // chrome.tabs.create() — use chrome.tabs.remove() instead.
        // Popup detects the session via storage.onChanged automatically.
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
        console.error('[BrainTube] Token exchange failed:', msg);
        setStatus(`Sign-in failed: ${msg}`, true);
      }
    }
  );
}

// Start immediately when the page loads
document.addEventListener('DOMContentLoaded', runGoogleAuth);
