# 🧠 BrainTube Chrome Extension - Clean Build

**Built from official specification** - Production-ready Chrome extension for BrainTube.

## ✨ What's Included

### Core Features
- ✅ **Save YouTube videos** to BrainTube library
- ✅ **AI Chat** - Chat with AI about video content
- ✅ **View Summaries** - AI-generated summaries and key takeaways
- ✅ **Read Transcripts** - Full transcript with clickable timestamps
- ✅ **Highlights** - View and manage your saved highlights
- ✅ **Quick Search** - Search your library from anywhere
- ✅ **Direct Authentication** - Sign in with email/password

### Architecture
- Clean modular code structure
- ES6 modules throughout
- Manifest V3 compliant
- Based on official BrainTube API specification

## 📦 Installation

### Step 1: Download & Extract
1. Download `BrainTube-Extension-CLEAN.zip`
2. Extract to a folder on your computer
3. You'll see `braintube-extension-v2` folder

### Step 2: Generate Icons
1. Open `create-icons.html` in your browser
2. Click "Download All Icons"
3. Create `icons` folder in the extension directory
4. Move all 4 downloaded PNG files into `icons` folder

### Step 3: Load in Chrome
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select the `braintube-extension-v2` folder
5. Done! Extension is now loaded

## 🚀 How to Use

### First Time Setup
1. Click the BrainTube extension icon in your toolbar
2. Enter your BrainTube email and password
3. Click "Sign In"

### Saving Videos
1. Go to any YouTube video
2. Click the BrainTube extension icon
3. Click "💾 Save This Video"
4. Wait for processing to complete

### Using AI Chat
1. While on a YouTube video, click the extension icon
2. Click "AI Chat" or "View Note"
3. This opens the side panel
4. Switch to "Chat" tab
5. Ask questions about the video!

### Viewing Transcripts
1. Open the side panel (click "View Note")
2. Go to "Transcript" tab
3. Click any timestamp to jump to that moment in the video

## 📁 File Structure

```
braintube-extension-v2/
├── manifest.json              # Extension configuration
├── popup.html                 # Popup UI
├── sidepanel.html            # Side panel UI
├── create-icons.html         # Icon generator tool
├── scripts/
│   ├── config.js             # API configuration
│   ├── auth.js               # Authentication module
│   ├── api.js                # API calls
│   ├── youtube.js            # YouTube utilities
│   ├── popup.js              # Popup logic
│   ├── sidepanel.js          # Side panel logic
│   ├── content-script.js     # YouTube page integration
│   └── service-worker.js     # Background tasks
└── styles/
    ├── popup.css             # Popup styles
    ├── sidepanel.css         # Side panel styles
    └── content-styles.css    # YouTube page styles
```

## 🔧 Key Features Explained

### 1. Authentication
- Direct sign-in with email/password
- Session stored securely in Chrome storage
- Auto-validates on startup

### 2. Video Detection
- Automatically detects when you're on a YouTube video
- Shows video status (saved/not saved)
- Quick save button when video isn't in library

### 3. Side Panel (Main Feature!)
Four powerful tabs:

**💬 Chat Tab**
- AI chatbot grounded in video content
- Only works on indexed videos
- Real-time conversation

**📝 Summary Tab**
- View AI-generated summary
- See key takeaways
- Generate summary button for unprocessed videos
- Status indicator

**📄 Transcript Tab**
- Full scrollable transcript
- Timestamps for each segment
- Click to jump to that moment
- Clean, readable format

**✨ Highlights Tab**
- View all your saved highlights
- Organized by creation date

### 4. Content Script
- Adds "Save" button to YouTube (optional)
- Enables timestamp jumping from side panel
- Lightweight and non-intrusive

## 🐛 Troubleshooting

### Chat Not Working?
**Check video status first!**
1. Open side panel
2. Go to Summary tab
3. Look at status badge
4. If NOT "🟢 Ready", click "Generate AI Summary"
5. Wait for processing
6. Chat will work once indexed

### Session Expired?
1. Click extension icon
2. Sign out
3. Sign in again
4. All features will work

### Icons Missing?
1. Open `create-icons.html`
2. Download icons
3. Put in `icons/` folder
4. Reload extension

### Video Won't Save?
- Check you're signed in
- Check your subscription tier (Free = 5 videos max)
- Check internet connection

## 📋 What's Different From Old Version?

### ✅ Improvements
- Clean code structure with modules
- Proper error handling throughout
- Console logging for debugging
- Status checks before chat
- Better UI/UX in side panel
- Follows official API spec exactly

### 🗑️ Removed
- Complex session refresh logic (simplified)
- Unnecessary dependencies
- Redundant code

## 🔑 Environment

- **API Base**: https://pmwuwzoqnhqqqseddzes.supabase.co
- **Web App**: https://brain-tube.com
- **Manifest**: V3

## 💡 Pro Tips

1. **Always check video status** before using chat
2. **Generate summaries** for better chat responses
3. **Use transcript** to navigate long videos quickly
4. **Save interesting videos** even if you don't watch them all

## 📝 Notes

- Chat requires videos to be indexed (processed)
- Free tier: 5 videos max
- Timestamps are clickable in transcript
- Extension works on youtube.com/watch pages only

---

**Built with ❤️ following the official BrainTube API specification**
