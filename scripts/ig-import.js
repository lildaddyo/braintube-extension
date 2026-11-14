// BrainTube - "Import this page" for Instagram profiles, reels tabs and Saved collections.
// 1. Scroll the grid and collect post links. 2. Open each post (Instagram's own request brings the
// caption and audio track, read by ig-hook.js). 3. Hand caption + audio to the service worker, which
// transcribes and saves it. Read-only on Instagram, one post every few seconds.
(() => {
  if (window.__btIgImport) return;
  window.__btIgImport = true;

  const LIMIT = 50;
  const PAUSE_MS = [2000, 4000];
  const NOT_PROFILE = new Set(['explore', 'reels', 'direct', 'accounts', 'stories', 'p', 'reel', 'tv']);

  const details = new Map(); // code -> item from ig-hook.js
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.source !== 'bt-ig') return;
    const prev = details.get(e.data.item.code);
    // Keep the richest copy: grid responses carry no caption or audio, the post's own response does.
    if (!prev || (!prev.audioUrl && e.data.item.audioUrl) || (!prev.caption && e.data.item.caption)) {
      details.set(e.data.item.code, { ...prev, ...e.data.item });
    }
  });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const pause = () => sleep(PAUSE_MS[0] + Math.random() * (PAUSE_MS[1] - PAUSE_MS[0]));
  const codeOf = (href) => (href.match(/\/(?:reel|p|tv)\/([^/?#]+)/) || [])[1];
  const pageName = () => {
    const [first, second] = location.pathname.split('/').filter(Boolean);
    if (!first || NOT_PROFILE.has(first)) return null;
    return second === 'saved' ? `${first} · Saved` : `@${first}`;
  };

  // ── Panel ───────────────────────────────────────────────────────────────────
  let panel, statusEl, startBtn, stopped = false, running = false;
  const setStatus = (text) => { if (statusEl) statusEl.textContent = text; };

  function mountPanel() {
    if (panel || !pageName()) return;
    panel = document.createElement('div');
    panel.id = 'bt-ig-panel';
    panel.style.cssText = 'position:fixed;right:20px;bottom:90px;z-index:2147483647;background:#111;color:#fff;' +
      'border:1px solid #333;border-radius:12px;padding:12px 14px;width:260px;font:13px/1.4 system-ui,sans-serif;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.4)';
    panel.innerHTML = '<div style="font-weight:600;margin-bottom:6px">🧠 BrainTube</div>' +
      '<div id="bt-ig-status" style="opacity:.85;margin-bottom:10px"></div>' +
      '<button id="bt-ig-start" style="width:100%;padding:8px;border:0;border-radius:8px;background:#7c3aed;color:#fff;font-weight:600;cursor:pointer"></button>';
    document.body.appendChild(panel);
    statusEl = panel.querySelector('#bt-ig-status');
    startBtn = panel.querySelector('#bt-ig-start');
    startBtn.addEventListener('click', () => (running ? (stopped = true) : run()));
    idle();
  }

  function idle() {
    running = false;
    startBtn.textContent = `Import ${pageName()} (up to ${LIMIT})`;
    setStatus('Saves each post with its caption and a transcript of its audio.');
  }

  // ── Steps ───────────────────────────────────────────────────────────────────
  const gridLinks = () => {
    const out = new Map();
    for (const a of document.querySelectorAll('main a[href*="/reel/"], main a[href*="/p/"]')) {
      const code = codeOf(a.getAttribute('href'));
      if (code && !out.has(code)) out.set(code, a.href);
    }
    return out;
  };

  async function collect() {
    const found = new Map();
    let stale = 0;
    // The grid renders lazily, often only after the first scroll: nudge until tiles appear (up to ~15 s).
    for (let i = 0; i < 15 && gridLinks().size === 0 && !stopped; i++) {
      setStatus('Waiting for the grid…');
      window.scrollBy(0, i % 2 ? -300 : 300);
      await sleep(1000);
    }
    while (found.size < LIMIT && stale < 4 && !stopped) {
      const before = found.size;
      for (const [code, href] of gridLinks()) if (found.size < LIMIT) found.set(code, href);
      setStatus(`Finding posts… ${found.size}`);
      window.scrollTo(0, document.body.scrollHeight);
      await pause();
      stale = found.size === before ? stale + 1 : 0;
    }
    window.scrollTo(0, 0);
    return [...found].map(([code, href]) => ({ code, href }));
  }

  // Open the post the way a click would, wait for its own response, then close it.
  async function openForDetails(code) {
    const have = () => details.get(code);
    if (have()?.caption || have()?.audioUrl) return have();
    const a = [...document.querySelectorAll('main a')].find((x) => codeOf(x.getAttribute('href') || '') === code);
    if (!a) return have() || null;
    const before = location.href;
    a.scrollIntoView({ block: 'center' });
    a.click();
    for (let i = 0; i < 20 && !(have()?.caption || have()?.audioUrl); i++) await sleep(300);
    document.querySelectorAll('video').forEach((v) => { v.muted = true; v.pause(); });
    if (location.href !== before) { history.back(); await sleep(800); }
    return have() || null;
  }

  async function audioBase64(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`audio ${res.status}`);
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  async function run() {
    running = true; stopped = false;
    startBtn.textContent = 'Stop';
    let saved = 0, failed = 0;
    try {
      const posts = await collect();
      for (let i = 0; i < posts.length && !stopped; i++) {
        const { code, href } = posts[i];
        setStatus(`Importing ${i + 1} of ${posts.length}… (${saved} saved${failed ? `, ${failed} failed` : ''})`);
        const d = await openForDetails(code);
        let audio = null;
        if (d?.isVideo && d.audioUrl) {
          try { audio = await audioBase64(d.audioUrl); } catch (e) { console.warn('[BrainTube] audio', code, e); }
        }
        const author = d?.author ? `@${d.author}` : pageName();
        const caption = d?.caption || '';
        const title = `${author}: ${(caption.split('\n')[0] || 'Instagram post').slice(0, 120)}`;
        const res = await chrome.runtime.sendMessage({
          type: 'IG_IMPORT_ITEM',
          item: { url: `https://www.instagram.com/${d?.isVideo === false ? 'p' : 'reel'}/${code}/`, title, caption, audio },
        });
        if (res?.ok) saved++; else { failed++; console.warn('[BrainTube] save', code, res?.error); }
        if (res?.error === 'NOT_LOGGED_IN' || res?.error === 'SESSION_EXPIRED') {
          setStatus('Sign in to the BrainTube extension first, then try again.');
          return;
        }
        if (href && i < posts.length - 1) await pause();
      }
      setStatus(`${stopped ? 'Stopped' : 'Done'}: ${saved} saved to BrainTube${failed ? `, ${failed} failed` : ''}.`);
    } catch (e) {
      setStatus(`Import stopped: ${e.message}`);
    } finally {
      running = false;
      startBtn.textContent = `Import ${pageName() || 'this page'} again`;
    }
  }

  // Service worker reports rate-limit waits so the panel doesn't look stuck.
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'IG_IMPORT_WAIT') setStatus(`Transcription limit reached, resuming in ${Math.ceil(msg.ms / 1000)} s…`);
  });

  // Instagram is a single-page app: show or hide the panel as the route changes.
  let lastPath = '';
  setInterval(() => {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    if (running) return;
    if (pageName()) { if (!panel) mountPanel(); else idle(); panel.style.display = ''; }
    else if (panel) panel.style.display = 'none';
  }, 1000);
})();
