// BrainTube Extension - UI strings from _locales/<lang>/messages.json (chrome.i18n follows the browser language).
// Edit the strings in scripts/i18n-messages.py, then run it; it writes both locales.

export function t(key, ...subs) {
  return globalThis.chrome?.i18n?.getMessage(key, subs.map(String)) || key;
}

// The language the UI is shown in ('en' or 'ko'), for dates and <html lang>.
export function uiLanguage() {
  return globalThis.chrome?.i18n?.getMessage('htmlLang') || 'en';
}

// Fills [data-i18n] text, [data-i18n-placeholder] and [data-i18n-title]; the English in the HTML stays as the
// fallback when a message is missing.
export function localizePage(root = document) {
  document.documentElement.lang = uiLanguage();
  for (const el of root.querySelectorAll('[data-i18n]')) {
    const msg = chrome.i18n.getMessage(el.dataset.i18n);
    if (msg) el.textContent = msg;
  }
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) {
    const msg = chrome.i18n.getMessage(el.dataset.i18nPlaceholder);
    if (msg) el.placeholder = msg;
  }
  for (const el of root.querySelectorAll('[data-i18n-title]')) {
    const msg = chrome.i18n.getMessage(el.dataset.i18nTitle);
    if (msg) el.title = msg;
  }
}
