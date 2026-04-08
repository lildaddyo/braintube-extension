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

// ── Google Sign-In ────────────────────────────────────────────────────────────
// The popup closes during OAuth which would kill the flow, so we delegate
// launchWebAuthFlow to the persistent service worker.
// Popup calls this → sends START_GOOGLE_AUTH → listens for AUTH_SUCCESS.

export function signInWithGoogle() {
  return new Promise((resolve, reject) => {
    // Ask the service worker to run the flow
    chrome.runtime.sendMessage({ type: 'START_GOOGLE_AUTH' });

    // Listen for the result — service worker broadcasts AUTH_SUCCESS or AUTH_ERROR
    function onMessage(msg) {
      if (msg.type === 'AUTH_SUCCESS') {
        chrome.runtime.onMessage.removeListener(onMessage);
        resolve(msg.session);
      } else if (msg.type === 'AUTH_ERROR') {
        chrome.runtime.onMessage.removeListener(onMessage);
        reject(new Error(msg.error));
      }
    }
    chrome.runtime.onMessage.addListener(onMessage);

    // Timeout after 2 minutes in case the user never completes the flow
    setTimeout(() => {
      chrome.runtime.onMessage.removeListener(onMessage);
      reject(new Error('Google sign-in timed out.'));
    }, 120_000);
  });
}

