// BrainTube Extension - Service Worker
import { trackEvent, saveUrl } from './api.js';
import './x-parse.js'; // defines globalThis.btX (postText, postTitle)
import { CONFIG, SESSION_KEY, getSession, getValidSession, lockSessionStorage, pinFunctionUrl } from './config.js';
import { captureContentLanguage } from './content-language.js';
import { isAllowedSender, isValidPlaylistId, isValidXHandle, aiPlatformForUrl, createRateLimiter } from './message-guard.js';
import { installPlaylistShim } from './page-world-shim.js';

console.log('🧠 BrainTube service worker started');

// Tokens live in chrome.storage.session; keep that area closed to content scripts (config.js).
lockSessionStorage();

// Installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed:', details.reason);
  
  // Create context menu
  chrome.contextMenus.create({
    id: 'save-to-braintube',
    title: chrome.i18n.getMessage('saveToBrainTube'),
    contexts: ['page', 'link'],
    documentUrlPatterns: ['*://www.youtube.com/watch*', '*://youtu.be/*']
  });
  
  if (details.reason === 'install') {
    // The track endpoint needs a signed-in user, and nobody is signed in at install time (it answered 401
    // and the install was never recorded). Remember the install and report it once a session exists.
    chrome.storage.local
      .set({ bt_install_pending: { version: chrome.runtime.getManifest().version, at: new Date().toISOString() } })
      .then(reportPendingInstall);
  }
});

// Sends the remembered install once there is a session; keeps it for the next sign-in if the call fails.
async function reportPendingInstall() {
  const { bt_install_pending: pending } = await chrome.storage.local.get('bt_install_pending');
  if (!pending || !(await getSession())) return;
  const ok = await trackEvent('extension_installed', { version: pending.version, installed_at: pending.at });
  if (ok) await chrome.storage.local.remove('bt_install_pending');
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes[SESSION_KEY]?.newValue) {
    reportPendingInstall();
    captureContentLanguage(changes[SESSION_KEY].newValue);
  }
});

// An account already signed in when this version starts (this also moves a session an older version left
// in chrome.storage.local into storage.session): the same once-per-account capture.
getSession().then((session) => captureContentLanguage(session)).catch(() => {});

// Context menu handler
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'save-to-braintube') {
    // Open popup or side panel
    chrome.action.openPopup();
  }
});

// Listen for messages. Every type has one kind of allowed sender (message-guard.js): the extension's own
// pages for privileged actions, the YouTube content scripts for YouTube events. Anything else is dropped.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type = message?.type;
  if (!isAllowedSender(type, sender, chrome.runtime.id)) {
    console.warn('[BrainTube] message refused:', String(type), 'from', sender?.url ?? 'unknown sender');
    return false;
  }

  if (type === 'SAVE_CURRENT_VIDEO') {
    // The YouTube page button: open the popup for the user to confirm.
    chrome.action.openPopup().catch(() => {});
    return false;
  }

  // Open side panel — must be called from service worker with active tabId
  // (popup may close before chrome.sidePanel.open resolves if called directly)
  if (type === 'OPEN_SIDEPANEL') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.sidePanel.open({ tabId: tabs[0].id }).catch(console.error);
      }
    });
    return false;
  }

  // AI conversation capture — the user clicked "Save Conversation" in the popup. The popup is an extension
  // page (checked above), so the tab id it names is trusted; the tab must still be claude.ai or chatgpt.com.
  if (type === 'SAVE_AI_CONVERSATION') {
    saveAiConversation(message.tabId)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // async
  }

  // The YouTube watcher asks for the MAIN-world playlist detector, with its per-load nonce. The tab and
  // frame come from sender, never from the message.
  if (type === 'INSTALL_PLAYLIST_SHIM') {
    const nonce = message.nonce;
    if (typeof nonce !== 'string' || !/^[0-9a-f]{32}$/.test(nonce)) return false;
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id, frameIds: [sender.frameId ?? 0] },
      world: 'MAIN',
      injectImmediately: true,
      func: installPlaylistShim,
      args: [nonce],
    }).catch((e) => console.log('[BrainTube] playlist detector not installed:', e?.message));
    return false;
  }

  // X "Import bookmarks": one post at a time from x-import.js in the top frame of an x.com tab (checked above).
  if (type === 'X_IMPORT_ITEM') {
    importXPost(message.post)
      .then((r) => sendResponse({ ok: true, duplicate: r.duplicate === true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // async
  }

  // Playlist-add event — relayed from content-playlist-watcher.js
  if (type === 'PLAYLIST_ADD_EVENT') {
    const id = message.youtube_playlist_id;
    if (!isValidPlaylistId(id) || !playlistLimiter(id)) {
      sendResponse({ ok: false, error: 'ignored' });
      return false;
    }
    syncPlaylist(id)
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // async
  }
  return false;
});

// Second line of defence behind the watcher's own limits (a compromised YouTube renderer skips those).
const playlistLimiter = createRateLimiter({ cooldownMs: 5000, windowMs: 60_000, maxPerWindow: 5 });

// ── AI Conversation Capture ───────────────────────────────────────────────────

const BRAINTUBE_INGEST = 'https://braintube-mcp-production.up.railway.app/api/extension-ingest';

async function saveAiConversation(tabId) {
  if (typeof tabId !== 'number') throw new Error('NO_TAB');
  const tab = await chrome.tabs.get(tabId);
  const platform = aiPlatformForUrl(tab?.url);
  if (!platform) throw new Error('UNSUPPORTED_PAGE');

  // Read the conversation now, on the user's click, through the activeTab grant from opening the popup.
  // ai-capture.js evaluates to { text, url, title }; it is not a standing content script.
  let extracted = null;
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, files: ['scripts/ai-capture.js'] });
    extracted = res?.result ?? null;
  } catch (e) {
    console.log('[BrainTube] conversation not readable, saving the link only:', e?.message);
  }

  // Fallback: save URL + title of that same tab
  let fallback = false;
  if (!extracted?.text || extracted.text.trim().length < 50) {
    fallback = true;
    extracted = {
      text:  tab.title || 'AI Conversation',
      url:   tab.url,
      title: tab.title,
    };
  }

  // Get auth token
  const token  = (await getValidSession().catch(() => null))?.access_token;
  if (!token) throw new Error('NOT_LOGGED_IN');

  // POST to BrainTube
  const resp = await fetch(BRAINTUBE_INGEST, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      conversation_text: extracted.text,
      source_url:        extracted.url,
      source_type:       platform,
      page_title:        extracted.title,
    }),
  });

  if (resp.status === 401) throw new Error('SESSION_EXPIRED');
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error ?? `Server error ${resp.status}`);
  }
  const data = await resp.json();
  return fallback ? { fallback: true, ...data } : data;
}

// ── Playlist sync ─────────────────────────────────────────────────────────────

const SYNC_PLAYLIST_URL  = pinFunctionUrl(`${CONFIG.SUPABASE_URL}/functions/v1/youtube-sync-playlist`);

async function syncPlaylist(youtubePlaylistId) {
  if (!isValidPlaylistId(youtubePlaylistId)) return;

  const token  = (await getValidSession().catch(() => null))?.access_token;
  if (!token) {
    console.log('[BrainTube] syncPlaylist: not logged in, skipping');
    return;
  }

  const resp = await fetch(SYNC_PLAYLIST_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ playlist_id: youtubePlaylistId }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error ?? `Sync failed ${resp.status}`);
  }
  console.log('[BrainTube] playlist sync queued:', youtubePlaylistId);
}

// Tab updates - update badge
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('youtube.com/watch')) {
    // Could check if video is saved and update badge
    // For now, just clear badge
    chrome.action.setBadgeText({ tabId, text: '' });
  }
});

// ── X bookmarks import ────────────────────────────────────────────────────────

// Saves one bookmarked X post. The browser already has the post's full text (long posts included,
// which X's public page often hides), so it goes in as page_text; the server still reads the link.
async function importXPost(post) {
  if (!post?.id || !/^\d+$/.test(String(post.id))) throw new Error('Bad post');
  const session = await getValidSession().catch(() => null);
  if (!session?.access_token) throw new Error('NOT_LOGGED_IN');
  const url = `https://x.com/${isValidXHandle(post.author) ? post.author : 'i/web'}/status/${post.id}`;
  const r = await saveUrl(url, { page: { title: globalThis.btX.postTitle(post), text: globalThis.btX.postText(post) } });
  return { duplicate: r.duplicate === true, itemId: r.itemId };
}
