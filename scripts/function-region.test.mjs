// node scripts/function-region.test.mjs — every edge function URL runs in the database region (eu-west-1).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./config.js', import.meta.url), 'utf8');
const cfg = await import('data:text/javascript,' + encodeURIComponent(src));
const base = 'https://iqjnmmtvhyavgrsxpoao.supabase.co';

assert.equal(cfg.buildUrl(cfg.CONFIG.ENDPOINTS.ASK_ITEM_AI), `${base}/functions/v1/ask-item-ai?forceFunctionRegion=eu-west-1`);
for (const [name, path] of Object.entries(cfg.CONFIG.ENDPOINTS)) {
  if (path.startsWith('/functions/v1/')) assert.match(cfg.buildUrl(path), /\?forceFunctionRegion=eu-west-1$/, name);
}
// An existing query string gets &, a pinned URL stays as it is.
assert.equal(cfg.pinFunctionUrl(`${base}/functions/v1/track?x=1`), `${base}/functions/v1/track?x=1&forceFunctionRegion=eu-west-1`);
assert.equal(cfg.pinFunctionUrl(`${base}/functions/v1/track?forceFunctionRegion=eu-west-1`), `${base}/functions/v1/track?forceFunctionRegion=eu-west-1`);
// REST and auth URLs are left alone.
assert.equal(cfg.buildUrl('/rest/v1/items?id=eq.1'), `${base}/rest/v1/items?id=eq.1`);
assert.equal(cfg.buildUrl('/auth/v1/token?grant_type=refresh_token'), `${base}/auth/v1/token?grant_type=refresh_token`);
console.log('function-region: ok');
