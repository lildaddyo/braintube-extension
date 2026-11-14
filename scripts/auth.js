// BrainTube Extension - Authentication Module
import { CONFIG, buildUrl, getValidSession, saveSession as storeSession, clearSession } from './config.js';
import { t } from './i18n.js';

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
      throw new Error(error.error_description || error.msg || t('signInFailed'));
    }
    
    const data = await response.json();
    await saveSession(data);
    
    console.log('✅ Signed in');
    return data;
  } catch (error) {
    console.error('❌ Sign in error:', error);
    throw error;
  }
}

// Save the session (one key in chrome.storage.session, see config.js) for either sign-in method.
export async function saveSession(session) {
  await storeSession(session);
}

// Get current session, refreshed when its access token is about to expire
export async function getSession() {
  try {
    return await getValidSession();
  } catch {
    return null;
  }
}

// Sign out — clears the session (and any copy an older version left in chrome.storage.local)
export async function signOut() {
  await clearSession();
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


