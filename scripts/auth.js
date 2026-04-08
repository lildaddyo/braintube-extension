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

// Get current session
export async function getSession() {
  const result = await chrome.storage.local.get(['session']);
  return result.session || null;
}

// Sign out
export async function signOut() {
  await chrome.storage.local.remove(['session']);
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
