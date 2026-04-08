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

// Sign in with Google via Supabase OAuth + chrome.identity
const GOOGLE_SUPABASE_URL  = 'https://iqjnmmtvhyavgrsxpoao.supabase.co';
const GOOGLE_SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlxam5tbXR2aHlhdmdyc3hwb2FvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDk4MzE3NjgsImV4cCI6MjAyNTQwNzc2OH0.JiMKbCPMvxdQN36DFuXBRjYKuC0TqFsEqRWCbVsNODs';

export async function signInWithGoogle() {
  const redirectUrl = chrome.identity.getRedirectURL();

  const authUrl =
    `${GOOGLE_SUPABASE_URL}/auth/v1/authorize` +
    `?provider=google` +
    `&redirect_to=${encodeURIComponent(redirectUrl)}`;

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

  // Supabase returns tokens in the URL fragment
  const url    = new URL(responseUrl);
  const params = new URLSearchParams(url.hash ? url.hash.slice(1) : url.search.slice(1));

  const accessToken  = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const expiresIn    = params.get('expires_in');

  if (!accessToken) throw new Error('Google sign-in did not return an access token.');

  // Fetch user record from Supabase
  const userResp = await fetch(`${GOOGLE_SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'apikey': GOOGLE_SUPABASE_ANON,
    },
  });

  if (!userResp.ok) throw new Error('Failed to fetch user after Google sign-in.');
  const user = await userResp.json();

  const session = {
    access_token:  accessToken,
    refresh_token: refreshToken,
    expires_in:    expiresIn ? parseInt(expiresIn, 10) : 3600,
    token_type:    'bearer',
    user,
  };

  await chrome.storage.local.set({ bt_session: session });
  console.log('✅ Signed in with Google:', user.email);
  return session;
}

