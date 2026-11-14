// BrainTube Extension - YouTube Utilities
import { routeForUrl } from './routing.js';

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

// Get current YouTube video info (watch, Shorts, live and youtu.be pages; not playlists or channels)
export async function getCurrentVideoInfo(tab) {
  const route = tab?.url ? routeForUrl(tab.url) : null;
  if (route?.fn !== 'process-youtube') return null;

  return {
    url: route.body.url,
    videoId: route.videoId,
    isYouTubeMusic: route.body.isYouTubeMusic === true,
    title: tab.title?.replace(/ - YouTube( Music)?$/, '') || 'YouTube Video'
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
