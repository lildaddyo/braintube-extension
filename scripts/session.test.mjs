// node scripts/session.test.mjs — an expired access token is refreshed before a call; a dead refresh token signs out.
// The session lives in chrome.storage.session under one key; a copy an older version left in storage.local is
// moved there once and deleted.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./config.js', import.meta.url), 'utf8');
const cfg = await import('data:text/javascript,' + encodeURIComponent(src));

function area() {
  const a = {
    data: {},
    accessLevel: null,
    get: async (keys) => {
      const list = keys == null ? Object.keys(a.data) : Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.filter((k) => k in a.data).map((k) => [k, a.data[k]]));
    },
    set: async (obj) => { Object.assign(a.data, obj); },
    remove: async (keys) => { for (const k of Array.isArray(keys) ? keys : [keys]) delete a.data[k]; },
    setAccessLevel: async ({ accessLevel }) => { a.accessLevel = accessLevel; },
  };
  return a;
}
const local = area();
const session = area();
globalThis.chrome = { storage: { local, session } };

const jwt = (exp) => 'h.' + Buffer.from(JSON.stringify({ exp })).toString('base64url') + '.s';
const now = Math.floor(Date.now() / 1000);
let calls = [];
let reply;
globalThis.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return reply(); };

// storage.session is locked to trusted contexts (no content scripts).
await cfg.lockSessionStorage();
assert.equal(session.accessLevel, 'TRUSTED_CONTEXTS');

// Fresh token: no network.
session.data = { bt_session: { access_token: jwt(now + 3000), refresh_token: 'r0' } };
assert.equal((await cfg.getValidSession()).refresh_token, 'r0');
assert.equal(calls.length, 0);

// saveSession writes one key, in storage.session only.
local.data = {};
session.data = {};
await cfg.saveSession({ access_token: jwt(now + 3000), refresh_token: 'rs' });
assert.deepEqual(Object.keys(session.data), ['bt_session']);
assert.deepEqual(local.data, {});

// Expired token: one refresh, even with concurrent callers; stored in storage.session only.
session.data = { bt_session: { access_token: jwt(now - 10), refresh_token: 'r1', user: { email: 'u' } } };
reply = () => ({ ok: true, status: 200, json: async () => ({ access_token: jwt(now + 3600), refresh_token: 'r2', expires_in: 3600 }) });
const [a, b] = await Promise.all([cfg.getValidSession(), cfg.getValidSession()]);
assert.equal(calls.length, 1);
assert.match(calls[0].url, /grant_type=refresh_token$/);
assert.equal(calls[0].body.refresh_token, 'r1');
assert.equal(a.refresh_token, 'r2');
assert.equal(b.refresh_token, 'r2');
assert.equal(session.data.bt_session.refresh_token, 'r2');
assert.equal(session.data.bt_session.user.email, 'u');
assert.deepEqual(local.data, {});
assert.equal((await cfg.getHeaders()).Authorization, `Bearer ${a.access_token}`);

// Revoked refresh token: session cleared, caller told to sign in.
calls = [];
session.data = { bt_session: { access_token: jwt(now - 10), refresh_token: 'dead' } };
local.data = { session: {} };
reply = () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) });
await assert.rejects(cfg.getValidSession(), /sign in again/);
assert.deepEqual(session.data, {});
assert.deepEqual(local.data, {});

// Upgrade from v1.6.1: tokens in storage.local (both keys) move to storage.session and leave storage.local.
session.data = {};
local.data = {
  session:    { access_token: jwt(now + 3000), refresh_token: 'old' },
  bt_session: { access_token: jwt(now + 3000), refresh_token: 'old' },
  bt_install_pending: { version: '1.6.1' },
};
assert.equal((await cfg.getSession()).refresh_token, 'old');
assert.equal(session.data.bt_session.refresh_token, 'old');
assert.deepEqual(Object.keys(local.data), ['bt_install_pending']);

// Browser restart (storage.session empty, nothing legacy): signed out, the user signs in again.
session.data = {};
local.data = {};
assert.equal(await cfg.getValidSession(), null);

// Sign-out clears both areas.
session.data = { bt_session: { access_token: 'x' } };
local.data = { bt_session: { access_token: 'x' } };
await cfg.clearSession();
assert.deepEqual(session.data, {});
assert.deepEqual(local.data, {});

console.log('session tests passed');
