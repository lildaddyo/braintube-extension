// BrainTube - AI Conversation Capture Content Script
// Runs on claude.ai and chatgpt.com
// Extracts conversation text on demand; never modifies the page.

console.log('🧠 BrainTube AI capture loaded on', location.hostname);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'EXTRACT_CONVERSATION') return false;

  try {
    const host = location.hostname;
    let text = '';

    if (host.includes('claude.ai')) {
      text = extractClaude();
    } else if (host.includes('chatgpt.com')) {
      text = extractChatGPT();
    }

    sendResponse({
      text:         text,
      url:          location.href,
      title:        document.title,
      messageCount: countMessages(text),
    });
  } catch (err) {
    sendResponse({ text: '', url: location.href, title: document.title, messageCount: 0 });
  }

  return false; // synchronous
});

// ── Claude.ai extractor ───────────────────────────────────────────────────────

function extractClaude() {
  const parts = [];

  // Each turn has data-is-human-turn attribute
  const turns = document.querySelectorAll('[data-is-human-turn]');

  if (turns.length > 0) {
    turns.forEach(turn => {
      const isHuman = turn.getAttribute('data-is-human-turn') === 'true';
      const role    = isHuman ? 'Human' : 'Assistant';
      const text    = turn.innerText?.trim();
      if (text) parts.push(`${role}: ${text}`);
    });
  } else {
    // Fallback: grab all visible message containers
    document.querySelectorAll('.font-claude-message, .whitespace-pre-wrap').forEach(el => {
      const text = el.innerText?.trim();
      if (text) parts.push(text);
    });
  }

  return parts.join('\n\n');
}

// ── ChatGPT extractor ─────────────────────────────────────────────────────────

function extractChatGPT() {
  const parts = [];

  // Primary: data-message-author-role attribute on message containers
  const messages = document.querySelectorAll('[data-message-author-role]');

  if (messages.length > 0) {
    messages.forEach(msg => {
      const role = msg.getAttribute('data-message-author-role'); // 'user' | 'assistant'
      const label = role === 'user' ? 'Human' : 'Assistant';
      const text  = msg.innerText?.trim();
      if (text) parts.push(`${label}: ${text}`);
    });
  } else {
    // Fallback: aria-label based role containers
    document.querySelectorAll('[class*="message"]').forEach(el => {
      const text = el.innerText?.trim();
      if (text && text.length > 10) parts.push(text);
    });
  }

  return parts.join('\n\n');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function countMessages(text) {
  if (!text) return 0;
  return (text.match(/^(Human|Assistant):/gm) || []).length;
}
