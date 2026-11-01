// node scripts/content-language.test.mjs — the browser language is saved once per account, only where none is saved.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stubs = `const CONFIG = { ENDPOINTS: { REST: '/rest/v1' } };
const buildUrl = (e) => 'https://sb' + e;
const getHeaders = async () => ({ apikey: 'k' });`;
const src = readFileSync(new URL('./content-language.js', import.meta.url), 'utf8').replace(/^import .*$/m, stubs);
const cl = await import('data:text/javascript,' + encodeURIComponent(src));

assert.equal(cl.normalizeLanguage('ja-JP'), 'ja');
assert.equal(cl.normalizeLanguage('zh-Hans-CN'), 'zh');
assert.equal(cl.normalizeLanguage('pt_BR'), 'pt');
assert.equal(cl.normalizeLanguage(' KO '), 'ko');
assert.equal(cl.normalizeLanguage('english'), null);
assert.equal(cl.normalizeLanguage(''), null);
assert.equal(cl.browserContentLanguage(['ko-KR', 'en-US']), 'ko');
assert.equal(cl.browserContentLanguage(['x'], 'de-DE'), 'de');
assert.equal(cl.browserContentLanguage(undefined, undefined), 'en');

let store = {};
globalThis.chrome = { storage: { local: {
  get: async (key) => (key in store ? { [key]: store[key] } : {}),
  set: async (obj) => { Object.assign(store, obj); },
} } };
Object.defineProperty(globalThis, 'navigator', { value: { languages: ['ja-JP', 'en'], language: 'ja-JP' }, configurable: true });
let calls = [];
let ok = true;
globalThis.fetch = async (url, init) => { calls.push({ url, init }); return { ok }; };

// Signed out: nothing.
assert.equal(await cl.captureContentLanguage(null), false);
assert.equal(calls.length, 0);

// First sign-in: one PATCH that only matches a null column.
assert.equal(await cl.captureContentLanguage({ user: { id: 'u1' } }), true);
assert.equal(calls.length, 1);
assert.equal(calls[0].init.method, 'PATCH');
assert.equal(calls[0].url, 'https://sb/rest/v1/profiles?user_id=eq.u1&content_language=is.null');
assert.deepEqual(JSON.parse(calls[0].init.body), { content_language: 'ja' });

// Token refreshes for the same account: no more calls.
assert.equal(await cl.captureContentLanguage({ user: { id: 'u1' } }), false);
assert.equal(calls.length, 1);

// A failed call is retried at the next sign-in.
ok = false;
assert.equal(await cl.captureContentLanguage({ user: { id: 'u2' } }), false);
ok = true;
assert.equal(await cl.captureContentLanguage({ user: { id: 'u2' } }), true);
assert.equal(calls.length, 3);

console.log('content-language: ok');
