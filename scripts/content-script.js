// BrainTube Extension - Content Script (YouTube)

// Diagnostic marker — visible in page console via window.__BRAINTUBE_LOADED__
window.__BRAINTUBE_LOADED__ = true;
console.log('🧠 BrainTube content script loaded');

// ── Seek (called by side-panel via chrome.tabs.sendMessage) ──────────────────

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SEEK_TO_TIME') seekToTime(message.time);
});

function seekToTime(seconds) {
  const video = document.querySelector('video');
  if (video) {
    video.currentTime = seconds;
    video.play();
    console.log(`⏩ BrainTube seeking to ${seconds}s`);
  }
}

// ── Button injection ──────────────────────────────────────────────────────────

// Fallback chain — tried in order, first match wins.
// #top-level-buttons-computed: still the most reliable as of Apr 2026.
// Remaining selectors are progressively broader fallbacks.
const ACTION_BAR_SELECTORS = [
  '#top-level-buttons-computed',
  '#actions.ytd-watch-metadata',
  'ytd-watch-metadata #actions',
  'ytd-watch-metadata',
];

function getActionBar() {
  for (const sel of ACTION_BAR_SELECTORS) {
    const el = document.querySelector(sel);
    if (el) return { el, sel };
  }
  return null;
}

function injectButton() {
  if (!location.pathname.startsWith('/watch')) return;
  // Idempotency — bail if already present
  if (document.getElementById('braintube-watch-btn')) return;

  const hit = getActionBar();
  if (!hit) return;

  const btn = document.createElement('button');
  btn.id = 'braintube-watch-btn';
  btn.className = 'braintube-btn';
  btn.textContent = '🧠 BrainTube';
  btn.title = 'Save to BrainTube';

  // Inline brand styles — flat #866CEF, YouTube action-bar height
  Object.assign(btn.style, {
    background:     '#866CEF',
    color:          '#fff',
    border:         'none',
    borderRadius:   '18px',
    padding:        '0 16px',
    height:         '36px',
    fontSize:       '14px',
    fontWeight:     '600',
    cursor:         'pointer',
    marginLeft:     '8px',
    display:        'inline-flex',
    alignItems:     'center',
    flexShrink:     '0',
    verticalAlign:  'middle',
  });

  btn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'SAVE_CURRENT_VIDEO' });
  });

  hit.el.appendChild(btn);
  console.log('🧠 BrainTube button injected via selector:', hit.sel);
}

// ── SPA navigation handling ───────────────────────────────────────────────────

let _barObserver = null;

function waitForActionBar() {
  // Quick path: action bar already in DOM
  if (getActionBar()) {
    injectButton();
    return;
  }

  // Disconnect any previous pending observer
  _barObserver?.disconnect();

  // Watch for the action bar to appear after YouTube renders the watch page
  _barObserver = new MutationObserver(() => {
    if (getActionBar()) {
      _barObserver.disconnect();
      _barObserver = null;
      injectButton();
    }
  });
  _barObserver.observe(document.body, { childList: true, subtree: true });

  // Safety: disconnect after 15s to avoid leak on pages where it never appears
  setTimeout(() => {
    _barObserver?.disconnect();
    _barObserver = null;
  }, 15_000);
}

function onNavigate() {
  // Remove stale button so it re-injects fresh on the new watch page
  document.getElementById('braintube-watch-btn')?.remove();
  if (location.pathname.startsWith('/watch')) {
    waitForActionBar();
  }
}

// yt-navigate-finish fires after YouTube SPA route change + initial render.
// Cleaner than polling location.href in a MutationObserver.
window.addEventListener('yt-navigate-finish', onNavigate);

// Initial page load (direct URL or hard refresh)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', waitForActionBar);
} else {
  waitForActionBar();
}
