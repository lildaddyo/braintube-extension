// BrainTube Extension - Configuration

export const CONFIG = {
  SUPABASE_URL: 'https://pmwuwzoqnhqqqseddzes.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtd3V3em9xbmhxcXFzZWRkemVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2NTkzNzEsImV4cCI6MjA4NDIzNTM3MX0.iImRcTa1_fTCNeG6JzUdRY7KTgN19hCVcSYnrP3kUEE',
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
  const stored = await chrome.storage.local.get(['bt_session', 'session']);
  const session = stored.bt_session || stored.session;
  const accessToken = session?.access_token;
  
  return {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'apikey': CONFIG.SUPABASE_ANON_KEY
  };
}
