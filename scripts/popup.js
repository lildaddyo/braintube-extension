// BrainTube Extension - Popup Script
import { signIn, signOut, getSession, getCurrentUser } from './auth.js';
import { processYouTube, getItem, trackEvent } from './api.js';
import { getCurrentVideoInfo, extractVideoId } from './youtube.js';
import { CONFIG, getSession as getStorageSession } from './config.js';

const GOOGLE_BTN_INNER = `
  <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
    <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
    <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
    <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18l2.67-2.07z"/>
    <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/>
  </svg>
  Sign in with Google`;

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
const googleSigninBtn = document.getElementById('google-signin-btn');
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

// ── Toast / error helpers ──────────────────────────────────────────────────────
const toastEl     = document.getElementById('toast');
const authErrorEl = document.getElementById('auth-error');

function showToast(msg, isError = false, duration = 3000) {
  toastEl.textContent = msg;
  toastEl.style.background = isError ? '#7f1d1d' : '#1e293b';
  toastEl.style.display = 'block';
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => { toastEl.style.display = 'none'; }, duration);
}

function showAuthError(msg) {
  authErrorEl.textContent = msg;
  authErrorEl.style.display = msg ? 'block' : 'none';
}

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
    showAuthError('Please enter email and password');
    return;
  }
  showAuthError('');

  signinBtn.disabled = true;
  signinBtn.textContent = 'Signing in...';

  try {
    const session = await signIn(email, password);
    await showMainSection(session);
    await loadCurrentVideo();
  } catch (error) {
    showAuthError(error.message || 'Sign in failed');
    signinBtn.disabled = false;
    signinBtn.textContent = 'Sign In';
  }
}

// Handle save video
async function handleSaveVideo() {
  if (!currentVideo) return;

  // Pre-flight session check — surface 401 cause immediately
  const session = await getStorageSession();
  if (!session?.access_token) {
    showToast('Not signed in — please sign in first', true);
    return;
  }

  saveVideoBtn.disabled = true;
  saveVideoBtn.textContent = '💾 Saving...';
  
  try {
    await processYouTube(currentVideo.url, currentVideo.videoId);
    await trackEvent('extension_video_saved', {
      video_id: currentVideo.videoId,
      source: 'chrome_extension'
    });

    saveVideoBtn.textContent = '✅ Saved!';
    showToast('Video saved! Processing started.');
    await loadCurrentVideo();
  } catch (error) {
    showToast(error.message || 'Failed to save video', true);
    saveVideoBtn.disabled = false;
    saveVideoBtn.textContent = '💾 Save This Video';
  }
}

// Event Listeners
signinBtn.addEventListener('click', handleSignIn);
passwordInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleSignIn();
});

googleSigninBtn.addEventListener('click', () => {
  // Open auth.html in a new tab — it survives popup close and runs
  // launchWebAuthFlow to completion, then saves bt_session to storage.
  chrome.tabs.create({ url: chrome.runtime.getURL('auth.html') });
});

// When bt_session appears in storage (set by auth.html on success),
// reload the popup UI — handles the case where the popup is still open
// or was re-opened by the user after completing sign-in.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.bt_session?.newValue) {
    showMainSection(changes.bt_session.newValue).then(() => loadCurrentVideo());
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
      console.log('[BrainTube] viewNoteBtn tabId:', tabs[0]?.id);
      if (tabs[0]) chrome.sidePanel.open({ tabId: tabs[0].id }).catch(console.error);
    });
  }
});

aiChatBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    console.log('[BrainTube] aiChatBtn tabId:', tabs[0]?.id);
    if (tabs[0]) chrome.sidePanel.open({ tabId: tabs[0].id }).catch(console.error);
  });
});

openLibraryBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: `${CONFIG.WEB_APP_URL}/library` });
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
