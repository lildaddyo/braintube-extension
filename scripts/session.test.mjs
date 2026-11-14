// node scripts/session.test.mjs — an expired access token is refreshed before a call; a dead refresh token signs out.
// The session lives in chrome.storage.session under one key; a copy an older version left in storage.local is
// moved there once and deleted. The refresh token is also kept, encrypted, in the extension's IndexedDB, so a
// browser restart (storage.session empty) signs the user back in; sign-out and a rejected token delete it.
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

// Just enough IndexedDB for config.js: one database, one object store, async request/transaction callbacks.
// Transactions on the store run one at a time, like readwrite transactions in a browser.
const idbData = new Map();
let idbQueue = Promise.resolve();
const tick = () => new Promise((r) => setTimeout(r, 0));
globalThis.indexedDB = {
  open() {
    const open = {};
    const db = {
      createObjectStore() {},
      close() {},
      transaction() {
        const tx = {};
        const store = {
          get: (k) => request(() => idbData.get(k)),
          put: (v, k) => request(() => { idbData.set(k, v); }),
          delete: (k) => request(() => { idbData.delete(k); }),
        };
        const pending = [];
        function request(run) { const req = {}; pending.push(() => { req.result = run(); req.onsuccess?.(); }); return req; }
        tx.objectStore = () => store;
        idbQueue = idbQueue.then(async () => {
          await tick();
          while (pending.length) { pending.shift()(); await tick(); }
          tx.oncomplete?.();
        });
        return tx;
      },
    };
    tick().then(() => { open.result = db; open.onupgradeneeded?.(); open.onsuccess?.(); });
    return open;
  },
};
const storedRefresh = () => idbData.get('refresh');

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

// The refresh token is kept in IndexedDB, encrypted under a non-extractable key: no plaintext copy anywhere.
assert.ok(storedRefresh(), 'refresh token persisted');
assert.ok(!JSON.stringify([...idbData.values()].map((v) => v?.data && Buffer.from(v.data).toString())).includes('old'));
assert.equal(idbData.get('wrap_key').extractable, false);

// Browser restart: storage.session empty, nothing legacy. The stored refresh token signs the user back in.
calls = [];
session.data = {};
local.data = {};
reply = () => ({ ok: true, status: 200, json: async () => ({ access_token: jwt(now + 3600), refresh_token: 'after-restart', user: { email: 'u' } }) });
const restored = await cfg.getValidSession();
assert.equal(calls.length, 1);
assert.equal(calls[0].body.refresh_token, 'old');
assert.equal(restored.refresh_token, 'after-restart');
assert.equal(restored.user.email, 'u');
assert.equal(session.data.bt_session.refresh_token, 'after-restart');
assert.deepEqual(local.data, {});

// The rotated refresh token is what the next restart uses.
calls = [];
session.data = {};
reply = () => ({ ok: true, status: 200, json: async () => ({ access_token: jwt(now + 3600), refresh_token: 'r3' }) });
await cfg.getSession();
assert.equal(calls[0].body.refresh_token, 'after-restart');

// Restart while offline: signed out for now, the stored token is kept for the next try.
calls = [];
session.data = {};
reply = () => { throw new TypeError('Failed to fetch'); };
assert.equal(await cfg.getSession(), null);
assert.ok(storedRefresh());

// Restart with a revoked refresh token: signed out and the stored token is deleted.
calls = [];
session.data = {};
reply = () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) });
assert.equal(await cfg.getSession(), null);
assert.equal(calls.length, 1);
assert.equal(storedRefresh(), undefined);
assert.equal(await cfg.getSession(), null);
assert.equal(calls.length, 1);

// Sign-out clears both areas and the stored refresh token; a restart after it stays signed out.
await cfg.saveSession({ access_token: jwt(now + 3000), refresh_token: 'x' });
local.data = { bt_session: { access_token: 'x' } };
assert.ok(storedRefresh());
await cfg.clearSession();
assert.deepEqual(session.data, {});
assert.deepEqual(local.data, {});
assert.equal(storedRefresh(), undefined);
calls = [];
assert.equal(await cfg.getValidSession(), null);
assert.equal(calls.length, 0);

// Popup and service worker save at once on a fresh profile: both must end up on one wrapping key, or the
// token one of them encrypted could not be read after a restart.
idbData.clear();
const [ctxA, ctxB] = await Promise.all(['a', 'b'].map((n) => import('data:text/javascript,' + encodeURIComponent(src + `
// context ${n}`))));
await Promise.all([
  ctxA.saveSession({ access_token: jwt(now + 3000), refresh_token: 'from-a' }),
  ctxB.saveSession({ access_token: jwt(now + 3000), refresh_token: 'from-b' }),
]);
calls = [];
session.data = {};
reply = () => ({ ok: true, status: 200, json: async () => ({ access_token: jwt(now + 3600), refresh_token: 'r9' }) });
assert.ok(await ctxA.getSession(), 'restored after a concurrent first save');
assert.match(calls[0].body.refresh_token, /^from-[ab]$/);

console.log('session tests passed');
