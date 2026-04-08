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

  // Google OAuth — popup delegates here so the flow survives popup close
  if (message.type === 'START_GOOGLE_AUTH') {
    startGoogleAuth();
    return false;
  }

  // AI conversation capture — sent from popup when on claude.ai or chatgpt.com
  if (message.type === 'SAVE_AI_CONVERSATION') {
    saveAiConversation(message.tabId, message.platform)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // async
  }
});

// ── Google OAuth (PKCE / id_token flow) ──────────────────────────────────────
// Runs in the service worker so it survives the popup closing mid-flow.
// On completion broadcasts AUTH_SUCCESS or AUTH_ERROR to all extension pages.

const SUPABASE_URL  = 'https://iqjnmmtvhyavgrsxpoao.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlxam5tbXR2aHlhdmdyc3hwb2FvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MTE1NTEsImV4cCI6MjA4NzE4NzU1MX0.GF31S85XbTzYSHjWxjTasXguJ5GwasyQgdsLR9fBJtE';

function startGoogleAuth() {
  const manifest    = chrome.runtime.getManifest();
  const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org`;

  const url = new URL('https://accounts.google.com/o/oauth2/auth');
  url.searchParams.set('client_id',     manifest.oauth2.client_id);
  url.searchParams.set('response_type', 'id_token');
  url.searchParams.set('access_type',   'offline');
  url.searchParams.set('redirect_uri',  redirectUri);
  url.searchParams.set('scope',         manifest.oauth2.scopes.join(' '));
  url.searchParams.set('nonce',         Math.random().toString(36).substring(2));

  chrome.identity.launchWebAuthFlow(
    { url: url.href, interactive: true },
    async (redirectedTo) => {
      if (chrome.runtime.lastError || !redirectedTo) {
        const err = chrome.runtime.lastError?.message ?? 'OAuth cancelled or failed';
        console.error('[BrainTube] Google auth error:', err);
        chrome.runtime.sendMessage({ type: 'AUTH_ERROR', error: err });
        return;
      }

      // id_token is in the hash fragment — split on # to avoid the strip issue
      const hash    = redirectedTo.split('#')[1] ?? '';
      const params  = new URLSearchParams(hash);
      const idToken = params.get('id_token');

      if (!idToken) {
        const errMsg = params.get('error') ?? 'No id_token in redirect';
        console.error('[BrainTube] No id_token:', errMsg);
        chrome.runtime.sendMessage({ type: 'AUTH_ERROR', error: errMsg });
        return;
      }

      // Exchange id_token with Supabase
      try {
        const res = await fetch(
          `${SUPABASE_URL}/auth/v1/token?grant_type=id_token`,
          {
            method:  'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey':       SUPABASE_ANON,
            },
            body: JSON.stringify({ provider: 'google', token: idToken }),
          }
        );

        const data = await res.json();

        if (!res.ok || !data.access_token) {
          throw new Error(data.error_description ?? data.msg ?? `HTTP ${res.status}`);
        }

        const session = {
          access_token:  data.access_token,
          refresh_token: data.refresh_token,
          expires_in:    data.expires_in ?? 3600,
          token_type:    'bearer',
          user:          data.user,
        };

        await chrome.storage.local.set({ bt_session: session });
        console.log('✅ Google sign-in complete:', data.user?.email);
        chrome.runtime.sendMessage({ type: 'AUTH_SUCCESS', session });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[BrainTube] Supabase token exchange failed:', msg);
        chrome.runtime.sendMessage({ type: 'AUTH_ERROR', error: msg });
      }
    }
  );
}

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
