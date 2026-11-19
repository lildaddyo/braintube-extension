import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { URL };
vm.runInNewContext(readFileSync(new URL('./yt-list-parse.js', import.meta.url), 'utf8'), ctx);
const plain = (v) => JSON.parse(JSON.stringify(v));
const { listFromUrl, videoIdsFromHrefs, chunk } = ctx.btYt;

assert.deepEqual(plain(listFromUrl('https://www.youtube.com/playlist?list=WL')), { id: 'WL', source: 'extension_watch_later' });
assert.deepEqual(plain(listFromUrl('https://www.youtube.com/playlist?list=LL&pp=x')), { id: 'LL', source: 'extension_liked' });
assert.equal(listFromUrl('https://www.youtube.com/playlist?list=PLabc'), null, 'other playlists are not this import');
assert.equal(listFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=WL'), null, 'watch page, not the list');
assert.equal(listFromUrl('https://evil.com/playlist?list=WL'), null);
assert.equal(listFromUrl('not a url'), null);

assert.deepEqual(plain(videoIdsFromHrefs([
  '/watch?v=dQw4w9WgXcQ&list=WL&index=1',
  '/watch?v=dQw4w9WgXcQ&list=WL&index=9', // repeat
  'https://www.youtube.com/watch?v=abcdefghijk&pp=1',
  '/watch?v=short', // bad id
  '/shorts/abcdefghijk', // no v param
  null,
])), ['dQw4w9WgXcQ', 'abcdefghijk']);

assert.deepEqual(plain(chunk([1, 2, 3, 4, 5], 2)), [[1, 2], [3, 4], [5]]);
console.log('yt-list-parse: ok');
