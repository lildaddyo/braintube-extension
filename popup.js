'use strict';

const SUPPORTED_HOSTS = {
  'claude.ai':     'claude',
  'chatgpt.com':   'chatgpt',
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const states = {
  notSupported: document.getElementById('stateNotSupported'),
  disabled:     document.getElementById('stateDisabled'),
  noConfig:     document.getElementById('stateNoConfig'),
  notLoggedIn:  document.getElementById('stateNotLoggedIn'),
  ready:        document.getElementById('stateReady'),
  loading:      document.getElementById('stateLoading'),
  success:      document.getElementById('stateSuccess'),
  error:        document.getElementById('stateError'),
};

const siteBadge      = document.getElementById('siteBadge');
const saveBtn        = document.getElementById('saveBtn');
const saveBtnText    = document.getElementById('saveBtnText');
const messageCount   = document.getElementById('messageCount');
const lastSavedRow   = document.getElementById('lastSavedRow');
const lastSaved      = document.getElementById('lastSaved');
const autoSaveBadge  = document.getElementById('autoSaveBadge');
const loadingMsg     = document.getElementById('loadingMsg');
const savedTitle     = document.getElementById('savedTitle');
const errorMsg       = document.getElementById('errorMsg');

// ── State machine ─────────────────────────────────────────────────────────────
function showState(name) {
  Object.entries(states).forEach(([k, el]) => el.classList.toggle('hidden', k !== name));
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) { showState('notSupported'); return; }

  const url  = new URL(tab.url);
  const host = url.hostname.replace(/^www\./, '');
  const platform = SUPPORTED_HOSTS[host];

  if (!platform) { showState('notSupported'); return; }

  // Show site badge
  siteBadge.textContent = platform === 'claude' ? 'Claude.ai' : 'ChatGPT';
  siteBadge.className   = `site-badge ${platform}`;

  // Check per-site toggle
  const settings = await chrome.storage.sync.get(['sites', 'autoSave']);
  const siteEnabled = (settings.sites ?? {})[host] !== false;
  if (!siteEnabled) { showState('disabled'); return; }

  // Check logged in to brain-tube.com
  const authResp = await chrome.runtime.sendMessage({ action: 'check_auth' });
  if (!authResp?.loggedIn) {
    showState('notLoggedIn'); return;
  }

  // Auto-save badge
  if (settings.autoSave) autoSaveBadge.classList.remove('hidden');

  // Get tab status from background
  const status = await chrome.runtime.sendMessage({ action: 'get_tab_status', tabId: tab.id });
  messageCount.textContent = status?.messageCount > 0 ? status.messageCount : 'Loading…';

  if (status?.savedAt) {
    lastSavedRow.style.display = 'flex';
    lastSaved.textContent = formatRelative(status.savedAt);
  }

  showState('ready');

  // Save button
  saveBtn.addEventListener('click', () => doSave(tab.id, platform));
}

// ── Save flow ─────────────────────────────────────────────────────────────────
async function doSave(tabId, platform) {
  saveBtn.disabled   = true;
  saveBtnText.textContent = 'Saving…';
  loadingMsg.textContent  = 'Summarising conversation…';
  showState('loading');

  const resp = await chrome.runtime.sendMessage({ action: 'save_conversation', tabId });

  if (resp?.ok) {
    savedTitle.textContent = `"${resp.title}"`;
    showState('success');
  } else {
    const err = resp?.error ?? 'Unknown error occurred';
    if (err.startsWith('NOT_LOGGED_IN:')) {
      showState('notLoggedIn');
    } else if (err.startsWith('SESSION_EXPIRED:')) {
      errorMsg.textContent = 'Session expired — please refresh brain-tube.com and try again';
      showState('error');
    } else {
      errorMsg.textContent = err;
      showState('error');
    }
  }
}

// ── Button wiring ─────────────────────────────────────────────────────────────
document.getElementById('settingsBtn').addEventListener('click', () =>
  chrome.runtime.openOptionsPage()
);
document.getElementById('configLink')?.addEventListener('click', (e) => {
  e.preventDefault(); chrome.runtime.openOptionsPage();
});
document.getElementById('enableLink')?.addEventListener('click', (e) => {
  e.preventDefault(); chrome.runtime.openOptionsPage();
});
document.getElementById('saveAnotherBtn')?.addEventListener('click', () => init());
document.getElementById('retryBtn')?.addEventListener('click', () => init());

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatRelative(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60)  return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

init();
