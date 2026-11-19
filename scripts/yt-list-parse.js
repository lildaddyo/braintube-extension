// Pure helpers for the one-click YouTube list import (yt-list-import.js). No DOM, no chrome.*,
// so node tests can load it (yt-list-parse.test.mjs).
(() => {
  // Only the user's own private lists: Watch Later (WL) and Liked videos (LL).
  const LISTS = { WL: 'extension_watch_later', LL: 'extension_liked' };

  function listFromUrl(url) {
    try {
      const u = new URL(url);
      if (!/(^|\.)youtube\.com$/.test(u.hostname) || u.pathname !== '/playlist') return null;
      const id = u.searchParams.get('list');
      return id && LISTS[id] ? { id, source: LISTS[id] } : null;
    } catch { return null; }
  }

  // Video ids from watch links, in page order, each once.
  function videoIdsFromHrefs(hrefs) {
    const out = [];
    const seen = new Set();
    for (const href of hrefs || []) {
      let id = null;
      try { id = new URL(href, 'https://www.youtube.com').searchParams.get('v'); } catch { /* skip */ }
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(id) && !seen.has(id)) { seen.add(id); out.push(id); }
    }
    return out;
  }

  function chunk(list, size) {
    const out = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
  }

  globalThis.btYt = { listFromUrl, videoIdsFromHrefs, chunk };
})();
