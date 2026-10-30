// BrainTube - Instagram page hook (MAIN world, document_start).
// Reads the JSON responses Instagram's own page already loads (no extra requests to Instagram)
// and hands every media object it sees to ig-import.js through window.postMessage.
(() => {
  if (window.__btIgHook) return;
  window.__btIgHook = true;

  const audioUrl = (m) => {
    const mpd = m.video_dash_manifest;
    if (!mpd) return null;
    const set = mpd.split('<AdaptationSet').find((s) => /contentType="audio"/.test(s));
    const url = set && (set.match(/<BaseURL>([^<]+)<\/BaseURL>/) || [])[1];
    return url ? url.replace(/&amp;/g, '&') : null;
  };

  const take = (m) => {
    if (!m || typeof m !== 'object' || !m.code || m.media_type == null) return;
    window.postMessage({
      source: 'bt-ig',
      item: {
        code: m.code,
        author: m.user?.username || m.owner?.username || null,
        caption: m.caption?.text || '',
        takenAt: m.taken_at || null,
        isVideo: m.media_type === 2,
        duration: m.video_duration || null,
        audioUrl: audioUrl(m),
      },
    }, location.origin);
  };

  const walk = (o, depth = 0) => {
    if (!o || typeof o !== 'object' || depth > 25) return;
    if (Array.isArray(o)) { o.forEach((x) => walk(x, depth + 1)); return; }
    take(o);
    for (const k in o) walk(o[k], depth + 1);
  };

  const sniff = (text) => {
    if (!text || text[0] !== '{') return;
    try { walk(JSON.parse(text)); } catch { /* not JSON */ }
  };

  const origFetch = window.fetch;
  window.fetch = async (...args) => {
    const res = await origFetch(...args);
    res.clone().text().then(sniff).catch(() => {});
    return res;
  };
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (...args) {
    this.addEventListener('load', () => {
      if (this.responseType === '' || this.responseType === 'text') sniff(this.responseText);
    });
    return origOpen.apply(this, args);
  };
})();
