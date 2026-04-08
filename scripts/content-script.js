// BrainTube Extension - Content Script (YouTube)

console.log('🧠 BrainTube loaded on YouTube');

// Listen for messages from extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SEEK_TO_TIME') {
    seekToTime(message.time);
  }
});

// Seek to specific time in video
function seekToTime(seconds) {
  const video = document.querySelector('video');
  if (video) {
    video.currentTime = seconds;
    video.play();
    console.log(`⏩ Seeking to ${seconds}s`);
  }
}

// Add save button to YouTube (optional enhancement)
function addSaveButton() {
  const actionsBar = document.querySelector('#top-level-buttons-computed');
  if (!actionsBar || document.getElementById('braintube-save-btn')) return;
  
  const btn = document.createElement('button');
  btn.id = 'braintube-save-btn';
  btn.className = 'braintube-btn';
  btn.innerHTML = '🧠 Save';
  btn.title = 'Save to BrainTube';
  
  btn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'SAVE_CURRENT_VIDEO' });
  });
  
  actionsBar.appendChild(btn);
}

// Try to add button when page loads
setTimeout(addSaveButton, 2000);

// Watch for navigation (YouTube is SPA)
let lastUrl = location.href;
new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    if (location.href.includes('/watch')) {
      setTimeout(addSaveButton, 1000);
    }
  }
}).observe(document, { subtree: true, childList: true });
