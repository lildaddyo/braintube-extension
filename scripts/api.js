// BrainTube Extension - API Module
import { CONFIG, buildUrl } from './config.js';

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

export async function processYouTube(url, videoId) {
  chrome.storage.local.get(null, (items) => console.log('[BrainTube] ALL storage keys:', Object.keys(items), JSON.stringify(items).substring(0, 500)));
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
  let response;
  try {
    response = await fetch(
      buildUrl(CONFIG.ENDPOINTS.PROCESS_YOUTUBE),
      { method: 'POST', headers: await getHeaders(), body: JSON.stringify({ url, videoId }), signal: controller.signal }
    );
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Video save timed out after 30 seconds. The server may be busy — try again.');
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

export async function generateSummary(itemId) {
  const response = await fetch(buildUrl(CONFIG.ENDPOINTS.GENERATE_SUMMARY), { method: 'POST', headers: await getHeaders(), body: JSON.stringify({ itemId }) });
  if (!response.ok) throw new Error('Failed to generate summary');
  return await response.json();
}

export async function quickSearch(query, userId) {
  const response = await fetch(buildUrl(CONFIG.ENDPOINTS.QUICK_SEARCH), { method: 'POST', headers: await getHeaders(), body: JSON.stringify({ query, userId }) });
  if (!response.ok) throw new Error('Search failed');
  return await response.json();
}

async function readSseStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') continue;
      try {
        const chunk = JSON.parse(raw);
        if (chunk.citations) continue;
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) fullText += delta;
      } catch { /* ignore */ }
    }
  }
  if (!fullText) throw new Error('Chat unavailable — please try again in a moment.');
  return fullText;
}

async function readJsonOrText(response) {
  const text = await response.text();
  console.error('[BrainTube] chat raw response:', text);
  if (!response.ok) {
    let msg = 'Chat unavailable — please try again in a moment.';
    try { msg = JSON.parse(text).error || msg; } catch {}
    throw new Error(msg);
  }
  try {
    const data = JSON.parse(text);
    if (data.error) throw new Error(data.error);
    return data.answer || data.reply || data.response || data.message || data.content || text;
  } catch {
    throw new Error('Chat unavailable — please try again in a moment.');
  }
}

export async function chatItem(messages, itemId) {
  const response = await fetch(buildUrl(CONFIG.ENDPOINTS.ASK_ITEM_AI), { method: 'POST', headers: await getHeaders(), body: JSON.stringify({ messages, itemId }) });
  const ct = response.headers.get('content-type') || '';
  if (ct.includes('text/event-stream') && response.ok) return readSseStream(response);
  return readJsonOrText(response);
}

export async function chatCorpus(messages) {
  const response = await fetch(buildUrl(CONFIG.ENDPOINTS.CORPUS_CHAT), { method: 'POST', headers: await getHeaders(), body: JSON.stringify({ messages }) });
  const rawText = await response.text();
  console.log('[BrainTube] chatCorpus raw response:', rawText.substring(0, 500));
  let data;
  try { data = JSON.parse(rawText); } catch { data = {}; }
  if (!response.ok) throw new Error(data.error || `Chat unavailable (${response.status})`);
  const text = data.answer || data.reply || data.response || data.message || data.content || '';
  if (!text) throw new Error('Chat unavailable — please try again in a moment.');
  return text;
}

export async function checkSubscription() {
  const response = await fetch(buildUrl(CONFIG.ENDPOINTS.CHECK_SUBSCRIPTION), { method: 'POST', headers: await getHeaders(), body: JSON.stringify({}) });
  return await response.json();
}

export async function trackEvent(eventName, eventData = {}) {
  try {
    await fetch(buildUrl(CONFIG.ENDPOINTS.TRACK), { method: 'POST', headers: await getHeaders(), body: JSON.stringify({ event_name: eventName, event_data: eventData, page_path: '/extension' }) });
  } catch {}
}

export async function getItem(videoId, userId) {
  const response = await fetch(buildUrl(`${CONFIG.ENDPOINTS.REST}/${CONFIG.TABLES.ITEMS}?video_id=eq.${videoId}&user_id=eq.${userId}&select=*`), { headers: await getHeaders() });
  if (!response.ok) return null;
  const data = await response.json();
  return data[0] || null;
}

export async function getTranscriptSegments(itemId) {
  const response = await fetch(buildUrl(`${CONFIG.ENDPOINTS.REST}/${CONFIG.TABLES.TRANSCRIPT_SEGMENTS}?item_id=eq.${itemId}&order=segment_index&select=*`), { headers: await getHeaders() });
  if (!response.ok) return [];
  return await response.json();
}

export async function getHighlights(itemId) {
  const response = await fetch(buildUrl(`${CONFIG.ENDPOINTS.REST}/${CONFIG.TABLES.HIGHLIGHTS}?item_id=eq.${itemId}&select=*`), { headers: await getHeaders() });
  if (!response.ok) return [];
  return await response.json();
}

export async function saveWebPage(userId, title, url) {
  const body = {
    user_id: userId,
    title: (title || url || 'Untitled Page').trim().slice(0, 500),
    url: url || `braintube://extension/${Date.now()}`,
    source_url: url || null,
    source_type: 'web',
    summary: `Saved: ${(title || url || '').slice(0, 300)}`,
    is_bookmark: false,
    is_archived: false,
  };
  const response = await fetch(buildUrl(`${CONFIG.ENDPOINTS.REST}/${CONFIG.TABLES.ITEMS}`), { method: 'POST', headers: { ...await getHeaders(), 'Prefer': 'return=representation' }, body: JSON.stringify(body) });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Save failed (${response.status})`);
  }
  const data = await response.json();
  return Array.isArray(data) ? data[0] : data;
}

export async function getBookmarks(userId, filter = 'unread') {
  let query = `${CONFIG.ENDPOINTS.REST}/${CONFIG.TABLES.ITEMS}?user_id=eq.${userId}&is_bookmark=eq.true&is_archived=eq.false&order=bookmarked_at.desc&select=id,title,source_url,source_type,tags,is_read,bookmarked_at,created_at&limit=50`;
  if (filter === 'unread') query += '&is_read=eq.false';
  if (filter === 'read') query += '&is_read=eq.true';
  const response = await fetch(buildUrl(query), { headers: await getHeaders() });
  if (!response.ok) return [];
  return await response.json();
}

export async function saveBookmark(userId, title, url, tags = []) {
  const body = {
    user_id: userId,
    title: (title || 'Untitled Bookmark').trim().slice(0, 500),
    url: url || `braintube://extension/${Date.now()}`,
    source_url: url || null,
    source_type: 'bookmark',
    summary: `Bookmarked: ${(title || url || '').slice(0, 300)}`,
    is_bookmark: true,
    bookmarked_at: new Date().toISOString(),
    is_archived: false,
  };
  if (tags.length > 0) body.tags = tags;
  const response = await fetch(buildUrl(`${CONFIG.ENDPOINTS.REST}/${CONFIG.TABLES.ITEMS}`), { method: 'POST', headers: { ...await getHeaders(), 'Prefer': 'return=representation' }, body: JSON.stringify(body) });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Save failed (${response.status})`);
  }
  const data = await response.json();
  return Array.isArray(data) ? data[0] : data;
}

export async function patchItem(itemId, updates) {
  const response = await fetch(buildUrl(`${CONFIG.ENDPOINTS.REST}/${CONFIG.TABLES.ITEMS}?id=eq.${itemId}`), { method: 'PATCH', headers: { ...await getHeaders(), 'Prefer': 'return=representation' }, body: JSON.stringify(updates) });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `Patch failed (${response.status})`);
  }
  const data = await response.json();
  return Array.isArray(data) ? data[0] : data;
}

export async function createHighlight(itemId, userId, text, segmentId = null) {
  const response = await fetch(buildUrl(`${CONFIG.ENDPOINTS.REST}/${CONFIG.TABLES.HIGHLIGHTS}`), { method: 'POST', headers: await getHeaders(), body: JSON.stringify({ item_id: itemId, user_id: userId, text: text, segment_id: segmentId, color: '#e9d5ff' }) });
  return await response.json();
}