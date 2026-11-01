// BrainTube Extension - Reader language for AI-written fields (D-198): summaries, takeaways, tags and titles are
// written in profiles.content_language. Twin of the web src/lib/content-language.ts + LocaleSync: the browser's
// preferred language is saved while the column is still empty. The extension has no settings page, so it never
// changes a saved language (that is Settings > AI summaries on the web and Account > AI summaries in the apps).
import { CONFIG, buildUrl, getHeaders } from './config.js';

/** ISO 639 primary subtag, the shape profiles.content_language accepts (CHECK ^[a-z]{2,3}$). */
const LANGUAGE_CODE = /^[a-z]{2,3}$/;

export const DEFAULT_CONTENT_LANGUAGE = 'en';

/** "ja-JP" -> "ja"; anything that is not a language tag -> null. */
export function normalizeLanguage(tag) {
  const primary = String(tag || '').trim().toLowerCase().split(/[-_]/)[0];
  return LANGUAGE_CODE.test(primary) ? primary : null;
}

/** The browser's first preferred language that is a real language tag, else English. */
export function browserContentLanguage(languages, language) {
  for (const tag of [...(languages ?? []), language ?? '']) {
    const code = normalizeLanguage(tag);
    if (code) return code;
  }
  return DEFAULT_CONTENT_LANGUAGE;
}

const CAPTURED_KEY = 'bt_content_language_captured';

// Once per signed-in account: saves the browser language where profiles.content_language is still null. The
// PATCH filter (content_language=is.null) makes it a no-op for an account that already has one.
export async function captureContentLanguage(session) {
  const userId = session?.user?.id;
  if (!userId) return false;
  const stored = await chrome.storage.local.get(CAPTURED_KEY);
  if (stored[CAPTURED_KEY] === userId) return false;
  try {
    const url = buildUrl(`${CONFIG.ENDPOINTS.REST}/profiles?user_id=eq.${encodeURIComponent(userId)}&content_language=is.null`);
    const language = browserContentLanguage(navigator.languages, navigator.language);
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { ...await getHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify({ content_language: language }),
    });
    if (!res.ok) return false;
    await chrome.storage.local.set({ [CAPTURED_KEY]: userId });
    return true;
  } catch {
    return false;
  }
}
