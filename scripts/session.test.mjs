// node scripts/session.test.mjs — an expired access token is refreshed before a call; a dead refresh token signs out.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./config.js', import.meta.url), 'utf8');
const cfg = await import('data:text/javascript,' + encodeURIComponent(src));

let store = {};
globalThis.chrome = { storage: { local: {
  get: async (keys) => Object.fromEntries((Array.isArray(keys) ? keys : Object.keys(store)).filter((k) => k in store).map((k) => [k, store[k]])),
  set: async (obj) => { Object.assign(store, obj); },
  remove: async (keys) => { for (const k of keys) delete store[k]; },
} } };

const jwt = (exp) => 'h.' + Buffer.from(JSON.stringify({ exp })).toString('base64url') + '.s';
const now = Math.floor(Date.now() / 1000);
let calls = [];
let reply;
globalThis.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return reply(); };

// Fresh token: no network.
store = { bt_session: { access_token: jwt(now + 3000), refresh_token: 'r0' } };
assert.equal((await cfg.getValidSession()).refresh_token, 'r0');
assert.equal(calls.length, 0);

// Expired token: one refresh, even with concurrent callers; both keys updated.
store = { bt_session: { access_token: jwt(now - 10), refresh_token: 'r1', user: { email: 'u' } } };
reply = () => ({ ok: true, status: 200, json: async () => ({ access_token: jwt(now + 3600), refresh_token: 'r2', expires_in: 3600 }) });
const [a, b] = await Promise.all([cfg.getValidSession(), cfg.getValidSession()]);
assert.equal(calls.length, 1);
assert.match(calls[0].url, /grant_type=refresh_token$/);
assert.equal(calls[0].body.refresh_token, 'r1');
assert.equal(a.refresh_token, 'r2');
assert.equal(b.refresh_token, 'r2');
assert.equal(store.session.refresh_token, 'r2');
assert.equal(store.bt_session.user.email, 'u');
assert.equal((await cfg.getHeaders()).Authorization, `Bearer ${a.access_token}`);

// Revoked refresh token: session cleared, caller told to sign in.
calls = [];
store = { bt_session: { access_token: jwt(now - 10), refresh_token: 'dead' }, session: {} };
reply = () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) });
await assert.rejects(cfg.getValidSession(), /sign in again/);
assert.deepEqual(store, {});

console.log('session tests passed');
