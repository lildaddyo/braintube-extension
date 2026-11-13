// BrainTube - X bookmarks page hook (MAIN world, document_start, after x-parse.js).
// Reads the responses x.com's own Bookmarks timeline already loads while you scroll (no extra requests
// to X, no tokens read or stored) and hands the posts to x-import.js through window.postMessage.
(() => {
  if (window.__btXHook) return;
  window.__btXHook = true;

  const BOOKMARKS = /\/graphql\/[^/]+\/(Bookmarks|BookmarkFolderTimeline)\b/;
  const send = (json) => {
    const posts = window.btX?.parseXTimeline(json) || [];
    if (posts.length) window.postMessage({ source: 'bt-x', posts }, location.origin);
  };
  const sniff = (text) => {
    if (!text || text[0] !== '{') return;
    try { send(JSON.parse(text)); } catch { /* not JSON */ }
  };

  const origFetch = window.fetch;
  window.fetch = async (...args) => {
    const res = await origFetch(...args);
    try {
      const url = String(args[0]?.url || args[0] || '');
      if (BOOKMARKS.test(url)) res.clone().text().then(sniff).catch(() => {});
    } catch { /* never break the page */ }
    return res;
  };
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (BOOKMARKS.test(String(url))) {
      this.addEventListener('load', () => {
        if (this.responseType === '' || this.responseType === 'text') sniff(this.responseText);
      });
    }
    return origOpen.call(this, method, url, ...rest);
  };
})();
