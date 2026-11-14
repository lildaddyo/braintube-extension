// Runs in MAIN world (page context). Patches fetch + XHR to detect playlist-add
// calls to /youtubei/v1/browse/edit_playlist, then postMessages to the
// isolated content script.

(function () {
  'use strict';

  const TARGET = '/youtubei/v1/browse/edit_playlist';

  function extractPlaylistId(body) {
    try {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      // YouTube sends { playlistId: "PLxxx", ... }
      const id = parsed?.playlistId || parsed?.playlist_id;
      return id && id !== 'WL' ? id : null;
    } catch {
      return null;
    }
  }

  function emit(playlistId) {
    window.postMessage({ source: 'BT', type: 'PLAYLIST_ADD', playlistId }, '*');
  }

  // ── Patch fetch ─────────────────────────────────────────────────────────────
  const _fetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input?.url ?? '';
    if (url.includes(TARGET)) {
      const body = init?.body;
      const id = extractPlaylistId(body);
      if (id) emit(id);
    }
    return _fetch.apply(this, arguments);
  };

  // ── Patch XHR ───────────────────────────────────────────────────────────────
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._btUrl = url || '';
    return _open.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    if (this._btUrl && this._btUrl.includes(TARGET)) {
      const id = extractPlaylistId(body);
      if (id) emit(id);
    }
    return _send.apply(this, arguments);
  };
})();
