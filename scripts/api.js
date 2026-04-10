// BrainTube Extension - API Module
import { CONFIG, buildUrl } from './config.js';

// Read token directly from storage — bypasses any config.js import chain issues.
// Checks bt_session (Google OAuth) then session (email/password), both keys
// are always written together by auth.js and auth-handler.js.
async function getHeaders() {
  chrome.storage.local.get(null, (items) => console.log('[BrainTube] ALL storage keys:', Object.keys(items), JSON.stringify(items).substring(0, 500)));
  const all = await chrome.storage.local.get(null);
  const session = all['bt_session'] || all['session'];
  const token = session?.access_token;
  console.log('[BrainTube] getHeaders — source:', all['bt_session'] ? 'bt_session' : all['session'] ? 'session' : 'NONE', '| token:', token ? token.substring(0, 20) + '...' : 'MISSING');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'apikey': CONFIG.SUPABASE_ANON_KEY,
  };
}

// Save YouTube video
export async function processYouTube(url, videoId) {
  chrome.storage.local.get(null, (items) => console.log('[BrainTube] ALL storage keys:', Object.keys(items), JSON.stringify(items).substring(0, 500)));
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
// messages: [{ role: 'user'|'assistant', content: string }]
// videoId: the item UUID (Supabase items.id)
export async function chat(messages, videoId) {
  const response = await fetch(
    buildUrl(CONFIG.ENDPOINTS.CHAT),
    {
      method: 'POST',
      headers: await getHeaders(),
      body: JSON.stringify({ messages, itemId: videoId })
    }
  );

  const contentType = response.headers.get('content-type') || '';

  // Non-OK or non-streaming: read as text for diagnostics
  if (!response.ok || !contentType.includes('text/event-stream')) {
    const text = await response.text();
    console.error('[BrainTube] chat raw response:', text);
    if (!response.ok) {
      let msg = `Chat failed (${response.status})`;
      try { msg = JSON.parse(text).error || msg; } catch { /* not JSON */ }
      throw new Error(msg);
    }
    // 200 OK but not SSE — try JSON fallback then bail
    try {
      const data = JSON.parse(text);
      if (data.error) throw new Error(data.error);
      return data.reply || data.response || data.message || data.content || text;
    } catch {
      throw new Error('Unexpected response from chat service. Please try again.');
    }
  }

  // SSE streaming — accumulate delta content chunks
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // hold incomplete line for next chunk
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') continue;
      try {
        const chunk = JSON.parse(raw);
        if (chunk.citations) continue; // citations metadata event — skip
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) fullText += delta;
      } catch { /* ignore malformed SSE chunks */ }
    }
  }

  if (!fullText) throw new Error('Chat returned an empty response. Please try again.');
  return fullText;
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

// ── Bookmark API ───────────────────────────────────────────────────────────────

export async function getBookmarks(userId, filter = 'unread') {
  let query = `${CONFIG.ENDPOINTS.REST}/${CONFIG.TABLES.ITEMS}?user_id=eq.${userId}&is_bookmark=eq.true&is_archived=eq.false&order=bookmarked_at.desc&select=id,title,source_url,source_type,tags,is_read,bookmarked_at,created_at&limit=50`;
  if (filter === 'unread') query += '&is_read=eq.false';
  if (filter === 'read')   query += '&is_read=eq.true';
  const response = await fetch(buildUrl(query), { headers: await getHeaders() });
  if (!response.ok) return [];
  return await response.json();
}

export async function saveBookmark(userId, title, url, tags = []) {
  const body = {
    user_id:       userId,
    title:         (title || 'Untitled Bookmark').trim().slice(0, 500),
    source_url:    url || null,
    source_type:   'bookmark',
    summary:       `Bookmarked: ${(title || url || '').slice(0, 300)}`,
    is_bookmark:   true,
    bookmarked_at: new Date().toISOString(),
    is_archived:   false,
  };
  if (tags.length > 0) body.tags = tags;
  const response = await fetch(
    buildUrl(`${CONFIG.ENDPOINTS.REST}/${CONFIG.TABLES.ITEMS}`),
    { method: 'POST', headers: { ...await getHeaders(), 'Prefer': 'return=representation' }, body: JSON.stringify(body) }
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Save failed (${response.status})`);
  }
  const data = await response.json();
  return Array.isArray(data) ? data[0] : data;
}

export async function patchItem(itemId, updates) {
  const response = await fetch(
    buildUrl(`${CONFIG.ENDPOINTS.REST}/${CONFIG.TABLES.ITEMS}?id=eq.${itemId}`),
    { method: 'PATCH', headers: { ...await getHeaders(), 'Prefer': 'return=representation' }, body: JSON.stringify(updates) }
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Patch failed (${response.status})`);
  }
  const data = await response.json();
  return Array.isArray(data) ? data[0] : data;
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
