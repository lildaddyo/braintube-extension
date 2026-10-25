// en and ko carry the same keys and placeholders; every key the UI asks for exists.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const en = read('../_locales/en/messages.json');
const ko = read('../_locales/ko/messages.json');

assert.deepEqual(Object.keys(ko).sort(), Object.keys(en).sort(), 'en and ko keys differ');
for (const [key, e] of Object.entries(en)) {
  assert.ok(ko[key].message.trim(), `ko.${key} is empty`);
  assert.deepEqual(ko[key].placeholders ?? null, e.placeholders ?? null, `placeholders differ for ${key}`);
}

const used = new Set();
const dir = new URL('./', import.meta.url);
const sources = [
  ...readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(new URL(f, dir), 'utf8')),
  ...['popup.html', 'sidepanel.html', 'auth.html'].map((f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')),
  readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'),
];
for (const src of sources) {
  for (const m of src.matchAll(/\bt\('([A-Za-z]+)'|getMessage\('([A-Za-z]+)'|data-i18n(?:-placeholder|-title)?="([A-Za-z]+)"|__MSG_([A-Za-z]+)__/g)) {
    used.add(m[1] || m[2] || m[3] || m[4]);
  }
}
for (const key of used) assert.ok(en[key], `missing message ${key}`);
const unused = Object.keys(en).filter((k) => !used.has(k));
assert.deepEqual(unused, [], `unused messages: ${unused.join(', ')}`);
console.log(`locales ok: ${Object.keys(en).length} messages, en/ko in step`);
