// BrainTube - one-click import of your YouTube Watch Later and Liked videos.
// Shown on youtube.com/playlist?list=WL and ?list=LL, which only you can see when signed in.
// 1. Scroll the list so YouTube loads more of it itself, reading the video links on the page.
// 2. Send the ids in batches to the service worker, which imports them through
//    youtube-bulk-import (same plan cap, credits and duplicate check as the web importer).
// Read-only on YouTube: nothing is changed, and no extra requests go to YouTube.
(() => {
  if (window.__btYtList) return;
  window.__btYtList = true;

  const LIMIT = 500;
  const BATCH = 50;
  const SCROLL_PAUSE_MS = [1200, 2400];
  const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pause = () => sleep(SCROLL_PAUSE_MS[0] + Math.random() * (SCROLL_PAUSE_MS[1] - SCROLL_PAUSE_MS[0]));

  const pageIds = () => btYt.videoIdsFromHrefs(
    [...document.querySelectorAll('ytd-playlist-video-renderer a#video-title, ytd-playlist-video-renderer a#thumbnail')]
      .map((a) => a.getAttribute('href')),
  );

  let panel, statusEl, startBtn, stopped = false, running = false, list = null;
  const setStatus = (text) => { if (statusEl) statusEl.textContent = text; };

  function mountPanel() {
    if (panel) return;
    panel = document.createElement('div');
    panel.id = 'bt-yt-list-panel';
    panel.style.cssText = 'position:fixed;right:20px;bottom:90px;z-index:2147483647;background:#111;color:#fff;' +
      'border:1px solid #333;border-radius:12px;padding:12px 14px;width:270px;font:13px/1.4 system-ui,sans-serif;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.4)';
    const title = document.createElement('div');
    title.style.cssText = 'font-weight:600;margin-bottom:6px';
    title.textContent = '🧠 BrainTube';
    statusEl = document.createElement('div');
    statusEl.style.cssText = 'opacity:.85;margin-bottom:10px';
    startBtn = document.createElement('button');
    startBtn.style.cssText = 'width:100%;padding:8px;border:0;border-radius:8px;background:#7c3aed;color:#fff;font-weight:600;cursor:pointer';
    startBtn.addEventListener('click', () => (running ? (stopped = true) : run()));
    panel.append(title, statusEl, startBtn);
    document.body.appendChild(panel);
    idle();
  }

  function idle() {
    running = false;
    const n = [String(LIMIT)];
    startBtn.textContent = list.id === 'WL' ? t('ytListImportWatchLater', n) : t('ytListImportLiked', n);
    setStatus(t('ytListImportIntro'));
  }

  async function collect() {
    let ids = pageIds(), stale = 0;
    while (ids.length < LIMIT && stale < 3 && !stopped) {
      setStatus(t('ytListImportFinding', [String(ids.length)]));
      window.scrollTo(0, document.documentElement.scrollHeight);
      await pause();
      const next = pageIds();
      stale = next.length === ids.length ? stale + 1 : 0;
      ids = next;
    }
    window.scrollTo(0, 0);
    return ids.slice(0, LIMIT);
  }

  async function run() {
    running = true; stopped = false;
    startBtn.textContent = t('xImportStop');
    let imported = 0, already = 0;
    try {
      const ids = await collect();
      if (!ids.length) { setStatus(t('ytListImportNone')); return; }
      const batches = btYt.chunk(ids, BATCH);
      for (let i = 0; i < batches.length && !stopped; i++) {
        setStatus(t('ytListImportProgress', [String(Math.min((i + 1) * BATCH, ids.length)), String(ids.length), String(imported)]));
        const res = await chrome.runtime.sendMessage({ type: 'YT_LIST_IMPORT', videoIds: batches[i], source: list.source });
        if (!res?.ok) {
          if (res?.error === 'NOT_LOGGED_IN' || res?.error === 'SESSION_EXPIRED') { setStatus(t('xImportSignIn')); return; }
          throw new Error(res?.error || 'import failed');
        }
        imported += res.imported || 0;
        already += res.skipped || 0;
        // Plan cap or credits ran out: the server says why, in the user's words. Stop here.
        if (res.code) { setStatus(t('ytListImportLimited', [String(imported), String(already), res.message || res.code])); return; }
        if (i < batches.length - 1) await pause();
      }
      const counts = [String(imported), String(already)];
      setStatus(stopped ? t('ytListImportStopped', counts) : t('ytListImportDone', counts));
    } catch (e) {
      setStatus(t('xImportError', [e.message]));
    } finally {
      running = false;
      startBtn.textContent = t('xImportAgain');
    }
  }

  // YouTube is a single-page app: show the panel on Watch Later / Liked only.
  setInterval(() => {
    if (running) return;
    const now = btYt.listFromUrl(location.href);
    if (now) {
      const changed = !list || list.id !== now.id;
      list = now;
      if (!panel) mountPanel(); else if (changed) idle();
      panel.style.display = '';
    } else if (panel) panel.style.display = 'none';
  }, 1000);
})();
