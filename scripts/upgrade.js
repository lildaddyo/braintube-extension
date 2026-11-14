// BrainTube Extension - plan, credits and upgrade prompts (pure helpers; popup.js and sidepanel.js draw them).
// No chrome.* or DOM here so scripts/upgrade.test.mjs can run it under node.

export const WEB_APP_URL = 'https://app.brain-tube.com';

// Free users see the "you've saved a lot" prompt after this many saves, then again every SAVE_NUDGE_EVERY more.
export const SAVE_NUDGE_FIRST = 5;
export const SAVE_NUDGE_EVERY = 10;

// Monthly credits per plan (public.tier_credit_allocations, 2026-11-14). Shown in the upgrade copy.
export const PLAN_CREDITS = { free: 30, starter: 300, pro: 1000, pro_plus: 3000 };

// Error codes the API module attaches to thrown errors.
export const ERR_NO_CREDITS = 'insufficient_credits';
export const ERR_RATE_LIMITED = 'rate_limited';

// The pricing page with this extension's UTM tags. utm_source=extension lands in the web app's last-touch
// attribution (acquisition-tracker), so a checkout started here is credited to the extension.
// trigger: what opened it (popup_badge, limit_hit, save_nudge, trial_badge); surface: popup or sidepanel.
export function upgradeUrl({ trigger = 'popup_badge', surface = 'popup', interval = null } = {}) {
  const u = new URL('/pricing', WEB_APP_URL);
  if (interval === 'year') u.searchParams.set('interval', 'year');
  u.searchParams.set('utm_source', 'extension');
  u.searchParams.set('utm_medium', surface);
  u.searchParams.set('utm_campaign', 'extension_upgrade');
  u.searchParams.set('utm_content', trigger);
  return u.toString();
}

// check-subscription + check-credits → what the popup shows.
// kind: 'free' (upgrade link), 'trial' (reverse trial: keep Pro), 'paid' (no prompt).
export function planView(sub, credits) {
  const kindPlan = String(sub?.plan || 'free').toLowerCase();
  const subscribed = sub?.subscribed === true;
  // A Stripe trial (subscribed + is_trial) already has a card on file, so it counts as paid; only the
  // D-084 reverse trial (no subscription) gets "Keep Pro".
  // check-subscription keeps an expired plan name with subscribed=false; that user is on Free again.
  const kind = subscribed ? 'paid' : sub?.reverse_trial === true ? 'trial' : 'free';
  const plan = kind === 'free' ? 'free' : kindPlan;
  // credit-guard spends user_credits.balance only, so that is the number shown.
  const balance = num(credits?.balance);
  const allowance = num(credits?.monthly_allowance) ?? PLAN_CREDITS[plan] ?? null;
  const trialEnd = sub?.pro_trial_until || sub?.trial_end || null;
  const low = balance !== null && allowance ? balance <= Math.max(4, Math.floor(allowance * 0.15)) : false;
  return { plan, kind, balance, allowance, trialEnd, low };
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Show the save prompt? Free and trial users only, at SAVE_NUDGE_FIRST saves and every SAVE_NUDGE_EVERY after,
// and never twice for the same threshold (lastShownAt = the save count it was last shown at).
export function shouldNudgeAfterSaves(saveCount, lastShownAt, kind) {
  if (kind === 'paid') return false;
  if (saveCount < SAVE_NUDGE_FIRST) return false;
  const due = saveCount === SAVE_NUDGE_FIRST || (saveCount - SAVE_NUDGE_FIRST) % SAVE_NUDGE_EVERY === 0;
  return due && saveCount !== lastShownAt;
}

// Maps an HTTP status + JSON body to an Error carrying .code for the UI. Returns null for other statuses.
export function limitError(status, body, fallbackMessage) {
  if (status === 402) {
    const e = new Error(body?.error || fallbackMessage || 'Insufficient credits');
    e.code = ERR_NO_CREDITS;
    e.required = body?.required ?? body?.credits_required ?? null;
    e.balance = body?.balance ?? null;
    return e;
  }
  if (status === 429) {
    const e = new Error(body?.error || fallbackMessage || 'Too many requests');
    e.code = ERR_RATE_LIMITED;
    return e;
  }
  return null;
}

// "Nov 20" / "11월 20일" for the trial end.
export function shortDate(iso, lang = 'en') {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', { month: 'short', day: 'numeric' });
}
