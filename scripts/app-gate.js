// BrainTube Extension - app version gate and kill switches (scaling plan W2-5).
// The floors live server-side in dark-n-cozy feature_flags (row client_extension) and come from the public
// app-config function; runbook: dark-n-cozy docs/ops/app-version-gate.md. Same rules as the server's
// _shared/client-version.ts, iOS Shared/AppGate.swift and Android data/AppGate.kt: keep them in step.
import { CONFIG, buildUrl } from './config.js';
import { t } from './i18n.js';

export const CLIENT = 'extension';
const CACHE_KEY = 'bt_app_gate';
const CACHE_MS = 5 * 60 * 1000;
const DEFAULT_URL = 'https://chromewebstore.google.com/detail/aepdagkfkllhejenkakmbllgkbofndfb';

// Numeric dotted versions: "1.0.10" > "1.0.9", "1.2" == "1.2.0"; a suffix ("1.7.0-beta") counts only its
// leading digits. Returns -1, 0 or 1.
export function compareVersions(a, b) {
  const parts = (v) => String(v).trim().split(/[^0-9.]/)[0].split('.').map((p) => parseInt(p, 10) || 0);
  const pa = parts(a), pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

// 'ok' | 'update_available' | 'update_required' | 'disabled'. Fails open: no config, no floor or an
// unreadable version is 'ok'. Only the kill switch overrides that.
export function evaluateClient(cfg, version) {
  if (!cfg) return 'ok';
  if (cfg.disabled) return 'disabled';
  if (!version || !/^\d/.test(String(version).trim())) return 'ok';
  if (cfg.min_version && compareVersions(version, cfg.min_version) < 0) return 'update_required';
  if (cfg.recommended_version && compareVersions(version, cfg.recommended_version) < 0) return 'update_available';
  return 'ok';
}

export function appVersion() {
  return globalThis.chrome?.runtime?.getManifest?.().version || '0';
}

// The two headers every request carries (also set in config.js getHeaders, which cannot import this file),
// so retired builds get a 426 from the server.
export function clientHeaders() {
  return { 'x-bt-client': CLIENT, 'x-bt-client-version': appVersion() };
}

// The config, from chrome.storage.local when it is under 5 minutes old, else from app-config. Any failure
// keeps the last good copy (or null), which the caller treats as 'ok'.
export async function loadAppConfig({ fetchImpl = fetch, now = Date.now() } = {}) {
  const stored = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY];
  if (stored && now - stored.at < CACHE_MS) return stored.config;
  try {
    const res = await fetchImpl(buildUrl('/functions/v1/app-config'), {
      headers: { apikey: CONFIG.SUPABASE_ANON_KEY, ...clientHeaders() },
    });
    if (!res.ok) return stored?.config ?? null;
    const config = await res.json();
    await chrome.storage.local.set({ [CACHE_KEY]: { config, at: now } });
    return config;
  } catch {
    return stored?.config ?? null;
  }
}

export async function gateState() {
  const config = await loadAppConfig();
  const mine = config?.clients?.[CLIENT];
  return {
    status: evaluateClient(mine, appVersion()),
    updateUrl: mine?.update_url || DEFAULT_URL,
    killed: new Set(config?.killed ?? []),
  };
}

// Popup and side panel: a blocking screen over everything below the floor (or when paused), a dismissible
// banner below the recommended version. Returns the state so a page can stop its own start-up when blocked.
export async function applyGate(doc = document) {
  const state = await gateState();
  if (state.status === 'ok') return state;
  const blocked = state.status === 'update_required' || state.status === 'disabled';
  const el = doc.createElement('div');
  el.id = 'bt-app-gate';
  const openStore = () => chrome.tabs.create({ url: state.updateUrl });
  if (blocked) {
    const paused = state.status === 'disabled';
    el.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#0f1629;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;text-align:center;font-family:inherit';
    el.innerHTML = '<img src="icons/icon-128.png" width="72" height="72" alt=""><h2 style="margin:0;font-size:18px"></h2><p style="margin:0;font-size:13px;color:#b8aee6;max-width:280px"></p>';
    el.querySelector('h2').textContent = paused ? t('gatePausedTitle') : t('gateUpdateTitle');
    el.querySelector('p').textContent = paused ? t('gatePausedBody') : t('gateUpdateBody');
    if (!paused) {
      const btn = doc.createElement('button');
      btn.textContent = t('gateUpdateButton');
      btn.style.cssText = 'margin-top:6px;padding:10px 22px;border:0;border-radius:999px;background:#8f76f0;color:#fff;font-size:14px;cursor:pointer';
      btn.addEventListener('click', openStore);
      el.appendChild(btn);
    }
  } else {
    el.style.cssText = 'position:sticky;top:0;z-index:10000;display:flex;align-items:center;gap:8px;margin:8px;padding:8px 10px;border-radius:10px;background:#242d4a;color:#fff;font-size:12px';
    el.innerHTML = '<span style="flex:1"></span><button data-act="update"></button><button data-act="close">✕</button>';
    el.querySelector('span').textContent = t('gateAvailable');
    const [upd, close] = el.querySelectorAll('button');
    for (const b of [upd, close]) b.style.cssText = 'border:0;background:none;color:#8f76f0;font-weight:600;cursor:pointer';
    upd.textContent = t('gateUpdateButton');
    close.title = t('gateClose');
    close.setAttribute('aria-label', t('gateClose'));
    upd.addEventListener('click', openStore);
    close.addEventListener('click', () => el.remove());
  }
  doc.body.prepend(el);
  return state;
}
