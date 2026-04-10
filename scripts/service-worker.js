// BrainTube Extension - Service Worker
import { trackEvent } from './api.js';
import { CONFIG } from './config.js';

console.log('🧠 BrainTube service worker started');

// Installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed:', details.reason);
  
  // Create context menu
  chrome.contextMenus.create({
    id: 'save-to-braintube',
    title: 'Save to BrainTube',
    contexts: ['page', 'link'],
    documentUrlPatterns: ['*://www.youtube.com/watch*', '*://youtu.be/*']
  });
  
  if (details.reason === 'install') {
    trackEvent('extension_installed', { 
      version: chrome.runtime.getManifest().version 
    });
  }
});

// Context menu handler
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'save-to-braintube') {
    // Open popup or side panel
    chrome.action.openPopup();
  }
});

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SAVE_CURRENT_VIDEO') {
    // Trigger save from content script
    chrome.action.openPopup();
  }

  // Open side panel — must be called from service worker with active tabId
  // (popup may close before chrome.sidePanel.open resolves if called directly)
  if (message.type === 'OPEN_SIDEPANEL') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.sidePanel.open({ tabId: tabs[0].id }).catch(console.error);
      }
    });
  }

  // AI conversation capture — sent from popup when on claude.ai or chatgpt.com
  if (message.type === 'SAVE_AI_CONVERSATION') {
    saveAiConversation(message.tabId, message.platform)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // async
  }
});

// ── AI Conversation Capture ───────────────────────────────────────────────────

const BRAINTUBE_INGEST = 'https://braintube-mcp-production.up.railway.app/api/extension-ingest';

async function saveAiConversation(tabId, platform) {
  // 1. Try extracting conversation text from the content script.
  //    claude.ai / chatgpt.com are SPAs — Chrome doesn't re-inject content
  //    scripts on client-side navigation, so the script may be absent even
  //    when the manifest match pattern is correct. Strategy:
  //      a) Send message; if it fails (Receiving end does not exist)…
  //      b) Inject ai-capture.js programmatically, wait 400ms, retry.
  //      c) If still unreachable, fall back to saving URL + title directly.

  let extracted = null;

  try {
    extracted = await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_CONVERSATION' });
  } catch (_firstErr) {
    console.warn('[BrainTube] Content script unreachable — injecting ai-capture.js');
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files:  ['scripts/ai-capture.js'],
      });
      await new Promise(r => setTimeout(r, 400)); // let script initialise
      extracted = await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_CONVERSATION' });
    } catch (retryErr) {
      console.warn('[BrainTube] Injection retry also failed:', retryErr.message);
      // extracted stays null → fallback path below handles it
    }
  }

  // 2. Auth — bt_session (Google OAuth) or session (email/password)
  const stored  = await chrome.storage.local.get(['session', 'bt_session']);
  const session = stored.bt_session || stored.session;
  const token   = session?.access_token;
  if (!token) throw new Error('NOT_LOGGED_IN');

  // 3. Full ingest path — content script returned enough conversation text.
  //    POST to Railway server which summarises and stores the conversation.
  if (extracted?.text && extracted.text.trim().length >= 50) {
    const resp = await fetch(BRAINTUBE_INGEST, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        conversation_text: extracted.text,
        source_url:        extracted.url,
        source_type:       platform === 'claude' ? 'claude' : 'chatgpt',
        page_title:        extracted.title,
      }),
    });

    if (resp.status === 401) throw new Error('SESSION_EXPIRED');
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err?.error ?? `Server error ${resp.status}`);
    }
    return resp.json(); // { id, title, action }
  }

  // 4. Fallback — content script could not be reached or returned too little text.
  //    Save the page URL + title directly to Supabase so the user at least has
  //    a reference. Returns { ..., fallback: true } so the popup can show a
  //    different status message.
  const tab        = await chrome.tabs.get(tabId);
  const fbTitle    = extracted?.title || tab.title || `${platform} Conversation`;
  const fbUrl      = extracted?.url   || tab.url   || '';
  const sourceType = platform === 'claude' ? 'claude' : 'chatgpt';

  const fallbackBody = {
    user_id:     session?.user?.id,
    title:       fbTitle.slice(0, 500),
    url:         fbUrl || `braintube://extension/${Date.now()}`,
    source_url:  fbUrl || null,
    source_type: sourceType,
    summary:     `Saved from ${platform}: ${fbTitle}`,
    is_bookmark: false,
    is_archived: false,
  };

  const restResp = await fetch(
    `${CONFIG.SUPABASE_URL}/rest/v1/items`,
    {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey':        CONFIG.SUPABASE_ANON_KEY,
        'Prefer':        'return=representation',
      },
      body: JSON.stringify(fallbackBody),
    }
  );

  if (restResp.status === 401) throw new Error('SESSION_EXPIRED');
  if (!restResp.ok) {
    const err = await restResp.json().catch(() => ({}));
    throw new Error(err.message || `Save failed (${restResp.status})`);
  }

  const data  = await restResp.json();
  const saved = Array.isArray(data) ? data[0] : data;
  return { id: saved.id, title: saved.title, action: 'inserted', fallback: true };
}

// Tab updates - update badge
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('youtube.com/watch')) {
    // Could check if video is saved and update badge
    // For now, just clear badge
    chrome.action.setBadgeText({ tabId, text: '' });
  }
});
