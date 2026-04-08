# BrainTube – AI Conversation Capture

Chrome extension that automatically saves summaries of your [Claude](https://claude.ai) and [ChatGPT](https://chatgpt.com) conversations to your [BrainTube](https://brain-tube.com) knowledge base.

## How it works

1. You have a conversation on claude.ai or chatgpt.com
2. Click the BrainTube icon (or let auto-save handle it)
3. The extension sends the raw conversation text to the BrainTube server
4. The server summarises it using Claude and stores the digest in your knowledge base

Raw conversation text never leaves your browser stored anywhere — only the summary is saved.

## Zero configuration

**Just log into [brain-tube.com](https://brain-tube.com) and you're done.** No API keys, no setup, nothing to configure.

Summarisation runs server-side, so the extension itself requires no credentials.

## Features

- **Manual save** — click the BrainTube toolbar icon on any conversation and hit "Save to BrainTube"
- **Auto-save on tab close** — optionally save automatically when you close a conversation tab
- **Inactivity auto-save** — optionally save after 10 minutes of inactivity on a conversation
- **Per-site toggles** — disable capture entirely for claude.ai or chatgpt.com independently
- **Session-aware auth** — reads your brain-tube.com login session automatically; shows a prompt if you're not logged in
- **Orange BT indicator** — small dot in the corner of supported pages shows capture is active

## Installation (developer mode)

1. Clone or download this repo
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select this folder
5. Log into [brain-tube.com](https://brain-tube.com)
6. Open a conversation on claude.ai or chatgpt.com — the BT dot will appear

## Settings

Open the extension settings (⚙ in the popup) to:

- Toggle **auto-save** on/off
- Enable/disable capture per site (claude.ai and chatgpt.com independently)

## File structure

```
braintube-extension/
├── manifest.json          # MV3 extension manifest
├── background.js          # Service worker — auth, save flow, alarms
├── popup.html / .js / .css   # Toolbar popup UI
├── settings.html / .js / .css  # Options page
├── content/
│   ├── claude.js          # Content script for claude.ai
│   ├── chatgpt.js         # Content script for chatgpt.com
│   └── brain-tube.js      # Content script for brain-tube.com (reads auth token)
└── icons/
    └── braintube-logo.png
```

## Tech

- Chrome Extension Manifest V3
- Service worker for background processing
- Supabase JWT auth (read from brain-tube.com localStorage — no manual token pasting)
- Conversation text sent to `braintube-mcp-production.up.railway.app/api/extension-ingest`

## Related

- [braintube-mcp](https://github.com/lildaddyo/braintube-mcp) — the MCP server that powers summarisation and storage
- [brain-tube.com](https://brain-tube.com) — the BrainTube web app
