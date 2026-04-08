// BrainTube Extension - API Module
import { CONFIG, buildUrl } from './config.js';

// Read token directly from storage — bypasses any config.js import chain issues.
// Checks bt_session (Google OAuth) then session (email/password), both keys
// are always written together by auth.js and auth-handler.js.
async function getHeaders() {
  const stored = await chrome.storage.local.get(['bt_session', 'session']);
  const session = stored.bt_session || stored.session;
  const token = session?.access_token;
  console.log('[BrainTube] api.js getHeaders — source:', stored.bt_session ? 'bt_session' : stored.session ? 'session' : 'NONE', '| token:', token ? token.substring(0, 20) + '...' : 'MISSING');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'apikey': CONFIG.SUPABASE_ANON_KEY,
  };
}

// Save YouTube video
export async function processYouTube(url, videoId) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  let response;
  try {
    response = await fetch(
      buildUrl(CONFIG.ENDPOINTS.PROCESS_YOUTUBE),
      {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({ url, videoId }),
        signal: controller.signal,
      }
    );
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Video save timed out after 30 seconds. The server may be busy — try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Server error ${response.status}`);
  }

  return await response.json();
}

// Generate AI summary for an item
export async function generateSummary(itemId) {
  const response = await fetch(
    buildUrl(CONFIG.ENDPOINTS.GENERATE_SUMMARY),
    {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({ itemId })
    }
  );
  
  if (!response.ok) {
    throw new Error('Failed to generate summary');
  }
  
  return await response.json();
}

// Quick search
export async function quickSearch(query, userId) {
  const response = await fetch(
    buildUrl(CONFIG.ENDPOINTS.QUICK_SEARCH),
    {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({ query, userId })
    }
  );
  
  if (!response.ok) {
    throw new Error('Search failed');
  }
  
  return await response.json();
}

// AI chat about a video
export async function chat(message, itemId) {
  const response = await fetch(
    buildUrl(CONFIG.ENDPOINTS.CHAT),
    {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({ message, itemId })
    }
  );
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Chat API error:', response.status, errorText);
    throw new Error(`Chat failed: ${response.status}`);
  }
  
  const data = await response.json();
  return data.reply || data.response || data.message;
}

// Check subscription status
export async function checkSubscription() {
  const response = await fetch(
    buildUrl(CONFIG.ENDPOINTS.CHECK_SUBSCRIPTION),
    {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({})
    }
  );
  
  return await response.json();
}

// Track event
export async function trackEvent(eventName, eventData = {}) {
  try {
    await fetch(
      buildUrl(CONFIG.ENDPOINTS.TRACK),
      {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({
          event_name: eventName,
          event_data: eventData,
          page_path: '/extension'
        })
      }
    );
  } catch (error) {
    console.error('Track event failed:', error);
  }
}

// Database queries
export async function getItem(videoId, userId) {
  const response = await fetch(
    buildUrl(`${CONFIG.ENDPOINTS.REST}/${CONFIG.TABLES.ITEMS}?video_id=eq.${videoId}&user_id=eq.${userId}&select=*`),
    { headers: await getHeaders() }
  );
  
  if (!response.ok) return null;
  
  const data = await response.json();
  return data[0] || null;
}

export async function getTranscriptSegments(itemId) {
  const response = await fetch(
    buildUrl(`${CONFIG.ENDPOINTS.REST}/${CONFIG.TABLES.TRANSCRIPT_SEGMENTS}?item_id=eq.${itemId}&order=segment_index&select=*`),
    { headers: await getHeaders() }
  );
  
  if (!response.ok) return [];
  return await response.json();
}

export async function getHighlights(itemId) {
  const response = await fetch(
    buildUrl(`${CONFIG.ENDPOINTS.REST}/${CONFIG.TABLES.HIGHLIGHTS}?item_id=eq.${itemId}&select=*`),
    { headers: await getHeaders() }
  );
  
  if (!response.ok) return [];
  return await response.json();
}

export async function createHighlight(itemId, userId, text, segmentId = null) {
  const response = await fetch(
    buildUrl(`${CONFIG.ENDPOINTS.REST}/${CONFIG.TABLES.HIGHLIGHTS}`),
    {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({
        item_id: itemId,
        user_id: userId,
        text: text,
        segment_id: segmentId,
        color: '#e9d5ff'
      })
    }
  );
  
  return await response.json();
}
