// BrainTube Extension - AI conversation capture (claude.ai, chatgpt.com).
// Not a static content script any more (audit 2026-11-01, finding 4): the service worker injects this file
// with chrome.scripting.executeScript only after the user clicks "Save Conversation" in the popup, using the
// activeTab grant from that click. The file evaluates to the extracted conversation, which executeScript
// returns; nothing stays behind in the page and the page is never modified.

(() => {
  function extractClaude() {
    const parts = [];
    const turns = document.querySelectorAll('[data-is-human-turn]');
    if (turns.length > 0) {
      turns.forEach((turn) => {
        const role = turn.getAttribute('data-is-human-turn') === 'true' ? 'Human' : 'Assistant';
        const text = turn.innerText?.trim();
        if (text) parts.push(`${role}: ${text}`);
      });
    } else {
      document.querySelectorAll('.font-claude-message, .whitespace-pre-wrap').forEach((el) => {
        const text = el.innerText?.trim();
        if (text) parts.push(text);
      });
    }
    return parts.join('\n\n');
  }

  function extractChatGPT() {
    const parts = [];
    const messages = document.querySelectorAll('[data-message-author-role]');
    if (messages.length > 0) {
      messages.forEach((msg) => {
        const label = msg.getAttribute('data-message-author-role') === 'user' ? 'Human' : 'Assistant';
        const text = msg.innerText?.trim();
        if (text) parts.push(`${label}: ${text}`);
      });
    } else {
      document.querySelectorAll('[class*="message"]').forEach((el) => {
        const text = el.innerText?.trim();
        if (text && text.length > 10) parts.push(text);
      });
    }
    return parts.join('\n\n');
  }

  let text = '';
  try {
    const host = location.hostname;
    if (host === 'claude.ai') text = extractClaude();
    else if (host === 'chatgpt.com') text = extractChatGPT();
  } catch { text = ''; }

  return {
    text,
    url: location.href,
    title: document.title,
    messageCount: (text.match(/^(Human|Assistant):/gm) || []).length,
  };
})();
