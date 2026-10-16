// BrainTube Extension - Configuration

export const CONFIG = {
  SUPABASE_URL: 'https://iqjnmmtvhyavgrsxpoao.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_DNbHoP91pM0GRnLcEoOi_A_S2mz5eP1',
  // The web app lives on app.brain-tube.com; brain-tube.com is the marketing
  // site and returns 404 for /library and /search.
  WEB_APP_URL: 'https://app.brain-tube.com',
  
  // API Endpoints
  ENDPOINTS: {
    PROCESS_YOUTUBE: '/functions/v1/process-youtube',
    PROCESS_CONTENT: '/functions/v1/process-content',
    GENERATE_SUMMARY: '/functions/v1/generate-summary',
    QUICK_SEARCH: '/functions/v1/quick-search',
    SEARCH: '/functions/v1/search',
    ASK_ITEM_AI: '/functions/v1/ask-item-ai',
    CORPUS_CHAT: '/functions/v1/ai-router',
    CHECK_SUBSCRIPTION: '/functions/v1/check-subscription',
    TRACK: '/functions/v1/track',
    
    // Direct database access
    REST: '/rest/v1',
    AUTH: '/auth/v1'
  },
  
  // Database tables
  TABLES: {
    ITEMS: 'items',
    TRANSCRIPT_SEGMENTS: 'transcript_segments',
    HIGHLIGHTS: 'highlights',
    ITEM_CONCEPTS: 'item_concepts',
    ITEM_RECALL_PROMPTS: 'item_recall_prompts',
    TAGS: 'tags',
    ITEM_TAGS: 'item_tags',
    COLLECTIONS: 'collections',
    ITEM_COLLECTIONS: 'item_collections'
  },
  
  // Status values
  STATUS: {
    PROCESSING: 'processing',
    NEEDS_TRANSCRIPT: 'needs_transcript',
    NEEDS_SUMMARY: 'needs_summary',
    INDEXED: 'indexed',
    ERROR: 'error'
  }
};

// Helper to build full URL
export function buildUrl(endpoint) {
  return `${CONFIG.SUPABASE_URL}${endpoint}`;
}

// Helper to get auth headers — uses a fresh (auto-refreshed) access token
export async function getHeaders() {
  const session = await getValidSession();
  return {
    'Authorization': `Bearer ${session?.access_token}`,
    'Content-Type': 'application/json',
    'apikey': CONFIG.SUPABASE_ANON_KEY
  };
}

// Helper to get the current session as stored — checks bt_session then session
export async function getSession() {
  const stored = await chrome.storage.local.get(['bt_session', 'session']);
  return stored.bt_session || stored.session || null;
}

// Seconds-since-epoch expiry of a session's access token (JWT exp claim, else expires_at).
function tokenExpiry(session) {
  try {
    const payload = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const exp = JSON.parse(atob(payload)).exp;
    if (exp) return exp;
  } catch { /* fall through */ }
  return session.expires_at || 0;
}

let refreshInFlight = null;

// Exchange the refresh token for a new session and store it under both keys.
// A rejected refresh token (revoked, or already rotated) clears the session so the UI asks to sign in again.
export async function refreshSession(session) {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const res = await fetch(buildUrl(`${CONFIG.ENDPOINTS.AUTH}/token?grant_type=refresh_token`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': CONFIG.SUPABASE_ANON_KEY },
        body: JSON.stringify({ refresh_token: session.refresh_token })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.access_token) {
        if (res.status >= 400 && res.status < 500) {
          await chrome.storage.local.remove(['session', 'bt_session']);
        }
        throw new Error('Session expired — please sign in again');
      }
      const fresh = {
        access_token:  data.access_token,
        refresh_token: data.refresh_token,
        expires_in:    data.expires_in ?? 3600,
        expires_at:    data.expires_at,
        token_type:    'bearer',
        user:          data.user || session.user,
      };
      await chrome.storage.local.set({ bt_session: fresh, session: fresh });
      return fresh;
    })().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

// The current session with an access token valid for at least another minute, or null if signed out.
export async function getValidSession() {
  const session = await getSession();
  if (!session?.access_token) return null;
  if (tokenExpiry(session) - Date.now() / 1000 > 60) return session;
  if (!session.refresh_token) {
    await chrome.storage.local.remove(['session', 'bt_session']);
    return null;
  }
  return refreshSession(session);
}
