// BrainTube Extension - Side Panel
import { getSession, getCurrentUser } from './auth.js';
import { getItem, getTranscriptSegments, getHighlights, generateSummary, chat, trackEvent,
         getBookmarks, saveBookmark, patchItem } from './api.js';
import { getCurrentVideoInfo, seekToTime, formatTime } from './youtube.js';
import { CONFIG } from './config.js';

// DOM Elements
const loading = document.getElementById('loading');
const empty = document.getElementById('empty');
const videoTitleEl = document.getElementById('video-title');

const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');

const summaryContent = document.getElementById('summary-content');
const transcriptContent = document.getElementById('transcript-content');
const highlightsContent = document.getElementById('highlights-content');

let currentItem = null;
let currentUser = null;
let currentBookmarkFilter = 'unread';

// Initialize
async function init() {
  try {
    const session = await getSession();
    if (!session) {
      showEmpty('Please sign in to use BrainTube');
      return;
    }
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const videoInfo = await getCurrentVideoInfo(tab);
    
    if (!videoInfo) {
      showEmpty('Open a YouTube video to use this feature');
      return;
    }
    
    currentUser = await getCurrentUser();
    loadBookmarks('unread');
    currentItem = await getItem(videoInfo.videoId, currentUser.id);
    
    if (!currentItem) {
      showEmpty();
      return;
    }
    
    videoTitleEl.textContent = currentItem.title || 'YouTube Video';
    await loadAllContent();
    
  } catch (error) {
    console.error('Init error:', error);
    showEmpty('Failed to load video data');
  } finally {
    loading.style.display = 'none';
  }
}

function showEmpty(message) {
  loading.style.display = 'none';
  empty.style.display = 'block';
  tabContents.forEach(tc => tc.style.display = 'none');
  
  if (message) {
    empty.querySelector('p').textContent = message;
  }
}

async function loadAllContent() {
  await loadSummary();
  await loadTranscript();
  await loadHighlights();
  initChat();
}

// Load summary
async function loadSummary() {
  let html = '';
  
  // Status badge
  const statusClass = currentItem.status === CONFIG.STATUS.INDEXED ? 'indexed' : 'processing';
  const statusText = currentItem.status === CONFIG.STATUS.INDEXED ? '🟢 Ready' : '🟡 Processing';
  html += `<div class="status-badge ${statusClass}">${statusText}</div>`;
  
  // Generate summary button if needed
  if (currentItem.status !== CONFIG.STATUS.INDEXED) {
    html += `<button class="btn-primary" id="generate-btn">🤖 Generate AI Summary</button>`;
  }
  
  // Summary
  if (currentItem.summary) {
    html += `<div class="card">
      <h3>Summary</h3>
      <p>${currentItem.summary}</p>
    </div>`;
  }
  
  // Key Takeaways
  if (currentItem.key_takeaways?.length > 0) {
    html += `<div class="card">
      <h3>Key Takeaways</h3>
      <ul>${currentItem.key_takeaways.map(t => `<li>${t}</li>`).join('')}</ul>
    </div>`;
  }
  
  summaryContent.innerHTML = html;
  
  // Add generate button handler
  const generateBtn = document.getElementById('generate-btn');
  if (generateBtn) {
    generateBtn.addEventListener('click', async () => {
      generateBtn.disabled = true;
      generateBtn.textContent = '⏳ Processing...';
      
      try {
        await generateSummary(currentItem.id);
        generateBtn.textContent = '✅ Started! Refresh in a minute';
      } catch (error) {
        console.error('Failed to generate summary:', error);
        generateBtn.disabled = false;
        generateBtn.textContent = '❌ Failed — try again';
      }
    });
  }
}

// Load transcript
async function loadTranscript() {
  const segments = await getTranscriptSegments(currentItem.id);
  
  if (segments.length === 0) {
    transcriptContent.innerHTML = '<div class="empty"><p>No transcript available</p></div>';
    return;
  }
  
  let html = '';
  segments.forEach(seg => {
    html += `
      <div class="transcript-segment" data-time="${seg.start_time_sec}">
        <div class="segment-time">${formatTime(seg.start_time_sec)}</div>
        <div class="segment-text">${seg.text}</div>
      </div>
    `;
  });
  
  transcriptContent.innerHTML = html;
  
  // Add click handlers
  document.querySelectorAll('.transcript-segment').forEach(seg => {
    seg.addEventListener('click', () => {
      const time = parseFloat(seg.dataset.time);
      seekToTime(time);
    });
  });
}

// Load highlights
async function loadHighlights() {
  const highlights = await getHighlights(currentItem.id);
  
  if (highlights.length === 0) {
    highlightsContent.innerHTML = '<div class="empty"><p>No highlights yet</p></div>';
    return;
  }
  
  let html = '';
  highlights.forEach(h => {
    html += `
      <div class="highlight-card">
        <div class="highlight-text">${h.text}</div>
        ${h.note ? `<div class="highlight-note">${h.note}</div>` : ''}
      </div>
    `;
  });
  
  highlightsContent.innerHTML = html;
}

// Conversation history for multi-turn context
let conversationHistory = [];

// Initialize chat
function initChat() {
  conversationHistory = [];
  addMessage('assistant', '👋 Hi! Ask me anything about this video!');

  if (currentItem.status !== CONFIG.STATUS.INDEXED) {
    addMessage('assistant', '⚠️ Note: This video is still processing. Chat will work once it\'s indexed.');
  }
}

// Send chat message
async function sendChat() {
  const message = chatInput.value.trim();
  if (!message) return;

  if (currentItem.status !== CONFIG.STATUS.INDEXED) {
    addMessage('assistant', '⏳ This video is still processing. Please wait until it\'s indexed before chatting.');
    return;
  }

  // Append user turn to history and UI
  conversationHistory.push({ role: 'user', content: message });
  addMessage('user', message);
  chatInput.value = '';

  const loadingId = 'msg-' + Date.now();
  addMessage('assistant', '💭 Thinking...', loadingId);
  chatSend.disabled = true;

  try {
    // Send full history so the edge function has multi-turn context
    const reply = await chat(conversationHistory, currentItem.id);

    document.getElementById(loadingId)?.remove();
    addMessage('assistant', reply);

    // Append assistant turn so next send includes it
    conversationHistory.push({ role: 'assistant', content: reply });

    await trackEvent('extension_chat_message', { item_id: currentItem.id });
  } catch (error) {
    document.getElementById(loadingId)?.remove();
    addMessage('assistant', '❌ Failed to get response: ' + error.message);
    // Remove the failed user turn from history so it can be retried
    conversationHistory.pop();
  } finally {
    chatSend.disabled = false;
  }
}

// Convert a subset of markdown to safe HTML for assistant chat bubbles.
// User messages stay as plain text (textContent) to prevent XSS.
function renderMarkdown(raw) {
  // 1. Escape HTML entities so user-supplied chars can't break the markup.
  const esc = s => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // 2. Apply inline styles (bold, italic, code) to an already-escaped line.
  const inline = s => s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/`(.+?)`/g,       '<code>$1</code>');

  const lines  = raw.split('\n');
  const parts  = [];
  let inList   = false;

  for (const line of lines) {
    const e = esc(line);

    if (/^### /.test(line)) {
      if (inList) { parts.push('</ul>'); inList = false; }
      parts.push(`<h4>${inline(e.slice(4))}</h4>`);
    } else if (/^## /.test(line)) {
      if (inList) { parts.push('</ul>'); inList = false; }
      parts.push(`<h3>${inline(e.slice(3))}</h3>`);
    } else if (/^# /.test(line)) {
      if (inList) { parts.push('</ul>'); inList = false; }
      parts.push(`<h2>${inline(e.slice(2))}</h2>`);
    } else if (/^[-*] /.test(line)) {
      if (!inList) { parts.push('<ul>'); inList = true; }
      parts.push(`<li>${inline(e.slice(2))}</li>`);
    } else if (line.trim() === '') {
      if (inList) { parts.push('</ul>'); inList = false; }
      parts.push('<br>');
    } else {
      if (inList) { parts.push('</ul>'); inList = false; }
      parts.push(`<span>${inline(e)}</span><br>`);
    }
  }
  if (inList) parts.push('</ul>');
  return parts.join('');
}

function addMessage(role, text, id) {
  const msgEl = document.createElement('div');
  msgEl.className = `message ${role}`;
  if (id) msgEl.id = id;
  if (role === 'assistant') {
    // Render markdown for AI responses; user messages stay as plain text.
    msgEl.innerHTML = renderMarkdown(text);
  } else {
    msgEl.textContent = text;
  }
  chatMessages.appendChild(msgEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Tab switching
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tabContents.forEach(tc => tc.classList.remove('active'));
    
    tab.classList.add('active');
    const tabId = tab.dataset.tab;
    document.getElementById(`tab-${tabId}`).classList.add('active');
  });
});

// Chat events
chatSend.addEventListener('click', sendChat);
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChat();
  }
});

// Initialize
init();

// ── Bookmarks ─────────────────────────────────────────────────────────────────

function bmTimeAgo(isoDate) {
  if (!isoDate) return '';
  const ms = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 2)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString();
}

function bmDomain(url) {
  if (!url) return '';
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function loadBookmarks(filter) {
  if (!currentUser) return;
  currentBookmarkFilter = filter;
  const list = document.getElementById('bookmarks-list');
  if (!list) return;
  list.innerHTML = '<div class="bookmarks-empty">Loading…</div>';
  try {
    const items = await getBookmarks(currentUser.id, filter);
    renderBookmarks(items);
  } catch (err) {
    console.error('loadBookmarks error:', err);
    list.innerHTML = '<div class="bookmarks-empty">Failed to load bookmarks.</div>';
  }
}

function renderBookmarks(items) {
  const list = document.getElementById('bookmarks-list');
  if (!list) return;
  if (!items.length) {
    const labels = { unread: 'unread bookmarks', read: 'read bookmarks', all: 'bookmarks' };
    list.innerHTML = `<div class="bookmarks-empty">No ${labels[currentBookmarkFilter] || 'bookmarks'} yet.<br>Save pages for later using the button above.</div>`;
    return;
  }
  list.innerHTML = '';
  items.forEach(b => {
    const domain = bmDomain(b.source_url);
    const tags   = Array.isArray(b.tags) ? b.tags : [];
    const when   = bmTimeAgo(b.bookmarked_at || b.created_at);
    const el     = document.createElement('div');
    el.className = `bookmark-item${b.is_read ? ' bm-item-read' : ''}`;
    el.dataset.id = b.id;
    el.innerHTML = `
      <img class="bookmark-favicon"
           src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain||'example.com')}&sz=16"
           alt="" onerror="this.style.display='none'">
      <div class="bookmark-body">
        <div class="bookmark-title" title="${escHtml(b.title)}">${escHtml(b.title)}</div>
        ${domain ? `<div class="bookmark-domain">${escHtml(domain)}</div>` : ''}
        ${tags.length ? `<div class="bookmark-tags-row">${tags.map(t=>`<span class="tag-pill">${escHtml(t)}</span>`).join('')}</div>` : ''}
        ${when ? `<div class="bookmark-time">${when}</div>` : ''}
      </div>
      <div class="bookmark-actions">
        <button class="bm-action-btn bm-read-btn" title="${b.is_read?'Mark unread':'Mark as read'}">${b.is_read?'↩':'✓'}</button>
        <button class="bm-action-btn bm-remove-btn" title="Remove bookmark">×</button>
      </div>`;

    el.querySelector('.bookmark-title').addEventListener('click', () => {
      if (b.source_url) chrome.tabs.create({ url: b.source_url });
    });

    el.querySelector('.bm-read-btn').addEventListener('click', async e => {
      e.stopPropagation();
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const newRead = !b.is_read;
        await patchItem(b.id, { is_read: newRead });
        b.is_read = newRead;
        btn.textContent = newRead ? '↩' : '✓';
        btn.title = newRead ? 'Mark unread' : 'Mark as read';
        el.classList.toggle('bm-item-read', newRead);
        if (currentBookmarkFilter !== 'all') {
          el.style.transition = 'opacity 0.2s';
          el.style.opacity = '0';
          setTimeout(() => { el.remove(); bmCheckEmpty(); }, 220);
        }
      } catch (err) { console.error('patchItem error:', err); }
      finally { btn.disabled = false; }
    });

    el.querySelector('.bm-remove-btn').addEventListener('click', async e => {
      e.stopPropagation();
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        await patchItem(b.id, { is_bookmark: false, bookmarked_at: null });
        el.style.transition = 'opacity 0.2s';
        el.style.opacity = '0';
        setTimeout(() => { el.remove(); bmCheckEmpty(); }, 220);
      } catch (err) { console.error('patchItem error:', err); btn.disabled = false; }
    });

    list.appendChild(el);
  });
}

function bmCheckEmpty() {
  const list = document.getElementById('bookmarks-list');
  if (list && !list.querySelectorAll('.bookmark-item').length) loadBookmarks(currentBookmarkFilter);
}

async function bmSaveCurrentPage() {
  const btn = document.getElementById('bookmark-this-page');
  if (!currentUser) { btn.textContent = '⚠️ Sign in first'; return; }
  btn.disabled = true;
  btn.textContent = '⏳ Saving…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url   = tab?.url || '';
    const title = tab?.title?.replace(/ [-–|].*$/, '').trim() || url;
    const rawTags = (document.getElementById('bookmark-tags-input')?.value || '');
    const tags = rawTags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    await saveBookmark(currentUser.id, title, url, tags);
    if (document.getElementById('bookmark-tags-input')) document.getElementById('bookmark-tags-input').value = '';
    btn.textContent = '✅ Saved!';
    setTimeout(() => { btn.textContent = '🔖 Bookmark this page'; btn.disabled = false; }, 1800);
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    const unreadPill = document.querySelector('.filter-pill[data-filter="unread"]');
    if (unreadPill) unreadPill.classList.add('active');
    loadBookmarks('unread');
  } catch (err) {
    console.error('saveBookmark error:', err);
    btn.textContent = '❌ Failed — try again';
    btn.disabled = false;
  }
}

// Bookmark tab button click — show the tab even in empty state
document.querySelectorAll('.tab').forEach(tab => {
  if (tab.dataset.tab === 'bookmarks') {
    tab.addEventListener('click', () => {
      // hide empty/loading overlays so bookmark list shows through
      document.getElementById('empty').style.display  = 'none';
      document.getElementById('loading').style.display = 'none';
      // show the bookmarks content directly
      document.querySelectorAll('.tab-content').forEach(tc => {
        tc.style.display = tc.id === 'tab-bookmarks' ? '' : 'none';
        tc.classList.remove('active');
      });
      document.getElementById('tab-bookmarks').classList.add('active');
    });
  }
});

// Filter pills
document.querySelectorAll('.filter-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    loadBookmarks(pill.dataset.filter);
  });
});

// Bookmark save button
const bmSaveBtn = document.getElementById('bookmark-this-page');
if (bmSaveBtn) bmSaveBtn.addEventListener('click', bmSaveCurrentPage);
