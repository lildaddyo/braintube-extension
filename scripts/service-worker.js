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
  // 1. Extract conversation text from the page via content script
  const extracted = await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_CONVERSATION' });

  if (!extracted?.text || extracted.text.trim().length < 50) {
    throw new Error('Conversation is too short or could not be extracted.');
  }

  // 2. Get auth token — bt_session (Google OAuth) or session (email/password)
  const stored = await chrome.storage.local.get(['session', 'bt_session']);
  const token = (stored.bt_session || stored.session)?.access_token;
  if (!token) {
    throw new Error('NOT_LOGGED_IN');
  }

  // 3. POST raw text to BrainTube server — server summarises and stores
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

// Tab updates - update badge
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('youtube.com/watch')) {
    // Could check if video is saved and update badge
    // For now, just clear badge
    chrome.action.setBadgeText({ tabId, text: '' });
  }
});
