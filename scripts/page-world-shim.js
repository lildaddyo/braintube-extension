// BrainTube Extension - playlist-add detector for the YouTube page (MAIN world).
//
// Security (audit 2026-11-01, finding 1): this used to be a static MAIN-world content script that announced
// adds with window.postMessage({source:'BT', ...}, '*'), which any script on youtube.com could forge to make
// BrainTube import a playlist of its choice. Now:
//   1. The isolated-world watcher makes a random nonce and asks the service worker to inject this function
//      with chrome.scripting.executeScript({ world: 'MAIN', func, args: [nonce] }). Arguments reach the
//      function directly; the page never sees them.
//   2. This function creates a MessageChannel, keeps port1 (the only end that can send to port2) and hands
//      port2 to the watcher in a single window.postMessage carrying the nonce. The watcher accepts the first
//      handshake with the right nonce and ignores every later one, and from then on accepts adds only from
//      that port. A page script that sees the handshake can read the nonce (too late to matter) or grab port2
//      (it can only receive from it), but it cannot send on port1.
//   3. The watcher still checks the playlist id format, a recent trusted user input, and rate limits.
//
// Must stay self-contained: executeScript serialises the function source, so it cannot use imports or
// closures from this module.

export function installPlaylistShim(nonce) {
  'use strict';
  if (typeof nonce !== 'string' || nonce.length < 16) return false;
  const FLAG = Symbol.for('braintube.playlistShim');
  if (window[FLAG]) return false; // one shim per document
  Object.defineProperty(window, FLAG, { value: true });

  // Capture the built-ins before page code can swap them later.
  const Channel   = window.MessageChannel;
  const post      = window.postMessage.bind(window);
  const origFetch = window.fetch;
  const xhrOpen   = XMLHttpRequest.prototype.open;
  const xhrSend   = XMLHttpRequest.prototype.send;
  const parse     = JSON.parse;
  const TARGET    = '/youtubei/v1/browse/edit_playlist';

  const { port1, port2 } = new Channel();
  post({ source: 'BT', type: 'BT_PORT', nonce }, location.origin, [port2]);

  function extractPlaylistId(body) {
    try {
      const parsed = typeof body === 'string' ? parse(body) : null;
      // Only real "add video" edits; removals and renames are ignored.
      const adds = Array.isArray(parsed?.actions) ? parsed.actions.some((a) => a?.action === 'ACTION_ADD_VIDEO') : true;
      const id = parsed?.playlistId;
      return adds && typeof id === 'string' ? id : null;
    } catch {
      return null;
    }
  }

  function emit(playlistId) {
    try { port1.postMessage({ type: 'PLAYLIST_ADD', playlistId }); } catch { /* port closed */ }
  }

  function urlOf(input) {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.href;
    return input?.url ?? '';
  }

  window.fetch = function (input, init) {
    try {
      if (urlOf(input).includes(TARGET)) {
        const id = extractPlaylistId(init?.body);
        if (id) emit(id);
      }
    } catch { /* never break the page */ }
    return origFetch.apply(this, arguments);
  };

  const urls = new WeakMap();
  XMLHttpRequest.prototype.open = function (method, url) {
    try { urls.set(this, String(url || '')); } catch { /* ignore */ }
    return xhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    try {
      if ((urls.get(this) || '').includes(TARGET)) {
        const id = extractPlaylistId(body);
        if (id) emit(id);
      }
    } catch { /* never break the page */ }
    return xhrSend.apply(this, arguments);
  };
  return true;
}
