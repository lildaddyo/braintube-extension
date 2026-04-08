// BrainTube Extension - YouTube Utilities

// Extract video ID from YouTube URL
export function extractVideoId(url) {
  if (!url) return null;
  
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /[?&]v=([^&]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

// Get current YouTube video info
export async function getCurrentVideoInfo(tab) {
  if (!tab || !tab.url?.includes('youtube.com/watch')) {
    return null;
  }
  
  const videoId = extractVideoId(tab.url);
  if (!videoId) return null;
  
  return {
    url: tab.url,
    videoId: videoId,
    title: tab.title?.replace(' - YouTube', '') || 'YouTube Video'
  };
}

// YouTube player control
export function seekToTime(seconds) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'SEEK_TO_TIME',
        time: seconds
      });
    }
  });
}

// Format seconds to MM:SS
export function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
