// node scripts/app-gate.test.mjs — the version gate's rules (same cases as dark-n-cozy client-version_test.ts,
// iOS AppGateTests and Android AppGateTest) and its fail-open fetch.
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

// package.json is CommonJS, so load ESM copies (.mjs) of the module and its two imports.
const dir = mkdtempSync(join(tmpdir(), 'bt-gate-'));
const here = fileURLToPath(new URL('.', import.meta.url));
for (const f of ['app-gate', 'config', 'i18n']) copyFileSync(join(here, `${f}.js`), join(dir, `${f}.mjs`));
const { readFileSync, writeFileSync } = await import('node:fs');
const gatePath = join(dir, 'app-gate.mjs');
writeFileSync(gatePath, readFileSync(gatePath, 'utf8').replace(/'\.\/(config|i18n)\.js'/g, "'./$1.mjs'"));

const store = {};
globalThis.chrome = {
  runtime: { getManifest: () => ({ version: '1.7.0' }) },
  storage: { local: { get: async (k) => ({ [k]: store[k] }), set: async (o) => Object.assign(store, o) } },
};
const g = await import(pathToFileURL(gatePath).href);

assert.equal(g.compareVersions('1.0.10', '1.0.9'), 1);
assert.equal(g.compareVersions('1.0.9', '1.0.10'), -1);
assert.equal(g.compareVersions('1.2', '1.2.0'), 0);
assert.equal(g.compareVersions('2.0', '1.99.99'), 1);
assert.equal(g.compareVersions('1.7.0-beta', '1.7.0'), 0);

const cfg = (o = {}) => ({ min_version: '1.0.3', recommended_version: '1.1.0', update_url: 'https://x', disabled: false, ...o });
assert.equal(g.evaluateClient(cfg(), '1.0.2'), 'update_required');
assert.equal(g.evaluateClient(cfg(), '1.0.3'), 'update_available');
assert.equal(g.evaluateClient(cfg(), '1.1.0'), 'ok');
assert.equal(g.evaluateClient(cfg(), '1.10.0'), 'ok');
// Fails open on anything missing; the kill switch wins.
assert.equal(g.evaluateClient(null, '0.1'), 'ok');
assert.equal(g.evaluateClient(cfg(), null), 'ok');
assert.equal(g.evaluateClient(cfg(), 'garbage'), 'ok');
assert.equal(g.evaluateClient(cfg({ min_version: null, recommended_version: null }), '0.0.1'), 'ok');
assert.equal(g.evaluateClient(cfg({ disabled: true }), '9.9.9'), 'disabled');

assert.deepEqual(g.clientHeaders(), { 'x-bt-client': 'extension', 'x-bt-client-version': '1.7.0' });

// Fetch: sends the headers, caches for 5 minutes, keeps the last good copy when the server fails.
const body = { clients: { extension: cfg({ min_version: '1.8.0' }) }, killed: ['quizzes'] };
let seen;
const ok = async (url, init) => { seen = { url, init }; return { ok: true, json: async () => body }; };
assert.deepEqual(await g.loadAppConfig({ fetchImpl: ok, now: 1000 }), body);
assert.match(seen.url, /\/functions\/v1\/app-config\?forceFunctionRegion=eu-west-1$/);
assert.equal(seen.init.headers['x-bt-client-version'], '1.7.0');
const boom = async () => { throw new Error('offline'); };
assert.deepEqual(await g.loadAppConfig({ fetchImpl: boom, now: 2000 }), body, 'fresh cache is reused');
assert.deepEqual(await g.loadAppConfig({ fetchImpl: boom, now: 10 * 60 * 1000 }), body, 'stale copy kept on failure');
const s = await g.gateState();
assert.equal(s.status, 'update_required');
assert.ok(s.killed.has('quizzes'));
console.log('app-gate: ok');
