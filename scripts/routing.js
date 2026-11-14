// BrainTube Extension - which backend function reads a page.
// YouTube videos (watch, shorts, live, embed, youtu.be, music) go to process-youtube for the transcript;
// every other http(s) page goes to process-content, which reads the text (articles, PDFs, Reddit, X,
// LinkedIn, TikTok, GitHub, docs...) and writes the summary. No DOM or chrome.* use, so it runs in tests.

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

// Returns the 11-character video id for a YouTube video URL, or null (playlists, channels, other sites).
export function youtubeVideoId(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch { return null; }
  const host = u.hostname.replace(/^(www\.|m\.)/, '');
  let id = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1];
  else if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/^\/(?:shorts|live|embed|v)\/([^/?#]+)/);
      if (m) id = m[1];
    }
  }
  return id && VIDEO_ID.test(id) ? id : null;
}

// { fn, body } for the edge function that saves this URL, or null for pages that cannot be saved
// (chrome://, file://, the new tab page).
export function routeForUrl(rawUrl, { bookmark = false } = {}) {
  let u;
  try { u = new URL(rawUrl); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const videoId = youtubeVideoId(rawUrl);
  if (videoId) {
    const isMusic = u.hostname === 'music.youtube.com';
    // A canonical watch URL: playlist/index/timestamp params would make the same video look like a new item.
    const url = isMusic ? `https://music.youtube.com/watch?v=${videoId}` : `https://www.youtube.com/watch?v=${videoId}`;
    return { fn: 'process-youtube', videoId, body: { url, videoId, ...(isMusic ? { isYouTubeMusic: true } : {}) } };
  }
  // respondEarly: the row exists within a second and the page is read server-side, so closing the popup
  // (which kills its fetch) does not lose the save.
  const body = { url: rawUrl, platform: 'web', respondEarly: true };
  if (bookmark) Object.assign(body, { is_bookmark: true, bookmarked_at: new Date().toISOString() });
  return { fn: 'process-content', body };
}
