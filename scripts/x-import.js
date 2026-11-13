// BrainTube - "Import bookmarks" on x.com. Shown on the Bookmarks page (and bookmark folders).
// 1. Scroll the list so X loads more of your bookmarks itself (x-hook.js reads each response).
// 2. Hand each post's text to the service worker, which saves it to BrainTube.
// Read-only on X: nothing is liked, posted or changed, and no extra requests go to X.
(() => {
  if (window.__btXImport) return;
  window.__btXImport = true;

  const LIMIT = 100;
  const SCROLL_PAUSE_MS = [1500, 3000];
  const t = (key, subs) => chrome.i18n.getMessage(key, subs) || key;
  // Bookmarks live at /i/bookmarks (and /i/bookmarks/<folder>), or under History with the Bookmarks tab open.
  const onBookmarks = () => {
    if (/^\/i\/bookmarks(\/\d+)?\/?$/.test(location.pathname)) return true;
    if (!/^\/i\/history\/?$/.test(location.pathname)) return false;
    const tab = document.querySelector('[role="tab"][aria-selected="true"]');
    return !tab || /bookmark/i.test(tab.textContent || '');
  };

  const posts = new Map(); // id -> post, in the order X returned them
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.source !== 'bt-x') return;
    for (const p of e.data.posts || []) if (!posts.has(p.id)) posts.set(p.id, p);
    if (!running && panel) idle();
  });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pause = () => sleep(SCROLL_PAUSE_MS[0] + Math.random() * (SCROLL_PAUSE_MS[1] - SCROLL_PAUSE_MS[0]));

  // ── Panel ───────────────────────────────────────────────────────────────────
  let panel, statusEl, startBtn, stopped = false, running = false;
  const setStatus = (text) => { if (statusEl) statusEl.textContent = text; };

  function mountPanel() {
    if (panel) return;
    panel = document.createElement('div');
    panel.id = 'bt-x-panel';
    panel.style.cssText = 'position:fixed;right:20px;bottom:90px;z-index:2147483647;background:#111;color:#fff;' +
      'border:1px solid #333;border-radius:12px;padding:12px 14px;width:260px;font:13px/1.4 system-ui,sans-serif;' +
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
    startBtn.textContent = t('xImportButton', [String(LIMIT)]);
    setStatus(t('xImportIntro'));
  }

  // Scroll until LIMIT posts are known or X stops returning new ones.
  async function collect() {
    let stale = 0;
    while (posts.size < LIMIT && stale < 4 && !stopped) {
      const before = posts.size;
      setStatus(t('xImportFinding', [String(posts.size)]));
      window.scrollTo(0, document.body.scrollHeight);
      await pause();
      stale = posts.size === before ? stale + 1 : 0;
    }
    window.scrollTo(0, 0);
    return [...posts.values()].slice(0, LIMIT);
  }

  async function run() {
    running = true; stopped = false;
    startBtn.textContent = t('xImportStop');
    let saved = 0, already = 0, failed = 0;
    try {
      const list = await collect();
      if (!list.length) { setStatus(t('xImportNone')); return; }
      for (let i = 0; i < list.length && !stopped; i++) {
        setStatus(t('xImportProgress', [String(i + 1), String(list.length), String(saved)]));
        const res = await chrome.runtime.sendMessage({ type: 'X_IMPORT_ITEM', post: list[i] });
        if (res?.ok) { if (res.duplicate) already++; else saved++; }
        else {
          failed++;
          console.warn('[BrainTube] X save', list[i].id, res?.error);
          if (res?.error === 'NOT_LOGGED_IN' || res?.error === 'SESSION_EXPIRED') { setStatus(t('xImportSignIn')); return; }
        }
      }
      const counts = [String(saved), String(already), String(failed)];
      setStatus(stopped ? t('xImportStopped', counts) : t('xImportDone', counts));
    } catch (e) {
      setStatus(t('xImportError', [e.message]));
    } finally {
      running = false;
      startBtn.textContent = t('xImportAgain');
    }
  }

  // X is a single-page app: show the panel on the Bookmarks list only.
  setInterval(() => {
    if (running) return;
    if (onBookmarks()) { if (!panel) mountPanel(); panel.style.display = ''; }
    else if (panel) panel.style.display = 'none';
  }, 1000);
})();
