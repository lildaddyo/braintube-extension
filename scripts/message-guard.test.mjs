// node scripts/message-guard.test.mjs — which sender may send which runtime message (audit 2026-11-01).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./message-guard.js', import.meta.url), 'utf8');
const g = await import('data:text/javascript,' + encodeURIComponent(src));

const ID = 'abcdefghijklmnopabcdefghijklmnop';
const popup     = { id: ID, url: `chrome-extension://${ID}/popup.html`, origin: `chrome-extension://${ID}` };
const sidepanel = { id: ID, url: `chrome-extension://${ID}/sidepanel.html` };
const ytContent = { id: ID, url: 'https://www.youtube.com/watch?v=aircAruvnKk', origin: 'https://www.youtube.com', frameId: 0,
  tab: { id: 42, url: 'https://www.youtube.com/watch?v=aircAruvnKk' } };
const ytIframe  = { ...ytContent, frameId: 3 };
const claudeContent = { id: ID, url: 'https://claude.ai/chat/1', origin: 'https://claude.ai', frameId: 0, tab: { id: 7 } };
const otherExt  = { id: 'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', url: 'chrome-extension://zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz/bg.html' };
const extTab    = { ...popup, tab: { id: 9 } }; // an extension page opened as a tab, or a content script claiming our URL
const spoofUrl  = { id: ID, url: `https://evil.example/chrome-extension://${ID}/popup.html` };
const lookalike = { id: ID, url: 'https://www.youtube.com.evil.example/', origin: 'https://www.youtube.com.evil.example', frameId: 0, tab: { id: 1 } };

// Privileged messages: only the extension's own pages.
for (const type of ['SAVE_AI_CONVERSATION', 'OPEN_SIDEPANEL']) {
  assert.ok(g.isAllowedSender(type, popup, ID), `${type} from popup`);
  assert.ok(g.isAllowedSender(type, sidepanel, ID), `${type} from side panel`);
  for (const [name, s] of Object.entries({ ytContent, claudeContent, otherExt, extTab, spoofUrl, lookalike, none: undefined })) {
    assert.ok(!g.isAllowedSender(type, s, ID), `${type} must be refused from ${name}`);
  }
}

// YouTube events: only our content script in the top frame of www.youtube.com.
for (const type of ['PLAYLIST_ADD_EVENT', 'INSTALL_PLAYLIST_SHIM', 'SAVE_CURRENT_VIDEO']) {
  assert.ok(g.isAllowedSender(type, ytContent, ID), `${type} from YouTube content script`);
  for (const [name, s] of Object.entries({ popup, ytIframe, claudeContent, otherExt, lookalike, none: undefined })) {
    assert.ok(!g.isAllowedSender(type, s, ID), `${type} must be refused from ${name}`);
  }
}

// Unknown types are refused, even from the popup.
assert.ok(!g.isAllowedSender('EXTRACT_CONVERSATION', popup, ID));
assert.ok(!g.isAllowedSender(undefined, popup, ID));
assert.ok(!g.isAllowedSender('SAVE_AI_CONVERSATION', popup, undefined));

// Playlist ids: user playlists only.
for (const id of ['PLZHQObOWTQDNU6R1_67000Dx_ZCJB-3pi', 'PL0123456789abcdef']) assert.ok(g.isValidPlaylistId(id), id);
for (const id of ['WL', 'LL', 'RDaircAruvnKk', 'UUYO_jab_esuFRV4b17AJtAw', 'OLAK5uy_kCvM8wXGjv2-B2r5O4o0hTcwG5c3gfLzw',
  'name:My list', 'PLZHQObOWTQDNU6R1_67000Dx_ZCJB-3pi&x', 'PL<script>', '', null, 42]) {
  assert.ok(!g.isValidPlaylistId(id), String(id));
}

// AI capture only for the two supported https hosts.
assert.equal(g.aiPlatformForUrl('https://claude.ai/chat/1'), 'claude');
assert.equal(g.aiPlatformForUrl('https://chatgpt.com/c/1'), 'chatgpt');
for (const u of ['http://claude.ai/', 'https://claude.ai.evil.example/', 'https://evil.example/?claude.ai', 'chrome://newtab', undefined]) {
  assert.equal(g.aiPlatformForUrl(u), null, String(u));
}

// Rate limiter: per-id cooldown and a global cap per minute.
let t = 0;
const allow = g.createRateLimiter({ cooldownMs: 5000, windowMs: 60_000, maxPerWindow: 3, now: () => t });
assert.ok(allow('a'));
assert.ok(!allow('a'));
t = 5000; assert.ok(allow('a'));
assert.ok(allow('b'));
assert.ok(!allow('c'), 'fourth import inside a minute is refused');
t = 61_000; assert.ok(allow('c'));

console.log('message-guard: sender checks passed');
