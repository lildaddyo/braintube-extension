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

// The database region (eu-west-1, Ireland). Supabase runs an edge function in the region nearest the
// caller unless told otherwise, so a call from Asia ran brain-chat and every function it calls far from
// the database (p50 17-22 s vs 1.5 s, edge logs 2026-11-02). Same pin as the web app
// (dark-n-cozy src/lib/function-region.ts): the query parameter, not the x-region header, which the
// functions' CORS doesn't allow.
export const FUNCTION_REGION = 'eu-west-1';

// Adds forceFunctionRegion to an edge function URL that has none; any other URL comes back unchanged.
export function pinFunctionUrl(url) {
  if (!url.includes('/functions/v1/') || url.includes('forceFunctionRegion=')) return url;
  return `${url}${url.includes('?') ? '&' : '?'}forceFunctionRegion=${FUNCTION_REGION}`;
}

// Helper to build full URL (edge functions pinned to the database region)
export function buildUrl(endpoint) {
  return pinFunctionUrl(`${CONFIG.SUPABASE_URL}${endpoint}`);
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

// ── Session storage (audit 2026-11-01, finding 3) ────────────────────────────────────────────────────────
// The Supabase session (access + refresh token) lives in chrome.storage.session under one key, with access
// level TRUSTED_CONTEXTS (the service worker sets it at start), so content scripts cannot read it; they ask
// the service worker to make authenticated calls. storage.session survives service-worker restarts and is
// kept in memory only, so it is gone when the browser quits: the user signs in again (Google or email) after
// a browser restart. Older versions kept the session in chrome.storage.local under "session" and
// "bt_session"; the first read moves it here and deletes those keys.
export const SESSION_KEY = 'bt_session';
const LEGACY_LOCAL_KEYS = ['session', 'bt_session'];

/** Locks chrome.storage.session to extension pages and the service worker (content scripts excluded). */
export async function lockSessionStorage() {
  try { await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }); } catch { /* default is already TRUSTED_CONTEXTS */ }
}

export async function saveSession(session) {
  await chrome.storage.session.set({ [SESSION_KEY]: session });
}

export async function clearSession() {
  await chrome.storage.session.remove(SESSION_KEY);
  await chrome.storage.local.remove(LEGACY_LOCAL_KEYS);
}

// Moves a session left in chrome.storage.local by v1.6.1 or older into storage.session, once.
export async function migrateLegacySession() {
  const legacy = await chrome.storage.local.get(LEGACY_LOCAL_KEYS);
  const session = legacy.bt_session || legacy.session || null;
  if (Object.keys(legacy).length) await chrome.storage.local.remove(LEGACY_LOCAL_KEYS);
  if (session?.access_token) {
    await saveSession(session);
    return session;
  }
  return null;
}

// The current session as stored (not refreshed), or null.
export async function getSession() {
  const stored = await chrome.storage.session.get(SESSION_KEY);
  return stored[SESSION_KEY] || await migrateLegacySession();
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

// Exchange the refresh token for a new session and store it.
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
          await clearSession();
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
      await saveSession(fresh);
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
    await clearSession();
    return null;
  }
  return refreshSession(session);
}
