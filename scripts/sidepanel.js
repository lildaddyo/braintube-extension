// BrainTube Extension - Side Panel
import { getSession, getCurrentUser } from './auth.js';
import { getItem, getTranscriptSegments, getHighlights, generateSummary, chat, trackEvent } from './api.js';
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
    
    const user = await getCurrentUser();
    currentItem = await getItem(videoInfo.videoId, user.id);
    
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

function addMessage(role, text, id) {
  const msgEl = document.createElement('div');
  msgEl.className = `message ${role}`;
  if (id) msgEl.id = id;
  msgEl.textContent = text;
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
