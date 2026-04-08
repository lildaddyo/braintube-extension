'use strict';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const autoSaveToggle    = document.getElementById('autoSave');
const siteClaudeToggle  = document.getElementById('siteClaude');
const siteChatgptToggle = document.getElementById('siteChatgpt');
const saveBtn           = document.getElementById('saveBtn');
const toast             = document.getElementById('savedToast');

// ── Load saved settings ───────────────────────────────────────────────────────
async function loadSettings() {
  const s = await chrome.storage.sync.get(['autoSave', 'sites']);

  autoSaveToggle.checked = s.autoSave === true;

  const sites = s.sites ?? {};
  siteClaudeToggle.checked  = sites['claude.ai']   !== false;
  siteChatgptToggle.checked = sites['chatgpt.com'] !== false;
}

// ── Save settings ─────────────────────────────────────────────────────────────
async function saveSettings() {
  await chrome.storage.sync.set({
    autoSave: autoSaveToggle.checked,
    sites: {
      'claude.ai':   siteClaudeToggle.checked,
      'chatgpt.com': siteChatgptToggle.checked,
    },
  });

  propagateSiteSettings();
  showToast();
}

// ── Propagate site settings to open tabs ─────────────────────────────────────
async function propagateSiteSettings() {
  const sites = {
    'claude.ai':   siteClaudeToggle.checked,
    'chatgpt.com': siteChatgptToggle.checked,
  };

  const tabs = await chrome.tabs.query({
    url: ['https://claude.ai/*', 'https://chatgpt.com/*'],
  });

  for (const tab of tabs) {
    if (!tab.id) continue;
    const host = new URL(tab.url).hostname.replace(/^www\./, '');
    const enabled = sites[host] !== false;
    chrome.tabs.sendMessage(tab.id, { action: 'set_capture_enabled', enabled }).catch(() => {});
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function showToast() {
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2200);
}

// ── Wire up ───────────────────────────────────────────────────────────────────
saveBtn.addEventListener('click', saveSettings);

loadSettings();
