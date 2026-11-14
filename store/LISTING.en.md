# Chrome Web Store listing, English (en) — v1.6.4 rewrite (2026-11-14)

Name and summary come from `_locales/en/messages.json` (`extName`, `extDescription`), so they change with the
package. The detailed description is pasted in the Developer Dashboard: BrainTube item › Store listing ›
English › Description. Screenshots: `store/screenshots/en-1.png` … `en-5.png` (1280x800, rendered from the real
popup and side panel by `store/shots/`). Every claim is checked against content-canon `truth/braintube.md`
(2026-11-11) or the extension code; the claim map is at the bottom.

## Name (from manifest, max 75)
BrainTube: Save YouTube Videos & Ask Your Library

## Summary (from manifest, max 132)
Save YouTube videos, articles and AI chats in one click. Ask questions across your library, or use it in Claude, ChatGPT and Cursor.

## Detailed description
Your YouTube library, in the AI tools you already use.

BrainTube saves what you watch and read into one library you can ask questions of: in the side panel, in the BrainTube app, or from Claude, ChatGPT, Cursor and other MCP clients.

SAVE IN ONE CLICK
• Save the YouTube video you are watching, any web page, or a Claude or ChatGPT conversation.
• Bookmark pages into a reading list with tags and an unread filter.
• Import your X (Twitter) bookmarks from the Bookmarks page.

EVERY SAVE IS READY TO USE
• A summary and key takeaways for each save.
• The full transcript of YouTube videos, with timestamps: click a line to jump to that moment.
• Saving, transcripts and automatic summaries are free and unlimited on every plan.

ASK AI
• Chat with the video you are watching, or switch to "All my knowledge" and ask across everything you saved.
• Connect BrainTube to Claude, ChatGPT, Cursor and other MCP clients so your AI can search your library and save what it finds.

PLANS AND CREDITS
• Free: unlimited saves, 30 AI credits a month, MCP access included. No card needed.
• Starter: 300 AI credits a month. Pro: 1,000 AI credits a month.
• Credits pay for AI actions such as Ask AI on an item and quizzes. Your plan and credit balance are shown in the popup, and you can upgrade from there.

PRIVACY
• Your library is private to your account and stored in the EU.
• Privacy policy: https://brain-tube.com/privacy

Available in English and Korean.

Get started free at https://brain-tube.com

---

## Claim map (internal, not pasted)
| Claim | Source |
|---|---|
| Descriptor line | BrainTube D-106, canon C-6b073b7d8c |
| Save video / page / Claude + ChatGPT conversation | extension code: popup.js save buttons, ai-capture.js on claude.ai + chatgpt.com |
| Reading list, tags, unread filter | sidepanel.html Saved tab (tags field, Unread/Read/All pills) |
| X bookmarks import | x-import.js (PR #21, ships in 1.6.4) |
| Summary + key takeaways per save | process-youtube / process-content write summary; side panel Summary tab |
| Timestamped transcript, click to seek | sidepanel.js loadTranscript + seekToTime |
| Saving, transcripts, automatic summaries free + unlimited | C-b73eb3cee8 |
| Item chat + "All my knowledge" | sidepanel chat-mode toggle (ask-item-ai / ai-router) |
| MCP clients, AI can save what it finds | C-a0318bda81, C-fe60c7c7c9 (approved wording C-769a2b0155) |
| Free 30 credits, unlimited saves, MCP, no card | C-3a1447a9b4, C-b9ae8d7c56 |
| Starter 300 / Pro 1,000 credits | C-0d47f1a87f, C-dcf71816c7, public.tier_credit_allocations |
| Credits for Ask AI, quizzes | C-2c0a4a0f3a (Ask AI 2, Quiz 2) |
| Stored in the EU, private to your account | C-9604984bed (approved softer wording) |

Removed from the old listing (not verifiable or FORBIDDEN): "Collections & Tags" (Collections killed, C-c19b98a596),
"timestamp citations you can click" in chat (not in the extension), "Highlights & timestamped notes" creation (the
side panel only lists highlights), "Full-text search across every transcript" from the extension (the popup search
opens the web app), "takes 10 seconds", "No browsing history tracking" (not provable: the YouTube playlist watcher relays playlist adds on its own).
