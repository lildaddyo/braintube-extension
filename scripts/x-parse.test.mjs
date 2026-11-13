// x-parse.js reads x.com's Bookmarks timeline JSON (shape checked against a live response, 2026-11-13).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = {};
vm.runInNewContext(readFileSync(new URL('./x-parse.js', import.meta.url), 'utf8'), ctx);
// Values cross the vm realm boundary: copy them so deepEqual compares plain arrays/objects.
const plain = (v) => JSON.parse(JSON.stringify(v));
const parseXTimeline = (j) => plain(ctx.btX.parseXTimeline(j));
const { postText, postTitle } = ctx.btX;

const user = (handle, name) => ({ user_results: { result: { core: { screen_name: handle, name } } } });
const tweet = (id, handle, legacy, extra = {}) => ({ __typename: 'Tweet', rest_id: id, core: user(handle, handle.toUpperCase()), legacy: { created_at: 'Fri Nov 06 19:49:34 +0000 2026', ...legacy }, ...extra });
const entry = (result, promoted = false) => ({
  entryId: `tweet-${result.rest_id || result.tweet?.rest_id}`,
  content: { entryType: 'TimelineTimelineItem', itemContent: { itemType: 'TimelineTweet', tweet_results: { result }, ...(promoted ? { promotedMetadata: {} } : {}) } },
});

const long = 'A'.repeat(300) + ' end of a long post';
const json = { data: { bookmark_timeline_v2: { timeline: { instructions: [{ type: 'TimelineAddEntries', entries: [
  // 1. long post: full text lives in note_tweet, t.co link expanded
  entry(tweet('101', 'alice', { full_text: 'A'.repeat(270) + '… https://t.co/aa', entities: { urls: [{ url: 'https://t.co/aa', expanded_url: 'https://example.com/a' }] } }, {
    note_tweet: { note_tweet_results: { result: { text: `${long} https://t.co/aa`, entity_set: { urls: [{ url: 'https://t.co/aa', expanded_url: 'https://example.com/a' }] } } } },
  })),
  // 2. visibility wrapper + attached photo whose t.co link is dropped
  entry({ __typename: 'TweetWithVisibilityResults', tweet: tweet('102', 'bob', { full_text: 'Look at this https://t.co/pic', extended_entities: { media: [{ type: 'photo', url: 'https://t.co/pic' }] } }) }),
  // 3. quote post: the quoted post is part of this bookmark, not a bookmark of its own
  entry(tweet('103', 'carol', { full_text: 'Worth reading' }, { quoted_status_result: { result: tweet('900', 'dave', { full_text: 'The original thought' }) } })),
  // 4. an ad in the timeline is skipped
  entry(tweet('104', 'brand', { full_text: 'Buy now' }), true),
  // 5. the same post twice is kept once
  entry(tweet('101', 'alice', { full_text: 'dup' })),
] }] } } } };

const posts = parseXTimeline(json);
assert.deepEqual(posts.map((p) => p.id), ['101', '102', '103'], 'ids in page order, no ad, no repeat, no quoted post');

const [a, b, c] = posts;
assert.equal(a.url, 'https://x.com/alice/status/101');
assert.ok(a.text.startsWith(long), 'long post text comes from note_tweet');
assert.ok(a.text.endsWith('https://example.com/a'), 't.co expanded');
assert.deepEqual(a.links, ['https://example.com/a']);
assert.equal(a.createdAt, '2026-11-06T19:49:34.000Z');

assert.equal(b.author, 'bob');
assert.equal(b.text, 'Look at this', 'media t.co link removed');
assert.deepEqual(b.media, ['photo']);

assert.equal(c.quoted.author, 'dave');
assert.equal(c.quoted.url, 'https://x.com/dave/status/900');
const text = postText(c);
assert.ok(text.startsWith('CAROL (@carol) on X, 2026-11-06:'));
assert.ok(text.includes('Quoting @dave (https://x.com/dave/status/900):\nThe original thought'));
assert.equal(postTitle(c), '@carol on X: Worth reading');
assert.ok(postText(b).includes('Attached: photo'));

assert.deepEqual(parseXTimeline({ data: {} }), []);
assert.deepEqual(parseXTimeline(null), []);
console.log(`x-parse ok: ${posts.length} posts`);
