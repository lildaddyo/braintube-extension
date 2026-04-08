// BrainTube Extension - Popup Script
import { signIn, signOut, getSession, getCurrentUser } from './auth.js';
import { processYouTube, getItem, trackEvent } from './api.js';
import { getCurrentVideoInfo, extractVideoId } from './youtube.js';
import { CONFIG } from './config.js';

const AI_HOSTS = {
  'claude.ai':   { label: 'Claude.ai Conversation', platform: 'claude' },
  'chatgpt.com': { label: 'ChatGPT Conversation',   platform: 'chatgpt' },
};

// DOM Elements
const loading = document.getElementById('loading');
const authSection = document.getElementById('auth');
const mainSection = document.getElementById('main');

const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const signinBtn = document.getElementById('signin-btn');
const webSigninBtn = document.getElementById('web-signin-btn');
const refreshSessionBtn = document.getElementById('refresh-session-btn');
const signoutBtn = document.getElementById('signout-btn');

const searchInput = document.getElementById('search');
const currentVideoCard = document.getElementById('current-video');
const videoTitle = document.getElementById('video-title');
const videoStatus = document.getElementById('video-status');
const userEmail = document.getElementById('user-email');

const viewNoteBtn = document.getElementById('view-note-btn');
const aiChatBtn = document.getElementById('ai-chat-btn');
const saveVideoBtn = document.getElementById('save-video-btn');
const openLibraryBtn = document.getElementById('open-library-btn');

let currentVideo = null;

// Initialize
async function init() {
  try {
    const session = await getSession();
    
    if (session) {
      await showMainSection(session);
      await loadCurrentVideo();
    } else {
      showAuthSection();
    }
  } catch (error) {
    console.error('Init error:', error);
    showAuthSection();
  } finally {
    loading.style.display = 'none';
  }
}

// Show auth section
function showAuthSection() {
  authSection.style.display = 'block';
  mainSection.style.display = 'none';
}

// Show main section
async function showMainSection(session) {
  authSection.style.display = 'none';
  mainSection.style.display = 'block';
  
  const user = await getCurrentUser();
  userEmail.textContent = user?.email || 'User';
  
  await trackEvent('extension_opened');
}

// Load current tab — handles both YouTube and AI conversation sites
async function loadCurrentVideo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // ── AI conversation site ──────────────────────────────────────────────────
    if (tab?.url) {
      const host = new URL(tab.url).hostname.replace(/^www\./, '');
      const aiSite = AI_HOSTS[host];
      if (aiSite) {
        document.getElementById('ai-capture').style.display = 'block';
        document.getElementById('ai-platform-label').textContent = aiSite.label;
        document.getElementById('save-conversation-btn').addEventListener('click', () =>
          handleSaveConversation(tab.id, aiSite.platform)
        );
        // Hide YouTube-only UI — not relevant here
        currentVideoCard.style.display = 'none';
        saveVideoBtn.style.display = 'none';
        return;
      }
    }

    // ── YouTube ───────────────────────────────────────────────────────────────
    currentVideo = await getCurrentVideoInfo(tab);
    
    if (!currentVideo) {
      currentVideoCard.style.display = 'none';
      saveVideoBtn.style.display = 'none';
      return;
    }
    
    // Check if video is saved
    const user = await getCurrentUser();
    const item = await getItem(currentVideo.videoId, user.id);
    
    if (item) {
      // Video is saved
      currentVideoCard.style.display = 'block';
      saveVideoBtn.style.display = 'none';
      
      videoTitle.textContent = item.title || currentVideo.title;
      
      // Show status
      const statusMap = {
        [CONFIG.STATUS.PROCESSING]: '🟡 Processing...',
        [CONFIG.STATUS.NEEDS_SUMMARY]: '🟡 Needs Summary',
        [CONFIG.STATUS.INDEXED]: '🟢 Ready',
        [CONFIG.STATUS.ERROR]: '🔴 Error'
      };
      videoStatus.textContent = statusMap[item.status] || item.status;
      videoStatus.className = `video-status status-${item.status}`;
      
      // Store item for actions
      currentVideo.item = item;
    } else {
      // Video not saved
      currentVideoCard.style.display = 'none';
      saveVideoBtn.style.display = 'block';
    }
  } catch (error) {
    console.error('Error loading video:', error);
  }
}

// Handle save AI conversation
async function handleSaveConversation(tabId, platform) {
  const btn    = document.getElementById('save-conversation-btn');
  const status = document.getElementById('ai-save-status');

  btn.disabled     = true;
  btn.textContent  = '⏳ Saving…';
  status.textContent = 'Summarising on BrainTube server…';

  const resp = await chrome.runtime.sendMessage({
    type: 'SAVE_AI_CONVERSATION',
    tabId,
    platform,
  });

  if (resp?.ok) {
    btn.textContent    = '✅ Saved!';
    status.textContent = resp.title ? `"${resp.title}"` : 'Conversation saved to BrainTube';
  } else {
    const msg = resp?.error ?? 'Unknown error';
    if (msg === 'NOT_LOGGED_IN') {
      status.textContent = 'Sign in to BrainTube first ↑';
    } else if (msg === 'SESSION_EXPIRED') {
      status.textContent = 'Session expired — sign out and back in';
    } else {
      status.textContent = `Error: ${msg}`;
    }
    btn.disabled    = false;
    btn.textContent = '💾 Save Conversation';
  }
}

// Handle sign in
async function handleSignIn() {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  
  if (!email || !password) {
    alert('Please enter email and password');
    return;
  }
  
  signinBtn.disabled = true;
  signinBtn.textContent = 'Signing in...';
  
  try {
    const session = await signIn(email, password);
    await showMainSection(session);
    await loadCurrentVideo();
  } catch (error) {
    alert(error.message || 'Sign in failed');
    signinBtn.disabled = false;
    signinBtn.textContent = 'Sign In';
  }
}

// Handle save video
async function handleSaveVideo() {
  if (!currentVideo) return;
  
  saveVideoBtn.disabled = true;
  saveVideoBtn.textContent = '💾 Saving...';
  
  try {
    await processYouTube(currentVideo.url, currentVideo.videoId);
    await trackEvent('extension_video_saved', {
      video_id: currentVideo.videoId,
      source: 'chrome_extension'
    });
    
    alert('Video saved! Processing started.');
    await loadCurrentVideo();
  } catch (error) {
    alert(error.message || 'Failed to save video');
    saveVideoBtn.disabled = false;
    saveVideoBtn.textContent = '💾 Save This Video';
  }
}

// Event Listeners
signinBtn.addEventListener('click', handleSignIn);
passwordInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleSignIn();
});

webSigninBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: `${CONFIG.WEB_APP_URL}/auth` });
});

refreshSessionBtn.addEventListener('click', async () => {
  refreshSessionBtn.disabled = true;
  refreshSessionBtn.textContent = 'Checking…';
  const session = await getSession();
  if (session) {
    await showMainSection(session);
    await loadCurrentVideo();
  } else {
    refreshSessionBtn.textContent = 'No session found — log in first';
    setTimeout(() => {
      refreshSessionBtn.disabled = false;
      refreshSessionBtn.textContent = '🔄 Refresh Session';
    }, 2500);
  }
});

signoutBtn.addEventListener('click', async () => {
  await signOut();
  showAuthSection();
});

saveVideoBtn.addEventListener('click', handleSaveVideo);

viewNoteBtn.addEventListener('click', () => {
  if (currentVideo?.item) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.sidePanel.open({ tabId: tabs[0].id });
    });
  }
});

aiChatBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.sidePanel.open({ tabId: tabs[0].id });
  });
});

openLibraryBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: CONFIG.WEB_APP_URL });
});

searchInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && searchInput.value.trim()) {
    chrome.tabs.create({ 
      url: `${CONFIG.WEB_APP_URL}/search?q=${encodeURIComponent(searchInput.value.trim())}` 
    });
  }
});

// Initialize
init();
