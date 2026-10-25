// BrainTube Extension - API Module
import { CONFIG, buildUrl, getHeaders } from './config.js';
import { routeForUrl } from './routing.js';
import { t } from './i18n.js';

export async function processYouTube(url, videoId, extra = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
  let response;
  try {
    response = await fetch(
      buildUrl(CONFIG.ENDPOINTS.PROCESS_YOUTUBE),
      { method: 'POST', headers: await getHeaders(), body: JSON.stringify({ url, videoId, ...extra }), signal: controller.signal }
    );
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(t('saveTimedOut'));
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
  if (!fullText) throw new Error(t('chatUnavailable'));
  return fullText;
}

async function readJsonOrText(response) {
  const text = await response.text();
  console.error('[BrainTube] chat raw response:', text);
  if (!response.ok) {
    let msg = t('chatUnavailable');
    try { msg = JSON.parse(text).error || msg; } catch {}
    throw new Error(msg);
  }
  try {
    const data = JSON.parse(text);
    if (data.error) throw new Error(data.error);
    return data.answer || data.reply || data.response || data.message || data.content || text;
  } catch {
    throw new Error(t('chatUnavailable'));
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
  console.log('[BrainTube] chatCorpus response:', response.status, `${rawText.length} chars`);
  let data;
  try { data = JSON.parse(rawText); } catch { data = {}; }
  if (!response.ok) throw new Error(data.error || t('chatUnavailableStatus', response.status));
  const text = data.answer || data.reply || data.response || data.message || data.content || '';
  if (!text) throw new Error(t('chatUnavailable'));
  return text;
}

export async function checkSubscription() {
  const response = await fetch(buildUrl(CONFIG.ENDPOINTS.CHECK_SUBSCRIPTION), { method: 'POST', headers: await getHeaders(), body: JSON.stringify({}) });
  return await response.json();
}

export async function trackEvent(eventName, eventData = {}) {
  try {
    const res = await fetch(buildUrl(CONFIG.ENDPOINTS.TRACK), { method: 'POST', headers: await getHeaders(), body: JSON.stringify({ event_name: eventName, event_data: eventData, page_path: '/extension' }) });
    return res.ok;
  } catch {
    return false;
  }
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

// Saves any page through the backend reader: process-youtube for videos, process-content for everything
// else (it fetches the text, writes the summary and the search segments). page.title / page.text are what
// the tab shows; the server uses them only when it cannot read the page itself (paywall, login wall,
// blocked host, client-rendered app). Returns { itemId, duplicate, pending, sourceType }.
export async function saveUrl(url, { bookmark = false, page = null } = {}) {
  const route = routeForUrl(url, { bookmark });
  if (!route) throw new Error(t('pageCannotBeSaved'));
  if (route.fn === 'process-youtube') {
    const data = await processYouTube(route.body.url, route.videoId, route.body.isYouTubeMusic ? { isYouTubeMusic: true } : {});
    const itemId = data.itemId || data.item?.id || null;
    if (bookmark && itemId) await patchItem(itemId, { is_bookmark: true, is_read: false, bookmarked_at: new Date().toISOString() });
    return { itemId, duplicate: data.duplicate === true, pending: data.pending === true, sourceType: 'youtube' };
  }
  const body = { ...route.body };
  if (page?.title) body.page_title = String(page.title).slice(0, 500);
  if (page?.text) body.page_text = String(page.text).slice(0, 60_000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
  let response;
  try {
    response = await fetch(buildUrl(CONFIG.ENDPOINTS.PROCESS_CONTENT), { method: 'POST', headers: await getHeaders(), body: JSON.stringify(body), signal: controller.signal });
  } catch (err) {
    // The server keeps going after the popup stops waiting (seen 2026-10-16 under database load: the rows
    // appeared a few seconds later), so a slow answer is not a failed save.
    if (err.name === 'AbortError') return { itemId: null, duplicate: false, pending: true, slow: true, sourceType: null };
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
  const data = await response.json().catch(() => ({}));
  // A page already in the library answers 200 with existingId.
  if (data.existingId) return { itemId: data.existingId, duplicate: true, pending: false, sourceType: null };
  if (!response.ok || data.error) throw new Error(data.error || `Server error ${response.status}`);
  return { itemId: data.itemId || null, duplicate: false, pending: data.pending === true, sourceType: data.sourceType || 'web' };
}

export async function getBookmarks(userId, filter = 'unread') {
  let query = `${CONFIG.ENDPOINTS.REST}/${CONFIG.TABLES.ITEMS}?user_id=eq.${userId}&is_bookmark=eq.true&is_archived=eq.false&order=bookmarked_at.desc&select=id,title,source_url,source_type,tags,is_read,bookmarked_at,created_at&limit=50`;
  if (filter === 'unread') query += '&is_read=eq.false';
  if (filter === 'read') query += '&is_read=eq.true';
  const response = await fetch(buildUrl(query), { headers: await getHeaders() });
  if (!response.ok) return [];
  return await response.json();
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