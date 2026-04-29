// Isolated-world content script. Receives PLAYLIST_ADD postMessages from
// page-world-shim.js and relays them to the service worker. Also runs a
// MutationObserver fallback that watches for YouTube's "Saved to <Playlist>"
// toast in case the network intercept misses.

'use strict';

// Debounce map: playlistId → timestamp of last relay (ms).
const _debounce = new Map();
const DEBOUNCE_MS = 5000;

function shouldFire(playlistId) {
  const last = _debounce.get(playlistId) || 0;
  if (Date.now() - last < DEBOUNCE_MS) return false;
  _debounce.set(playlistId, Date.now());
  return true;
}

function relay(playlistId) {
  if (!shouldFire(playlistId)) return;
  chrome.runtime.sendMessage({ type: 'PLAYLIST_ADD_EVENT', youtube_playlist_id: playlistId })
    .catch(() => { /* service worker may be sleeping */ });
}

// ── Network intercept path ───────────────────────────────────────────────────

window.addEventListener('message', (evt) => {
  if (evt.source !== window) return;
  if (evt.data?.source !== 'BT' || evt.data?.type !== 'PLAYLIST_ADD') return;
  const id = evt.data.playlistId;
  if (id) relay(id);
});

// ── MutationObserver fallback ────────────────────────────────────────────────
// Watch for YouTube's save-confirmation toast text in multiple languages.

const TOAST_PREFIXES = [
  'Saved to ',       // EN
  'Guardado en ',    // ES
  'Gespeichert in ', // DE
  '\u0417\u0430\u043f\u0430\u0437\u0435\u043d\u043e \u0432 ', // BG: "Запазено в "
];

function extractPlaylistName(toastText) {
  for (const prefix of TOAST_PREFIXES) {
    if (toastText.startsWith(prefix)) {
      return toastText.slice(prefix.length).replace(/\.$/, '').trim();
    }
  }
  return null;
}

// Build a name→id map from the currently open playlist menu (if visible).
function buildPlaylistIdMap() {
  const map = new Map();
  // YouTube renders playlist items with data-id or data-playlist-id attributes
  const items = document.querySelectorAll('[data-id], [data-playlist-id]');
  items.forEach(el => {
    const id = el.getAttribute('data-id') || el.getAttribute('data-playlist-id');
    if (!id || id === 'WL') return;
    const label = el.getAttribute('aria-label') ||
                  el.querySelector('[class*="label"], span')?.textContent?.trim() ||
                  el.textContent?.trim();
    if (label) map.set(label.toLowerCase(), id);
  });
  return map;
}

const observer = new MutationObserver(() => {
  // YouTube toasts live inside #toast, ytd-toast-renderer, or tp-yt-paper-toast
  const toasts = document.querySelectorAll(
    '#toast, ytd-toast-renderer, tp-yt-paper-toast, [class*="toast"]'
  );

  toasts.forEach(toast => {
    const text = toast.textContent?.trim() || '';
    const playlistName = extractPlaylistName(text);
    if (!playlistName) return;

    // Try to resolve name → id from the menu
    const idMap = buildPlaylistIdMap();
    const resolvedId = idMap.get(playlistName.toLowerCase());

    if (resolvedId) {
      relay(resolvedId);
    } else {
      // Name-only fallback — relay with a synthetic slug so the server can
      // do a best-effort match. The service worker can filter/ignore these.
      relay('name:' + playlistName);
    }
  });
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: false,
  attributes: false,
});
