// BrainTube Extension - read the visible text of the tab being saved.
// The server reads pages itself; this text is its fallback for pages it cannot reach the way the user sees
// them (paywalls the user is signed in to, Reddit and other hosts that block servers, client-rendered apps).
// Uses activeTab, so it only works for the tab the user opened the popup on; any failure returns null.

function extractVisibleText() {
  const pick = document.querySelector('article') || document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
  const text = (pick?.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
  // A short <article> (a teaser card) loses to the whole body.
  const body = (document.body?.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
  return { title: document.title || '', text: text.length >= 500 || text.length >= body.length / 2 ? text : body };
}

// Consent screens and bot checks are not the page: sending them would let the server summarise the wall.
const INTERSTITIAL = /^(?:[^|–-]{1,30}[|–-]\s*)?(before you continue|prove your humanity|just a moment|attention required|access denied|verify you are human|are you a robot|security check|one more step)\b/i;

export function isInterstitial(page) {
  return INTERSTITIAL.test((page?.title || '').trim()) || INTERSTITIAL.test((page?.text || '').trim().slice(0, 200));
}

export async function readTabPage(tabId) {
  if (!tabId || !chrome.scripting?.executeScript) return null;
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId }, func: extractVisibleText });
    const page = res?.result;
    if (!page || typeof page.text !== 'string' || isInterstitial(page)) return null;
    return { title: page.title.slice(0, 500), text: page.text.slice(0, 60_000) };
  } catch (err) {
    // chrome://, the Web Store, PDF viewer and pages without activeTab refuse injection.
    console.log('[BrainTube] page text not readable here:', err?.message);
    return null;
  }
}
