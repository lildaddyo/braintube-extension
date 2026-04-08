/**
 * BrainTube content script for chatgpt.com
 * Extracts conversation messages and communicates with the background service worker.
 * Uses broad container selectors only — no fragile class names.
 */
(function () {
  'use strict';

  const PLATFORM = 'chatgpt';
  const SITE_KEY  = 'chatgpt.com';

  // ── State ─────────────────────────────────────────────────────────────────
  let captureEnabled = true;
  let lastActivityAt = Date.now();
  let lastMessageCount = 0;
  let indicator = null;
  let observer = null;

  // ── Conversation extraction ───────────────────────────────────────────────
  /**
   * ChatGPT marks messages with data-message-author-role="user"|"assistant".
   * Falls back to main element text content if the attribute is absent.
   */
  function extractConversation() {
    const messages = [];

    // Strategy 1: data-message-author-role (ChatGPT stable attribute)
    const roleEls = document.querySelectorAll('[data-message-author-role]');
    if (roleEls.length > 0) {
      roleEls.forEach(el => {
        const role = el.getAttribute('data-message-author-role');
        if (role !== 'user' && role !== 'assistant') return;
        const text = (el.innerText || '').trim();
        if (text) {
          messages.push({
            role,
            text,
            is_user_created: role === 'user',
          });
        }
      });
    }

    // Strategy 2: aria-label message containers
    if (messages.length === 0) {
      const labeled = document.querySelectorAll('[aria-label*="message" i], [aria-label*="response" i]');
      labeled.forEach(el => {
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
        const label = m.role === 'user' ? 'Human' : 'ChatGPT';
        return `${label}: ${m.text}`;
      })
      .join('\n\n---\n\n');
  }

  function getMessageCount() {
    return document.querySelectorAll('[data-message-author-role]').length;
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

  // ── Activity tracking ─────────────────────────────────────────────────────
  function onActivity() {
    lastActivityAt = Date.now();
    chrome.runtime.sendMessage({
      action: 'activity_ping',
      platform: PLATFORM,
    }).catch(() => {});
  }

  ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt =>
    document.addEventListener(evt, onActivity, { passive: true })
  );

  // ── Push conversation state to background ─────────────────────────────────
  function pushConversationState() {
    const messages = extractConversation();
    if (messages.length === 0) return;
    const text = getConversationText(messages);
    chrome.runtime.sendMessage({
      action: 'conversation_update',
      platform: PLATFORM,
      url: location.href,
      title: document.title || 'ChatGPT conversation',
      text,
      messageCount: messages.length,
    }).catch(() => {});
  }

  // ── MutationObserver ──────────────────────────────────────────────────────
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

  // ── Message handler ───────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'extract_conversation') {
      const messages = extractConversation();
      const text = getConversationText(messages);
      sendResponse({
        platform: PLATFORM,
        url: location.href,
        title: document.title || 'ChatGPT conversation',
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
    const settings = await chrome.storage.sync.get(['sites']);
    const sites = settings.sites ?? {};
    captureEnabled = sites[SITE_KEY] !== false; // default enabled

    if (captureEnabled) {
      showIndicator();
      startObserver();
      setTimeout(pushConversationState, 2000);
    }
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }

  // Re-init on SPA navigation
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      lastMessageCount = 0;
      setTimeout(pushConversationState, 1500);
    }
  }, 1000);
})();
