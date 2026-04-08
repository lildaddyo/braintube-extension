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

// Helper to get auth headers — checks bt_session (Google OAuth) then session (email/password)
export async function getHeaders() {
  const all = await chrome.storage.local.get(null);
  console.log('[BrainTube] config.getHeaders — ALL storage keys:', Object.keys(all));
  const session = all['bt_session'] || all['session'];
  const accessToken = session?.access_token;
  console.log('[BrainTube] config.getHeaders — source:', all['bt_session'] ? 'bt_session' : all['session'] ? 'session' : 'NONE', '| token:', accessToken ? accessToken.substring(0, 20) + '...' : 'MISSING');
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'apikey': CONFIG.SUPABASE_ANON_KEY
  };
}

// Helper to get the current session — checks bt_session then session
export async function getSession() {
  const stored = await chrome.storage.local.get(['bt_session', 'session']);
  return stored.bt_session || stored.session || null;
}
