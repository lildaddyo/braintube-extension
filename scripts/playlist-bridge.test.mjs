// node scripts/playlist-bridge.test.mjs — page scripts on youtube.com cannot make BrainTube import a playlist
// (audit 2026-11-01, finding 1). Runs the real watcher (isolated world) and the real shim (MAIN world) against
// a fake window that, like the browser, delivers window.postMessage to every listener on the page.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const tick = () => new Promise((r) => setTimeout(r, 10));

// ── A fake page: one window shared by the page, the shim and the watcher ──────────────────────────────────
const listeners = new Map();
const win = {
  addEventListener(type, fn) { (listeners.get(type) ?? listeners.set(type, new Set()).get(type)).add(fn); },
  removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
  dispatch(type, evt) { for (const fn of [...(listeners.get(type) ?? [])]) fn(evt); },
  postMessage(data, _origin, transfer = []) {
    const evt = { source: win, data: structuredClone(data), ports: transfer };
    setTimeout(() => win.dispatch('message', evt), 0);
  },
};
const sent = []; // network calls YouTube itself makes
win.fetch = async (input, init) => { sent.push({ input, init }); return { ok: true }; };
win.MessageChannel = MessageChannel;
class FakeXHR { open() {} send() {} }
globalThis.window = win;
globalThis.location = { origin: 'https://www.youtube.com', hostname: 'www.youtube.com' };
globalThis.XMLHttpRequest = FakeXHR;

// What a hostile page script sees: every message on the window.
const seenByPage = [];
win.addEventListener('message', (e) => seenByPage.push(e));

// ── The extension side ──────────────────────────────────────────────────────────────────────────────────────
const relayed = [];
let installRequest = null;
globalThis.chrome = { runtime: { sendMessage: async (msg) => {
  if (msg.type === 'INSTALL_PLAYLIST_SHIM') installRequest = msg;
  if (msg.type === 'PLAYLIST_ADD_EVENT') relayed.push(msg.youtube_playlist_id);
  return { ok: true };
} } };

new Function(readFileSync(new URL('./content-playlist-watcher.js', import.meta.url), 'utf8'))();
assert.equal(installRequest?.type, 'INSTALL_PLAYLIST_SHIM');
assert.match(installRequest.nonce, /^[0-9a-f]{32}$/, '128-bit nonce');

const GOOD = 'PLZHQObOWTQDNU6R1_67000Dx_ZCJB-3pi';
const EVIL = 'PL0123456789abcdef0123456789abcdef';
const userClicks = () => win.dispatch('pointerdown', { isTrusted: true });
const editBody = (playlistId, action = 'ACTION_ADD_VIDEO') =>
  JSON.stringify({ playlistId, actions: [{ action, addedVideoId: 'aircAruvnKk' }] });

// 1. The old forgeable message does nothing.
userClicks();
win.postMessage({ source: 'BT', type: 'PLAYLIST_ADD', playlistId: EVIL }, '*');
await tick();
assert.deepEqual(relayed, []);

// 2. A forged handshake (attacker's own channel, guessed nonce) is ignored, so its port is never listened to.
const fake = new MessageChannel();
win.postMessage({ source: 'BT', type: 'BT_PORT', nonce: '0'.repeat(32) }, '*', [fake.port2]);
await tick();
fake.port1.postMessage({ type: 'PLAYLIST_ADD', playlistId: EVIL });
await tick();
assert.deepEqual(relayed, []);

// 3. The service worker injects the shim with the nonce (executeScript args; not visible to the page).
const shimSrc = readFileSync(new URL('./page-world-shim.js', import.meta.url), 'utf8');
const { installPlaylistShim } = await import('data:text/javascript,' + encodeURIComponent(shimSrc));
assert.equal(installPlaylistShim('short'), false, 'refuses a missing/short nonce');
assert.equal(installPlaylistShim(installRequest.nonce), true);
assert.equal(installPlaylistShim(installRequest.nonce), false, 'one shim per document');
await tick();

// 4. A real add by the user through YouTube's own request is relayed.
userClicks();
await win.fetch('https://www.youtube.com/youtubei/v1/browse/edit_playlist?prettyPrint=false', { method: 'POST', body: editBody(GOOD) });
await tick();
assert.deepEqual(relayed, [GOOD]);
assert.equal(sent.length, 1, 'the page request still goes out');

// 5. The page saw the handshake. Replaying it (nonce now known) with its own port is ignored: the watcher
//    latched the first port. Writing to the port it saw (port2, the receiving end) cannot reach the watcher.
const seen = seenByPage.find((e) => e.data?.type === 'BT_PORT' && e.data.nonce === installRequest.nonce);
assert.ok(seen, 'handshake was observable');
const replay = new MessageChannel();
win.postMessage({ ...seen.data }, '*', [replay.port2]);
await tick();
replay.port1.postMessage({ type: 'PLAYLIST_ADD', playlistId: EVIL });
seen.ports[0].postMessage({ type: 'PLAYLIST_ADD', playlistId: EVIL });
await tick();
assert.deepEqual(relayed, [GOOD]);

// 6. Old-style message again, after the handshake: still nothing.
win.postMessage({ source: 'BT', type: 'PLAYLIST_ADD', playlistId: EVIL }, '*');
await tick();
assert.deepEqual(relayed, [GOOD]);

// 7. Bad ids, removals and repeats are dropped.
for (const id of ['WL', 'LL', 'RDaircAruvnKk', 'name:Saved', 'PL<x>']) {
  await win.fetch('/youtubei/v1/browse/edit_playlist', { body: editBody(id) });
}
await win.fetch('/youtubei/v1/browse/edit_playlist', { body: editBody(EVIL, 'ACTION_REMOVE_VIDEO_BY_VIDEO_ID') });
await win.fetch('/youtubei/v1/browse/edit_playlist', { body: editBody(GOOD) }); // within the 5 s cooldown
await tick();
assert.deepEqual(relayed, [GOOD]);

// 8. A script-driven add with no user input in the last 15 s (e.g. on page load) is dropped.
const realNow = Date.now;
Date.now = () => realNow() + 16_000;
await win.fetch('/youtubei/v1/browse/edit_playlist', { body: editBody(EVIL) });
await tick();
assert.deepEqual(relayed, [GOOD]);
Date.now = realNow;

// 9. Synthetic (untrusted) clicks do not count as user input.
Date.now = () => realNow() + 32_000;
win.dispatch('pointerdown', { isTrusted: false });
win.dispatch('keydown', { isTrusted: false });
await win.fetch('/youtubei/v1/browse/edit_playlist', { body: editBody(EVIL) });
await tick();
assert.deepEqual(relayed, [GOOD]);
Date.now = realNow;

for (const p of [fake.port1, fake.port2, replay.port1, replay.port2, seen.ports[0]]) p.close();
console.log('playlist bridge: spoofing checks passed');
process.exit(0);
