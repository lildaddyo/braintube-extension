// BrainTube Extension - Popup Script
import { signIn, signOut, getSession, getCurrentUser } from './auth.js';
import { processYouTube, getItem, trackEvent, saveWebPage, saveBookmark } from './api.js';
import { getCurrentVideoInfo, extractVideoId } from './youtube.js';
import { CONFIG, getSession as getStorageSession } from './config.js';

// Google OAuth client ID — must match Google Cloud Console + Supabase provider config.
// Redirect URI: chrome.identity.getRedirectURL() (no suffix).
const GOOGLE_CLIENT_ID = '605016349499-803pbseargk44vm20k6qgv1th7fqsarm.apps.googleusercontent.com';

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
const saveUrlBtn = document.getElementById('save-url-btn');
const bookmarkBtn = document.getElementById('bookmark-btn');
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

  // Guard: briefly disable the "Open Library" button so that any residual
  // keypress or focus event from the auth flow cannot accidentally fire it
  // during the transition from the auth view to the main view.
  openLibraryBtn.disabled = true;
  setTimeout(() => { openLibraryBtn.disabled = false; }, 800);

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

// Handle Google sign-in — runs entirely inside the popup.
// chrome.identity.launchWebAuthFlow opens Chrome's OAuth modal (not a new tab),
// which auto-closes on completion. The popup stays open throughout.
// No auth.html tab is created; the user never leaves their current page.
async function handleGoogleSignIn() {
  showAuthError('');
  googleSigninBtn.disabled = true;
  googleSigninBtn.textContent = '⏳ Opening Google sign-in…';

  try {
    // chrome.identity.getRedirectURL() returns the canonical chromiumapp.org
    // URL Chrome passes to launchWebAuthFlow. Must match exactly what is
    // registered in Google Cloud Console → Authorized redirect URIs.
    const redirectUri = chrome.identity.getRedirectURL();
    console.log('[BrainTube] Google OAuth redirect_uri:', redirectUri);

    // Nonce handling:
    //   rawNonce  → sent to Supabase  (Supabase hashes it and checks JWT claim)
    //   hashedNonce → sent to Google  (Google embeds it as-is in id_token JWT)
    const rawNonce    = crypto.randomUUID();
    const encoder     = new TextEncoder();
    const hashBuffer  = await crypto.subtle.digest('SHA-256', encoder.encode(rawNonce));
    const hashedNonce = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Build Google OAuth URL directly — bypasses Supabase's /auth/v1/authorize
    // endpoint entirely, which is what caused the brain-tube.com 302 redirect.
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id',     GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'id_token');
    authUrl.searchParams.set('redirect_uri',  redirectUri);
    authUrl.searchParams.set('scope',         'openid email profile');
    authUrl.searchParams.set('nonce',         hashedNonce);

    // launchWebAuthFlow opens Chrome's own OAuth modal window.
    // The popup stays alive during the flow; the modal auto-closes on success.
    const redirectedTo = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: authUrl.href, interactive: true },
        (result) => {
          if (chrome.runtime.lastError || !result) {
            reject(new Error(chrome.runtime.lastError?.message ?? 'Sign-in cancelled'));
          } else {
            resolve(result);
          }
        }
      );
    });

    console.log('[BrainTube] Google redirect received');

    // Do NOT use new URL().hash — it keeps the leading '#', making the first
    // key "#id_token" instead of "id_token" and breaking the lookup.
    const hashString = redirectedTo.split('#')[1] || '';
    const params     = new URLSearchParams(hashString);
    const idToken    = params.get('id_token');

    if (!idToken) {
      const err = params.get('error') ?? 'id_token not found in redirect hash';
      console.error('[BrainTube] Could not extract id_token. hash:', hashString);
      throw new Error(err);
    }

    googleSigninBtn.textContent = '⏳ Verifying…';

    // Exchange id_token for a Supabase session — pure fetch, no browser redirect.
    const res = await fetch(
      `${CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=id_token`,
      {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey':       CONFIG.SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          provider:  'google',
          id_token:  idToken,
          nonce:     rawNonce,  // raw nonce — Supabase hashes this and checks JWT claim
        }),
      }
    );

    console.log('[BrainTube] Supabase token status:', res.status);
    const data = await res.json();
    console.log('[BrainTube] Supabase response keys:', Object.keys(data));

    if (!res.ok || !data.access_token) {
      throw new Error(data.error_description ?? data.msg ?? `HTTP ${res.status}`);
    }

    const session = {
      access_token:  data.access_token,
      refresh_token: data.refresh_token,
      expires_in:    data.expires_in ?? 3600,
      token_type:    'bearer',
      user:          data.user,
    };

    // Write both keys so getHeaders() in config.js always finds the token.
    await chrome.storage.local.set({ bt_session: session, session: session });
    console.log('✅ Google sign-in complete:', data.user?.email);

    // Update popup UI inline — no tab switch, no storage.onChanged needed.
    await showMainSection(session);
    await loadCurrentVideo();

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[BrainTube] Google sign-in failed:', msg);
    showAuthError(
      msg.toLowerCase().includes('cancel') ? 'Sign-in was cancelled' : `Sign-in failed: ${msg}`
    );
  } finally {
    googleSigninBtn.disabled = false;
    googleSigninBtn.innerHTML = GOOGLE_BTN_INNER;
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

// Handle Save URL — saves the current tab as a generic web item (any page)
async function handleSaveUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) { showToast('Could not read current tab URL', true); return; }

  saveUrlBtn.disabled = true;
  saveUrlBtn.textContent = '⏳ Saving…';

  try {
    const user = await getCurrentUser();
    if (!user?.id) throw new Error('Not signed in');
    await saveWebPage(user.id, tab.title, tab.url);
    saveUrlBtn.textContent = '✓ Saved!';
    showToast('Page saved to your library!');
    setTimeout(() => { saveUrlBtn.textContent = '➕ Save URL'; saveUrlBtn.disabled = false; }, 2500);
  } catch (err) {
    showToast(err.message || 'Save failed', true);
    saveUrlBtn.textContent = '❌ Error';
    setTimeout(() => { saveUrlBtn.textContent = '➕ Save URL'; saveUrlBtn.disabled = false; }, 2500);
  }
}

// Handle Bookmark — saves the current tab as a bookmark (any page)
async function handleBookmark() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) { showToast('Could not read current tab URL', true); return; }

  bookmarkBtn.disabled = true;
  bookmarkBtn.textContent = '⏳ Saving…';

  try {
    const user = await getCurrentUser();
    if (!user?.id) throw new Error('Not signed in');
    await saveBookmark(user.id, tab.title, tab.url);
    bookmarkBtn.textContent = '✓ Bookmarked!';
    showToast('Bookmarked! Find it in the 🔖 Saved tab.');
    setTimeout(() => { bookmarkBtn.textContent = '🔖 Bookmark'; bookmarkBtn.disabled = false; }, 2500);
  } catch (err) {
    showToast(err.message || 'Bookmark failed', true);
    bookmarkBtn.textContent = '❌ Error';
    setTimeout(() => { bookmarkBtn.textContent = '🔖 Bookmark'; bookmarkBtn.disabled = false; }, 2500);
  }
}

// Event Listeners
signinBtn.addEventListener('click', handleSignIn);
passwordInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleSignIn();
});

// OAuth runs directly in the popup via launchWebAuthFlow — no auth.html tab opened.
googleSigninBtn.addEventListener('click', handleGoogleSignIn);

// Fallback: if bt_session is set by another code path (e.g. a future background
// flow), update the popup UI. Not triggered by the Google sign-in above since
// that path calls showMainSection() directly after the token exchange.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.bt_session?.newValue) {
    console.log('[BrainTube] popup: bt_session set externally — updating UI');
    showMainSection(changes.bt_session.newValue).then(() => loadCurrentVideo());
  }
});

signoutBtn.addEventListener('click', async () => {
  await signOut();
  showAuthSection();
});

saveVideoBtn.addEventListener('click', handleSaveVideo);
saveUrlBtn.addEventListener('click', handleSaveUrl);
bookmarkBtn.addEventListener('click', handleBookmark);

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

openLibraryBtn.addEventListener('click', async (e) => {
  // Hard guard: only proceed on a genuine user gesture. Programmatically
  // dispatched clicks (e.isTrusted === false) are silently blocked, which
  // prevents any automated code path from opening brain-tube.com.
  if (!e.isTrusted) {
    console.warn('[BrainTube] openLibraryBtn: non-trusted click blocked');
    return;
  }
  console.log('[BrainTube] openLibraryBtn: user clicked — opening library tab');

  // Read session from storage and append tokens to the URL hash so the web
  // app can call supabase.auth.setSession() and log the user in automatically.
  const all = await chrome.storage.local.get(['bt_session', 'session']);
  const session = all.bt_session || all.session;
  let url = `${CONFIG.WEB_APP_URL}/library`;
  if (session?.access_token && session?.refresh_token) {
    url += `#access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}&token_type=bearer`;
  }
  chrome.tabs.create({ url });
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
