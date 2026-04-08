// BrainTube Extension - Authentication Module
import { CONFIG, buildUrl } from './config.js';

// Sign in with email/password
export async function signIn(email, password) {
  try {
    const response = await fetch(
      buildUrl(`${CONFIG.ENDPOINTS.AUTH}/token?grant_type=password`),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': CONFIG.SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ email, password })
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error_description || error.msg || 'Sign in failed');
    }
    
    const data = await response.json();
    await saveSession(data);
    
    console.log('✅ Signed in:', data.user.email);
    return data;
  } catch (error) {
    console.error('❌ Sign in error:', error);
    throw error;
  }
}

// Save session to storage
export async function saveSession(session) {
  await chrome.storage.local.set({ session });
  console.log('💾 Session saved');
}

// Get current session — checks bt_session (Google OAuth) then session (email/password)
export async function getSession() {
  const result = await chrome.storage.local.get(['session', 'bt_session']);
  return result.bt_session || result.session || null;
}

// Sign out — clears both session keys
export async function signOut() {
  await chrome.storage.local.remove(['session', 'bt_session']);
  console.log('👋 Signed out');
}

// Check if session is valid
export async function isAuthenticated() {
  const session = await getSession();
  if (!session || !session.access_token) {
    return false;
  }
  
  // Try a simple authenticated request
  try {
    const response = await fetch(
      buildUrl(`${CONFIG.ENDPOINTS.REST}/`),
      {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': CONFIG.SUPABASE_ANON_KEY
        }
      }
    );
    
    return response.status !== 401;
  } catch {
    return false;
  }
}

// Get user info from session
export async function getCurrentUser() {
  const session = await getSession();
  return session?.user || null;
}

// ── Google Sign-In (direct Google OAuth → Supabase token exchange) ────────────
// Bypasses Supabase's redirect chain entirely. Flow:
//   1. chrome.identity.launchWebAuthFlow → Google OAuth → extension redirect URI
//   2. Parse Google access_token from redirect fragment
//   3. Exchange with Supabase /auth/v1/token?grant_type=id_token
//   4. Save Supabase session as bt_session

// FILL IN: your Google OAuth Client ID from Google Cloud Console
// (APIs & Services → Credentials → OAuth 2.0 Client IDs)
const GOOGLE_CLIENT_ID     = 'YOUR_GOOGLE_CLIENT_ID';

const GOOGLE_REDIRECT_URI  = 'https://fpnkboegjcldbadodocoinakhlafbdak.chromiumapp.org/';
const GOOGLE_SUPABASE_URL  = 'https://iqjnmmtvhyavgrsxpoao.supabase.co';
const GOOGLE_SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlxam5tbXR2aHlhdmdyc3hwb2FvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDk4MzE3NjgsImV4cCI6MjAyNTQwNzc2OH0.JiMKbCPMvxdQN36DFuXBRjYKuC0TqFsEqRWCbVsNODs';

export async function signInWithGoogle() {
  // Step 1: Get Google access_token directly — no Supabase redirect involved
  const authUrl =
    `https://accounts.google.com/o/oauth2/auth` +
    `?client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
    `&response_type=token` +
    `&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}` +
    `&scope=${encodeURIComponent('email profile')}`;

  let responseUrl;
  try {
    responseUrl = await chrome.identity.launchWebAuthFlow({
      url:         authUrl,
      interactive: true,
    });
  } catch (err) {
    throw new Error('Google sign-in was cancelled or failed.');
  }

  if (!responseUrl) throw new Error('No response from Google sign-in.');
  console.log('[BrainTube] Google responseUrl:', responseUrl);

  // Step 2: Parse Google access_token from redirect fragment
  const url         = new URL(responseUrl);
  const hashParams  = new URLSearchParams(url.hash ? url.hash.slice(1) : '');
  const queryParams = new URLSearchParams(url.search ? url.search.slice(1) : '');
  const googleToken = hashParams.get('access_token') || queryParams.get('access_token');

  if (!googleToken) {
    const err = hashParams.get('error') || queryParams.get('error') || 'unknown';
    throw new Error(`Google did not return an access token. Error: ${err}`);
  }

  // Step 3: Exchange Google access_token with Supabase
  const tokenResp = await fetch(
    `${GOOGLE_SUPABASE_URL}/auth/v1/token?grant_type=id_token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': GOOGLE_SUPABASE_ANON,
      },
      body: JSON.stringify({ provider: 'google', token: googleToken }),
    }
  );

  if (!tokenResp.ok) {
    const err = await tokenResp.json().catch(() => ({}));
    throw new Error(`Supabase token exchange failed: ${err?.error_description || err?.msg || tokenResp.status}`);
  }

  const data = await tokenResp.json();

  // Step 4: Save Supabase session as bt_session
  const session = {
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_in:    data.expires_in ?? 3600,
    token_type:    'bearer',
    user:          data.user,
  };

  await chrome.storage.local.set({ bt_session: session });
  console.log('✅ Signed in with Google:', data.user?.email);
  return session;
}

