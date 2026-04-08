/**
 * BrainTube content script for claude.ai
 * Extracts conversation messages and communicates with the background service worker.
 * Uses broad container selectors only — no fragile class names.
 */
(function () {
  'use strict';

  const PLATFORM = 'claude';
  const SITE_KEY  = 'claude.ai';

  // ── State ─────────────────────────────────────────────────────────────────
  let captureEnabled = true;
  let lastActivityAt = Date.now();
  let lastMessageCount = 0;
  let indicator = null;
  let observer = null;

  // ── Conversation extraction ───────────────────────────────────────────────
  /**
   * Claude.ai marks human turns with data-is-human-turn="true" and AI turns
   * with data-is-human-turn="false". Falls back to main element text if not found.
   */
  function extractConversation() {
    const messages = [];

    // Strategy 1: data-is-human-turn attribute (Claude.ai stable attribute)
    const turns = document.querySelectorAll('[data-is-human-turn]');
    if (turns.length > 0) {
      turns.forEach(el => {
        const isHuman = el.getAttribute('data-is-human-turn') === 'true';
        const text = (el.innerText || '').trim();
        if (text) {
          messages.push({
            role: isHuman ? 'user' : 'assistant',
            text,
            is_user_created: isHuman,
          });
        }
      });
    }

    // Strategy 2: look for role-based containers
    if (messages.length === 0) {
      const roleEls = document.querySelectorAll('[role="row"], [role="listitem"]');
      roleEls.forEach(el => {
        const text = (el.innerText || '').trim();
        if (text && text.length > 10) {
          messages.push({ role: 'conversation', text, is_user_created: false });
        }
      });
    }

    // Strategy 3: full main element fallback
    if (messages.length === 0) {
      const main = document.querySelector('main')
                || document.querySelector('[role="main"]')
                || document.body;
      const text = (main.innerText || '').trim();
      if (text) messages.push({ role: 'conversation', text, is_user_created: false });
    }

    return messages;
  }

  function getConversationText(messages) {
    return messages
      .map(m => {
        const label = m.role === 'user' ? 'Human' : 'Claude';
        return `${label}: ${m.text}`;
      })
      .join('\n\n---\n\n');
  }

  function getMessageCount() {
    return document.querySelectorAll('[data-is-human-turn]').length
        || document.querySelectorAll('[role="listitem"]').length;
  }

  // ── Capture active indicator ──────────────────────────────────────────────
  function showIndicator() {
    if (indicator) return;
    indicator = document.createElement('div');
    indicator.id = 'braintube-capture-indicator';
    indicator.title = 'BrainTube capture active — click to open extension';
    indicator.style.cssText = [
      'position:fixed', 'bottom:16px', 'right:16px', 'z-index:2147483647',
      'width:32px', 'height:32px', 'border-radius:50%',
      'background:#f97316', 'color:#fff',
      'font:bold 11px/32px Arial,sans-serif', 'text-align:center',
      'cursor:pointer', 'box-shadow:0 2px 8px rgba(0,0,0,.35)',
      'user-select:none', 'transition:opacity .2s',
    ].join(';');
    indicator.textContent = 'BT';
    indicator.addEventListener('click', () => chrome.runtime.sendMessage({ action: 'open_popup' }));
    document.body.appendChild(indicator);
  }

  function hideIndicator() {
    if (indicator) { indicator.remove(); indicator = null; }
  }

  function pulseIndicator() {
    if (!indicator) return;
    indicator.style.opacity = '0.5';
    setTimeout(() => { if (indicator) indicator.style.opacity = '1'; }, 400);
  }

  // ── Activity tracking (for inactivity auto-save) ──────────────────────────
  function onActivity() {
    lastActivityAt = Date.now();
    chrome.runtime.sendMessage({
      action: 'activity_ping',
      tabId: null, // background infers from sender
      platform: PLATFORM,
    }).catch(() => {});
  }

  ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt =>
    document.addEventListener(evt, onActivity, { passive: true })
  );

  // ── Push conversation state to background whenever messages change ────────
  function pushConversationState() {
    const messages = extractConversation();
    if (messages.length === 0) return;
    const text = getConversationText(messages);
    chrome.runtime.sendMessage({
      action: 'conversation_update',
      platform: PLATFORM,
      url: location.href,
      title: document.title || 'Claude conversation',
      text,
      messageCount: messages.length,
    }).catch(() => {});
  }

  // ── MutationObserver: watch for new messages ──────────────────────────────
  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(() => {
      const count = getMessageCount();
      if (count !== lastMessageCount) {
        lastMessageCount = count;
        pulseIndicator();
        pushConversationState();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ── Message handler (from popup / background) ─────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'extract_conversation') {
      const messages = extractConversation();
      const text = getConversationText(messages);
      sendResponse({
        platform: PLATFORM,
        url: location.href,
        title: document.title || 'Claude conversation',
        text,
        messageCount: messages.length,
      });
      return true;
    }

    if (msg.action === 'set_capture_enabled') {
      captureEnabled = msg.enabled;
      captureEnabled ? showIndicator() : hideIndicator();
      sendResponse({ ok: true });
      return true;
    }
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  async function init() {
    const settings = await chrome.storage.sync.get(['sites', 'autoSave']);
    const sites = settings.sites ?? {};
    captureEnabled = sites[SITE_KEY] !== false; // default enabled

    if (captureEnabled) {
      showIndicator();
      startObserver();
      // Initial push after a short delay to let the page settle
      setTimeout(pushConversationState, 2000);
    }
  }

  // Wait for body to be available
  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }

  // Re-init on SPA navigation (claude.ai is a SPA)
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      lastMessageCount = 0;
      setTimeout(pushConversationState, 1500);
    }
  }, 1000);
})();
