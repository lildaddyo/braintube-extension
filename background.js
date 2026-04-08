/**
 * BrainTube background service worker (MV3)
 *
 * Auth: reads the user's Supabase session token from brain-tube.com's
 * localStorage via the brain-tube.js content script. No manual API key needed.
 *
 * Token acquisition order:
 *   1. Query any open brain-tube.com tab (freshest)
 *   2. Fall back to chrome.storage.local cache (set by content script on visit)
 *   3. If neither → tell the user to log in to brain-tube.com
 *
 * Summarisation happens server-side using the server's ANTHROPIC_API_KEY.
 * The extension sends raw conversation text; the server returns a digest.
 * Zero user configuration required.
 */

'use strict';

const BRAINTUBE_API           = 'https://braintube-mcp-production.up.railway.app';
const INACTIVITY_MINUTES      = 10;
const INACTIVITY_ALARM_PREFIX = 'inactivity-';

// Per-tab conversation cache: { [tabId]: { platform, url, title, text, messageCount, savedAt? } }
const tabCache    = new Map();
const tabActivity = new Map();

// ── Settings ──────────────────────────────────────────────────────────────────

async function getSettings() {
  return chrome.storage.sync.get(['autoSave', 'sites']);
}

// ── Auth token acquisition ────────────────────────────────────────────────────

function getJwtExpiry(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64));
    return (payload.exp ?? 0) * 1000;
  } catch {
    return 0;
  }
}

/**
 * Returns the user's Supabase access_token or null.
 * Tries an open brain-tube.com tab first (guaranteed fresh), then local cache.
 */
async function getAuthToken() {
  // 1. Query any open brain-tube.com tab
  const tabs = await chrome.tabs.query({
    url: ['https://brain-tube.com/*', 'https://www.brain-tube.com/*'],
  });

  for (const tab of tabs) {
    if (!tab.id) continue;
    try {
      const resp = await chrome.tabs.sendMessage(tab.id, { action: 'get_auth_token' });
      if (resp?.token) {
        await chrome.storage.local.set({
          btAuthToken:  resp.token,
          btAuthExpiry: getJwtExpiry(resp.token),
        });
        return resp.token;
      }
    } catch { /* content script may not be injected yet */ }
  }

  // 2. Fall back to cached token (must have > 60 s left)
  const cached = await chrome.storage.local.get(['btAuthToken', 'btAuthExpiry']);
  if (cached.btAuthToken && (cached.btAuthExpiry ?? 0) > Date.now() + 60_000) {
    return cached.btAuthToken;
  }

  return null;
}

// ── Ingest to BrainTube ───────────────────────────────────────────────────────
// Sends raw conversation text to the server; server summarises and stores.

async function ingestToBrainTube({ conversationText, sourceUrl, platform, pageTitle, authToken }) {
  const sourceType = platform === 'claude' ? 'claude' : 'chatgpt';

  const resp = await fetch(`${BRAINTUBE_API}/api/extension-ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      conversation_text: conversationText,
      source_url:        sourceUrl,
      source_type:       sourceType,
      page_title:        pageTitle,
    }),
  });

  if (resp.status === 401) {
    await chrome.storage.local.remove(['btAuthToken', 'btAuthExpiry']);
    throw new Error('SESSION_EXPIRED: Your brain-tube.com session has expired. Please refresh that page and try again.');
  }

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`BrainTube API error ${resp.status}: ${err?.error ?? resp.statusText}`);
  }

  return resp.json();
}

// ── Core save flow ────────────────────────────────────────────────────────────

async function saveConversationForTab(tabId, { triggeredBy = 'manual' } = {}) {
  const cached = tabCache.get(tabId);
  if (!cached) throw new Error('No conversation data found for this tab.');
  if (!cached.text || cached.text.trim().length < 50) throw new Error('Conversation is too short or empty.');

  const authToken = await getAuthToken();
  if (!authToken) {
    throw new Error('NOT_LOGGED_IN: Please log in to brain-tube.com first, then try again.');
  }

  // Send raw text to server — server summarises and stores
  const result = await ingestToBrainTube({
    conversationText: cached.text,
    sourceUrl:        cached.url,
    platform:         cached.platform,
    pageTitle:        cached.title,
    authToken,
  });

  const title = result.title ?? cached.title ?? 'AI Conversation';
  tabCache.set(tabId, { ...cached, savedAt: Date.now(), lastSaveResult: result });
  console.log(`[BrainTube] saved tab ${tabId} (${triggeredBy}): "${title}"`);

  return { title, result };
}

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id ?? msg.tabId;

  // brain-tube.com content script pushes token updates (login/logout/refresh)
  if (msg.action === 'auth_token_update') {
    if (msg.token) {
      chrome.storage.local.set({
        btAuthToken:  msg.token,
        btAuthExpiry: getJwtExpiry(msg.token),
      });
    } else {
      chrome.storage.local.remove(['btAuthToken', 'btAuthExpiry']);
    }
    return false;
  }

  // Popup asks: is the user currently authenticated?
  if (msg.action === 'check_auth') {
    getAuthToken().then(token => sendResponse({ loggedIn: !!token }));
    return true; // async
  }

  // Content script pushes updated conversation state
  if (msg.action === 'conversation_update') {
    tabCache.set(tabId, {
      platform:     msg.platform,
      url:          msg.url,
      title:        msg.title,
      text:         msg.text,
      messageCount: msg.messageCount,
      updatedAt:    Date.now(),
    });
    resetInactivityAlarm(tabId);
    return false;
  }

  // Content script pings on user activity
  if (msg.action === 'activity_ping') {
    tabActivity.set(tabId, Date.now());
    resetInactivityAlarm(tabId);
    return false;
  }

  // Popup requests a save
  if (msg.action === 'save_conversation') {
    const targetTabId = msg.tabId ?? tabId;

    chrome.tabs.sendMessage(targetTabId, { action: 'extract_conversation' }, async (extracted) => {
      if (extracted?.text) {
        tabCache.set(targetTabId, {
          platform:     extracted.platform,
          url:          extracted.url,
          title:        extracted.title,
          text:         extracted.text,
          messageCount: extracted.messageCount,
          updatedAt:    Date.now(),
        });
      }
      try {
        const saveResult = await saveConversationForTab(targetTabId, { triggeredBy: 'manual' });
        sendResponse({ ok: true, ...saveResult });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    });
    return true;
  }

  // Popup queries current tab status
  if (msg.action === 'get_tab_status') {
    const c = tabCache.get(msg.tabId);
    sendResponse({
      hasConversation: !!(c?.text),
      messageCount:    c?.messageCount ?? 0,
      savedAt:         c?.savedAt ?? null,
      url:             c?.url ?? null,
    });
    return false;
  }

  return false;
});

// ── Auto-save on tab close ────────────────────────────────────────────────────

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const cached = tabCache.get(tabId);
  if (!cached) return;

  const settings = await getSettings();
  if (!settings.autoSave) { tabCache.delete(tabId); return; }

  const siteEnabled = (settings.sites ?? {})[cached.platform === 'claude' ? 'claude.ai' : 'chatgpt.com'] !== false;
  if (!siteEnabled) { tabCache.delete(tabId); return; }

  if (!cached.savedAt && cached.text && cached.text.length > 100) {
    try {
      await saveConversationForTab(tabId, { triggeredBy: 'tab-close' });
    } catch (err) {
      console.warn(`[BrainTube] auto-save on tab close failed for ${tabId}:`, err.message);
    }
  }

  tabCache.delete(tabId);
  tabActivity.delete(tabId);
  chrome.alarms.clear(`${INACTIVITY_ALARM_PREFIX}${tabId}`);
});

// ── Inactivity auto-save ──────────────────────────────────────────────────────

function resetInactivityAlarm(tabId) {
  chrome.storage.sync.get(['autoSave'], ({ autoSave }) => {
    if (!autoSave) return;
    chrome.alarms.create(`${INACTIVITY_ALARM_PREFIX}${tabId}`, { delayInMinutes: INACTIVITY_MINUTES });
  });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(INACTIVITY_ALARM_PREFIX)) return;

  const tabId  = parseInt(alarm.name.slice(INACTIVITY_ALARM_PREFIX.length), 10);
  const cached = tabCache.get(tabId);
  if (!cached) return;

  const settings = await getSettings();
  if (!settings.autoSave) return;

  try { await chrome.tabs.get(tabId); }
  catch { tabCache.delete(tabId); return; }

  if (cached.savedAt && Date.now() - cached.savedAt < 5 * 60 * 1000) return;
  if (!cached.text || cached.text.length < 100) return;

  try {
    await saveConversationForTab(tabId, { triggeredBy: 'inactivity' });
  } catch (err) {
    console.warn(`[BrainTube] inactivity auto-save failed for tab ${tabId}:`, err.message);
  }
});
