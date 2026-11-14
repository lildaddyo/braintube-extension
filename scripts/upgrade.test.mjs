// Plan view, save-prompt thresholds, upgrade link and limit errors (scripts/upgrade.js).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// package.json is "commonjs"; upgrade.js is an ES module for the extension: load its source as one.
const src = readFileSync(new URL('./upgrade.js', import.meta.url), 'utf8');
const { upgradeUrl, planView, shouldNudgeAfterSaves, limitError, ERR_NO_CREDITS, ERR_RATE_LIMITED, SAVE_NUDGE_FIRST, SAVE_NUDGE_EVERY } =
  await import('data:text/javascript,' + encodeURIComponent(src));

// Upgrade link: app pricing page, utm_source=extension, trigger in utm_content.
const u = new URL(upgradeUrl({ trigger: 'limit_hit', surface: 'sidepanel' }));
assert.equal(u.origin + u.pathname, 'https://app.brain-tube.com/pricing');
assert.equal(u.searchParams.get('utm_source'), 'extension');
assert.equal(u.searchParams.get('utm_medium'), 'sidepanel');
assert.equal(u.searchParams.get('utm_campaign'), 'extension_upgrade');
assert.equal(u.searchParams.get('utm_content'), 'limit_hit');
assert.equal(u.searchParams.get('interval'), null);
assert.equal(new URL(upgradeUrl({ interval: 'year' })).searchParams.get('interval'), 'year');
assert.equal(new URL(upgradeUrl()).searchParams.get('utm_medium'), 'popup');

// Plan view.
const free = planView({ subscribed: false, plan: 'free' }, { balance: 24, monthly_allowance: 30 });
assert.deepEqual([free.plan, free.kind, free.balance, free.allowance, free.low], ['free', 'free', 24, 30, false]);
assert.equal(planView({ subscribed: false, plan: 'free' }, { balance: 4, monthly_allowance: 30 }).low, true);
const pro = planView({ subscribed: true, plan: 'pro' }, { balance: 812, monthly_allowance: 1000 });
assert.deepEqual([pro.plan, pro.kind], ['pro', 'paid']);
const stripeTrial = planView({ subscribed: true, plan: 'pro', is_trial: true }, null);
assert.equal(stripeTrial.kind, 'paid', 'a Stripe trial has a card on file: no upsell');
const reverse = planView({ subscribed: false, plan: 'pro', reverse_trial: true, pro_trial_until: '2026-11-20T00:00:00Z' }, { balance: 900, monthly_allowance: 1000 });
assert.deepEqual([reverse.plan, reverse.kind, reverse.trialEnd], ['pro', 'trial', '2026-11-20T00:00:00Z']);
const expired = planView({ subscribed: false, plan: 'pro' }, null);
assert.deepEqual([expired.plan, expired.kind, expired.balance, expired.allowance], ['free', 'free', null, 30], 'expired plan is Free');
assert.equal(planView({ subscribed: false, plan: 'free' }, { balance: null }).balance, null, 'null balance is unknown, not 0');
assert.equal(planView(null, null).kind, 'free');

// Save prompt: at the first threshold, then every SAVE_NUDGE_EVERY, once each, never for paid.
assert.equal(shouldNudgeAfterSaves(SAVE_NUDGE_FIRST - 1, 0, 'free'), false);
assert.equal(shouldNudgeAfterSaves(SAVE_NUDGE_FIRST, 0, 'free'), true);
assert.equal(shouldNudgeAfterSaves(SAVE_NUDGE_FIRST, SAVE_NUDGE_FIRST, 'free'), false);
assert.equal(shouldNudgeAfterSaves(SAVE_NUDGE_FIRST + 1, SAVE_NUDGE_FIRST, 'free'), false);
assert.equal(shouldNudgeAfterSaves(SAVE_NUDGE_FIRST + SAVE_NUDGE_EVERY, SAVE_NUDGE_FIRST, 'trial'), true);
assert.equal(shouldNudgeAfterSaves(SAVE_NUDGE_FIRST, 0, 'paid'), false);

// Limit errors.
const e402 = limitError(402, { error: 'Insufficient credits', required: 2, balance: 0 });
assert.equal(e402.code, ERR_NO_CREDITS);
assert.deepEqual([e402.message, e402.required, e402.balance], ['Insufficient credits', 2, 0]);
assert.equal(limitError(402, { credits_required: 5 }).required, 5);
assert.equal(limitError(429, {}, 'slow down').code, ERR_RATE_LIMITED);
assert.equal(limitError(429, {}, 'slow down').message, 'slow down');
assert.equal(limitError(500, {}), null);
assert.equal(limitError(200, {}), null);

console.log('upgrade ok');
