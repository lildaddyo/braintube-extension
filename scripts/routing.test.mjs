// node scripts/routing.test.mjs — checks which backend function each kind of page goes to.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// package.json is "commonjs" (strip-bg.js needs it) while routing.js is an ES module for the extension: load its source as one.
const src = readFileSync(new URL('./routing.js', import.meta.url), 'utf8');
const { routeForUrl, youtubeVideoId } = await import('data:text/javascript,' + encodeURIComponent(src));

const yt = (u) => routeForUrl(u)?.fn === 'process-youtube';
const watch = 'https://www.youtube.com/watch?v=aircAruvnKk';

assert.equal(routeForUrl('https://www.youtube.com/watch?v=aircAruvnKk&list=PLx&index=2&t=30s').body.url, watch);
assert.equal(routeForUrl('https://youtu.be/aircAruvnKk?si=abc').body.url, watch);
assert.equal(youtubeVideoId('https://www.youtube.com/shorts/tPEE9ZwTmy0'), 'tPEE9ZwTmy0');
assert.equal(youtubeVideoId('https://m.youtube.com/live/aircAruvnKk?feature=share'), 'aircAruvnKk');
assert.equal(youtubeVideoId('https://www.youtube.com/embed/aircAruvnKk'), 'aircAruvnKk');
assert.ok(routeForUrl('https://music.youtube.com/watch?v=aircAruvnKk').body.isYouTubeMusic);
assert.ok(yt('https://www.youtube.com/shorts/tPEE9ZwTmy0'));

// Not a single video: read as a page.
for (const u of ['https://www.youtube.com/playlist?list=PLZHQObOWTQDNU6R1_67000Dx_ZCJB-3pi', 'https://www.youtube.com/@3blue1brown',
  'https://www.youtube.com/watch?v=short', 'https://x.com/karpathy/status/1', 'https://arxiv.org/pdf/1706.03762', 'https://bg.wikipedia.org/wiki/София']) {
  const r = routeForUrl(u);
  assert.equal(r.fn, 'process-content', u);
  assert.equal(r.body.respondEarly, true);
  assert.equal(r.body.url, u);
}

const bm = routeForUrl('https://example.com/a', { bookmark: true }).body;
assert.equal(bm.is_bookmark, true);
assert.ok(!Number.isNaN(Date.parse(bm.bookmarked_at)));

for (const u of ['chrome://newtab/', 'file:///C:/x.pdf', 'chrome-extension://abc/popup.html', 'not a url', '']) assert.equal(routeForUrl(u), null, u);

console.log('routing: all checks passed');
