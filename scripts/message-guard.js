// BrainTube Extension - who may send which runtime message (security audit 2026-11-01, findings 1 and 2).
// Content scripts live inside youtube.com renderer processes, so a compromised or hostile page renderer can
// send any chrome.runtime message a content script can. Privileged actions (capture an AI conversation, open
// the side panel) are therefore only accepted from the extension's own pages (popup, side panel), and a
// content script's tab always comes from sender.tab, never from a field in the message.
// Pure functions, no chrome.* use, so they run in node tests.

const YOUTUBE_ORIGINS = new Set(['https://www.youtube.com']);
const X_ORIGINS = new Set(['https://x.com']);

// Hosts the popup may ask the service worker to capture a conversation from.
export const AI_CAPTURE_HOSTS = { 'claude.ai': 'claude', 'chatgpt.com': 'chatgpt' };

// User playlists are "PL" + 16 or 32 base64url characters. Watch Later (WL), Liked (LL), mixes (RD...),
// uploads (UU...) and album playlists (OLAK5uy_...) are never imported.
const PLAYLIST_ID = /^PL[A-Za-z0-9_-]{16}(?:[A-Za-z0-9_-]{16})?$/;

export function isValidPlaylistId(id) {
  return typeof id === 'string' && PLAYLIST_ID.test(id);
}

function originOf(url) {
  try { return new URL(url).origin; } catch { return null; }
}

/** A message from one of this extension's pages (popup, side panel, auth tab): own id, own origin, no tab. */
export function isExtensionPageSender(sender, extensionId) {
  if (!sender || !extensionId || sender.id !== extensionId) return false;
  if (sender.tab) return false; // content scripts and extension pages opened in a tab carry sender.tab
  const prefix = `chrome-extension://${extensionId}/`;
  return typeof sender.url === 'string' && sender.url.startsWith(prefix)
    && (sender.origin === undefined || sender.origin === `chrome-extension://${extensionId}`);
}

/** A message from this extension's content script in the top frame of a www.youtube.com tab. */
export function isYouTubeContentScriptSender(sender, extensionId) {
  if (!sender || !extensionId || sender.id !== extensionId) return false;
  if (!sender.tab || typeof sender.tab.id !== 'number' || sender.tab.id < 0) return false;
  if (sender.frameId !== undefined && sender.frameId !== 0) return false;
  const origin = sender.origin || originOf(sender.url);
  return YOUTUBE_ORIGINS.has(origin) && YOUTUBE_ORIGINS.has(originOf(sender.url));
}

/** A message from this extension's content script in the top frame of an x.com tab (X bookmarks import). */
export function isXContentScriptSender(sender, extensionId) {
  if (!sender || !extensionId || sender.id !== extensionId) return false;
  if (!sender.tab || typeof sender.tab.id !== 'number' || sender.tab.id < 0) return false;
  if (sender.frameId !== undefined && sender.frameId !== 0) return false;
  const origin = sender.origin || originOf(sender.url);
  return X_ORIGINS.has(origin) && X_ORIGINS.has(originOf(sender.url));
}

// X handles: 1-15 letters, digits or underscores. Anything else is not put into a URL.
export function isValidXHandle(h) {
  return typeof h === 'string' && /^[A-Za-z0-9_]{1,15}$/.test(h);
}

/** 'claude' | 'chatgpt' for a tab URL the popup may capture from, else null. */
export function aiPlatformForUrl(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  return AI_CAPTURE_HOSTS[u.hostname.replace(/^www\./, '')] || null;
}

// message type -> which sender may send it.
const RULES = {
  SAVE_CURRENT_VIDEO:    'youtube-content',
  INSTALL_PLAYLIST_SHIM: 'youtube-content',
  PLAYLIST_ADD_EVENT:    'youtube-content',
  OPEN_SIDEPANEL:        'extension-page',
  SAVE_AI_CONVERSATION:  'extension-page',
  X_IMPORT_ITEM:         'x-content',
};

/** true when `sender` may send a message of this type; unknown types are refused. */
export function isAllowedSender(type, sender, extensionId) {
  const rule = RULES[type];
  if (rule === 'extension-page') return isExtensionPageSender(sender, extensionId);
  if (rule === 'youtube-content') return isYouTubeContentScriptSender(sender, extensionId);
  if (rule === 'x-content') return isXContentScriptSender(sender, extensionId);
  return false;
}

/** Per-key cooldown plus a global cap per window, for background playlist imports. */
export function createRateLimiter({ cooldownMs = 5000, windowMs = 60_000, maxPerWindow = 5, now = () => Date.now() } = {}) {
  const last = new Map();
  let stamps = [];
  return function allow(key) {
    const t = now();
    if (t - (last.get(key) ?? -Infinity) < cooldownMs) return false;
    stamps = stamps.filter((s) => t - s < windowMs);
    if (stamps.length >= maxPerWindow) return false;
    last.set(key, t);
    stamps.push(t);
    return true;
  };
}
