// BrainTube Extension - Configuration

export const CONFIG = {
  SUPABASE_URL: 'https://iqjnmmtvhyavgrsxpoao.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlxam5tbXR2aHlhdmdyc3hwb2FvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MTE1NTEsImV4cCI6MjA4NzE4NzU1MX0.GF31S85XbTzYSHjWxjTasXguJ5GwasyQgdsLR9fBJtE',
  WEB_APP_URL: 'https://brain-tube.com',
  
  // API Endpoints
  ENDPOINTS: {
    PROCESS_YOUTUBE: '/functions/v1/process-youtube',
    GENERATE_SUMMARY: '/functions/v1/generate-summary',
    QUICK_SEARCH: '/functions/v1/quick-search',
    SEARCH: '/functions/v1/search',
    CHAT: '/functions/v1/chat',
    CHECK_SUBSCRIPTION: '/functions/v1/check-subscription',
    TRACK: '/functions/v1/track',
    PROCESS_CONTENT: '/functions/v1/process-content',
    WHISPER_TRANSCRIBE: '/functions/v1/whisper-transcribe',
    
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

// Session handling. Supabase access tokens live ~1 h; without a refresh every call
// returns 401 "unauthorized" an hour after sign-in. getSession() refreshes the
// token when it is expired or about to expire, and stores the new pair under both keys.
function tokenExpiry(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64)).exp * 1000;
  } catch {
    return 0;
  }
}

let refreshInFlight = null;

async function refreshSession(session) {
  const res = await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': CONFIG.SUPABASE_ANON_KEY },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!res.ok) {
    console.warn('[BrainTube] token refresh failed:', res.status);
    return null;
  }
  const data = await res.json();
  if (!data.access_token) return null;
  const fresh = { ...session, ...data };
  await chrome.storage.local.set({ session: fresh, bt_session: fresh });
  return fresh;
}

// Current session, refreshed if its access token expires within 60 s.
export async function getSession() {
  const stored = await chrome.storage.local.get(['bt_session', 'session']);
  const session = stored.bt_session || stored.session || null;
  if (!session?.access_token) return session;
  if (tokenExpiry(session.access_token) - Date.now() > 60_000) return session;
  if (!session.refresh_token) return session;
  // One refresh at a time: Supabase rotates refresh tokens, a parallel second use fails.
  refreshInFlight ??= refreshSession(session).finally(() => { refreshInFlight = null; });
  return (await refreshInFlight) || session;
}

export async function getAccessToken() {
  return (await getSession())?.access_token || null;
}

// Auth headers with a fresh token.
export async function getHeaders() {
  const accessToken = await getAccessToken();
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'apikey': CONFIG.SUPABASE_ANON_KEY
  };
}
