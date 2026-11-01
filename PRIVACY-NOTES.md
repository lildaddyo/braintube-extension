# Privacy policy and store changes for v1.7.0 (security audit 2026-11-01)

The website privacy policy (https://brain-tube.com/privacy and https://brain-tube.com/ko/privacy) is not in this
repo. These are the changes the owner must make there, and in the Chrome Web Store dashboard, so that the
disclosures match what the extension does. The in-repo copy (`store/LISTING.en.md`, `store/LISTING.ko.md`, popup
strings `aiCaptureDisclosure`, `playlistSyncDisclosure`, `signInPerBrowserSession`) already says this.

## 1. Website privacy policy (en and ko)

1. **AI conversation capture is user-triggered, not automatic.** Replace "saved only when detected on supported
   pages" (and its Korean equivalent) with:
   > The BrainTube extension reads a conversation on claude.ai or chatgpt.com only when you click
   > "Save Conversation" in the BrainTube popup. It then sends the conversation text, the page address and the
   > page title to the BrainTube server, which stores it in your account and summarises it with Anthropic.
   > The extension has no standing access to those sites and never captures conversations on its own.
2. **Add Anthropic as a processor.** The policy lists OpenAI and Google (Gemini) but not Anthropic, which
   summarises captured AI conversations on the BrainTube server. Add Anthropic, PBC with what it receives
   (content you save, for summaries/chat) and why. **Owner to confirm** the exact mapping of feature → processor
   (which of Anthropic / OpenAI / Gemini handle video summaries, page summaries, chat, search embeddings) and list
   it per feature; the store listing currently names all three without a per-feature split.
3. **Disclose background YouTube playlist sync.** Add:
   > While you are signed in to the extension, when you add a video to one of your own YouTube playlists on
   > youtube.com, the extension sends that playlist's ID to BrainTube, which reads the playlist from YouTube and
   > imports its videos into your library (including AI summaries). This happens in the background, without a
   > separate click on BrainTube. The extension does not record other YouTube activity.
4. **What the extension reads when you save a page.** State that Save / Save URL / Bookmark send the tab's
   address and visible text (up to 60,000 characters) to the BrainTube server.
5. **Sign-in data.** State that the extension keeps your sign-in session only in the browser's memory for the
   current browser session (cleared when the browser quits) and does not make it available to web pages.
6. **Remove or qualify absolute claims** such as "we do not track your history" or "no third-party sharing":
   content is shared with the AI processors above, and playlist adds are observed in the background.

## 2. Chrome Web Store dashboard

1. **Store listing › Description**: paste `store/LISTING.en.md` (English) and `store/LISTING.ko.md` (Korean,
   language dropdown › 한국어). The Korean listing used to say "방문 기록을 추적하지 않아요" and
   "제3자 데이터 공유도 없어요"; both are removed.
2. **Privacy practices › Permission justifications**: the following permissions/hosts are gone in v1.7.0, delete
   their justifications: `https://*.supabase.co/*`, `https://claude.ai/*`, `https://chatgpt.com/*`, the `oauth2`
   block. Update:
   - `activeTab`: "Reads the current tab only when the user clicks Save, Save URL, Bookmark or Save Conversation."
   - `scripting`: "Injects the conversation reader into claude.ai / chatgpt.com on the user's click (activeTab), the
     page-text reader on Save URL / Bookmark, and the YouTube playlist-add detector on youtube.com."
   - Host `https://www.youtube.com/*`: "Save button on watch pages; detects when the user adds a video to their own
     YouTube playlist to import that playlist."
3. **Privacy practices › Data usage**: tick *Website content* (saved pages, AI conversations), *Personally
   identifiable information* (email at sign-in), *Authentication information*, and *User activity* (playlist-add
   events on youtube.com). Re-certify the Limited Use statements.
4. **Privacy policy URL**: confirm the English policy lives at https://brain-tube.com/privacy (the listing links
   it; only the Korean URL was verified in the repo).

## 3. Server side (other repos, recommended)

- `youtube-sync-playlist`: accept only playlists the signed-in user owns (or at least ones that are public/
  unlisted and readable), rate-limit per user, and log the source. The extension now filters forged adds, but the
  endpoint should not trust any client.
- `extension-ingest` (Railway): cap `conversation_text` size and rate-limit per user.

## 4. User-visible change to announce

Users are signed out when they quit the browser (tokens no longer persist in `chrome.storage.local`). Mention it
in the release notes; the popup says so under the sign-in buttons.
