// BrainTube Extension - Isolated-world content script on www.youtube.com (top frame only).
// When the signed-in user adds a video to one of their YouTube playlists, the service worker imports that
// playlist into their BrainTube library (background playlist sync, disclosed in the store listing).
//
// Security (audit 2026-11-01, finding 1): see page-world-shim.js for the handshake. This script
//   - makes a per-load nonce and asks the service worker to inject the MAIN-world shim with it,
//   - accepts exactly one port handshake carrying that nonce, then adds only from that port,
//   - drops ids that are not user playlists (PL + 16/32 chars), adds without a trusted user input
//     (click, tap or key press) in the last 15 seconds, repeats within 5 s and more than 5 per minute.
// The old DOM fallback (reading "Saved to <name>" toasts and data-id attributes) is gone: page scripts can
// write any DOM they like, so it could not be trusted.

(() => {
  'use strict';

  const PLAYLIST_ID     = /^PL[A-Za-z0-9_-]{16}(?:[A-Za-z0-9_-]{16})?$/;
  const GESTURE_MS      = 15_000;
  const COOLDOWN_MS     = 5_000;
  const WINDOW_MS       = 60_000;
  const MAX_PER_WINDOW  = 5;

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const nonce = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

  let port = null;
  let lastGesture = -Infinity;
  const lastSent = new Map();
  let sentStamps = [];

  // isTrusted is set by the browser only for real user input; page scripts cannot fake it.
  for (const type of ['pointerdown', 'keydown']) {
    window.addEventListener(type, (e) => { if (e.isTrusted) lastGesture = Date.now(); }, { capture: true, passive: true });
  }

  function allow(id) {
    const now = Date.now();
    if (now - lastGesture > GESTURE_MS) return false;
    if (now - (lastSent.get(id) ?? -Infinity) < COOLDOWN_MS) return false;
    sentStamps = sentStamps.filter((s) => now - s < WINDOW_MS);
    if (sentStamps.length >= MAX_PER_WINDOW) return false;
    lastSent.set(id, now);
    sentStamps.push(now);
    return true;
  }

  function onPortMessage(evt) {
    const data = evt.data;
    if (!data || data.type !== 'PLAYLIST_ADD') return;
    const id = data.playlistId;
    if (typeof id !== 'string' || !PLAYLIST_ID.test(id)) return;
    if (!allow(id)) return;
    chrome.runtime.sendMessage({ type: 'PLAYLIST_ADD_EVENT', youtube_playlist_id: id })
      .catch(() => { /* service worker restarting; the next add will sync */ });
  }

  function onHandshake(evt) {
    if (evt.source !== window || port) return;
    const data = evt.data;
    if (!data || data.source !== 'BT' || data.type !== 'BT_PORT' || data.nonce !== nonce) return;
    if (!evt.ports || evt.ports.length !== 1) return;
    port = evt.ports[0];
    window.removeEventListener('message', onHandshake, true);
    port.onmessage = onPortMessage;
  }

  window.addEventListener('message', onHandshake, true);
  chrome.runtime.sendMessage({ type: 'INSTALL_PLAYLIST_SHIM', nonce })
    .catch(() => { /* no shim this load: playlist adds are simply not detected */ });
})();
