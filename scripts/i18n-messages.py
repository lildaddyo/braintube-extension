# Writes _locales/en/messages.json and _locales/ko/messages.json from one table, so both
# locales always carry the same keys. Run: python scripts/i18n-messages.py
# Korean follows dark-n-cozy messages/ko/GLOSSARY.md (해요체, one term per concept).
import json, os, re

M = [
    # key, English (must match the shipped UI exactly), Korean
    ("htmlLang", "en", "ko"),
    ("extName", "BrainTube: Save YouTube Videos & Ask Your Library", "BrainTube: YouTube 영상 저장하고 AI에게 질문하기"),
    ("extDescription", "Save YouTube videos, articles and AI chats in one click. Ask questions across your library, or use it in Claude, ChatGPT and Cursor.",
     "YouTube 영상, 기사, AI 대화를 클릭 한 번으로 저장하고 라이브러리 전체에 질문해 보세요. Claude, ChatGPT, Cursor에서도 쓸 수 있어요."),
    ("saveToBrainTube", "Save to BrainTube", "BrainTube에 저장"),

    # popup
    ("loadingDots", "Loading...", "불러오는 중…"),
    ("signInTitle", "Sign in to BrainTube", "BrainTube에 로그인"),
    ("emailPlaceholder", "Email", "이메일"),
    ("passwordPlaceholder", "Password", "비밀번호"),
    ("signIn", "Sign In", "로그인"),
    ("or", "or", "또는"),
    ("signInWithGoogle", "Sign in with Google", "Google로 로그인"),
    ("searchPlaceholder", "Search your library...", "내 라이브러리 검색…"),
    ("currentVideo", "Current Video", "현재 영상"),
    ("viewNote", "View Note", "메모 보기"),
    ("aiChat", "AI Chat", "AI 채팅"),
    ("aiConversation", "AI Conversation", "AI 대화"),
    ("claudeConversation", "Claude.ai Conversation", "Claude.ai 대화"),
    ("chatgptConversation", "ChatGPT Conversation", "ChatGPT 대화"),
    ("saveConversation", "💾 Save Conversation", "💾 대화 저장"),
    ("saveThisVideo", "💾 Save This Video", "💾 이 영상 저장"),
    ("saveUrl", "➕ Save URL", "➕ URL 저장"),
    ("bookmark", "🔖 Bookmark", "🔖 북마크"),
    ("openLibrary", "📚 Open Library", "📚 라이브러리 열기"),
    ("signOut", "Sign Out", "로그아웃"),
    ("userFallback", "User", "사용자"),
    ("statusProcessingDots", "🟡 Processing...", "🟡 처리 중…"),
    ("statusNeedsSummary", "🟡 Needs Summary", "🟡 요약 필요"),
    ("statusReady", "🟢 Ready", "🟢 준비됨"),
    ("statusError", "🔴 Error", "🔴 오류"),
    ("savingEllipsis", "⏳ Saving…", "⏳ 저장 중…"),
    ("summarisingOnServer", "Summarising on BrainTube server…", "BrainTube 서버에서 요약하는 중…"),
    ("savedBang", "✅ Saved!", "✅ 저장했어요!"),
    ("convSavedNoText", "\"$TITLE$\" saved (reload the page and try again to capture full text)",
     "\"$TITLE$\" 저장했어요 (전체 내용을 저장하려면 페이지를 새로고침한 뒤 다시 시도해 주세요)"),
    ("urlSavedToBrainTube", "URL saved to BrainTube", "BrainTube에 URL을 저장했어요"),
    ("convSaved", "Conversation saved to BrainTube", "BrainTube에 대화를 저장했어요"),
    ("signInFirstArrow", "Sign in to BrainTube first ↑", "먼저 BrainTube에 로그인해 주세요 ↑"),
    ("sessionExpired", "Session expired — sign out and back in", "세션이 만료됐어요. 로그아웃한 뒤 다시 로그인해 주세요"),
    ("saveFailedRetry", "Save failed — please try again", "저장하지 못했어요. 다시 시도해 주세요"),
    ("enterEmailPassword", "Please enter email and password", "이메일과 비밀번호를 입력해 주세요"),
    ("signingIn", "Signing in...", "로그인 중…"),
    ("signInFailed", "Sign in failed", "로그인하지 못했어요"),
    ("openingGoogle", "⏳ Opening Google sign-in…", "⏳ Google 로그인 여는 중…"),
    ("verifying", "⏳ Verifying…", "⏳ 확인 중…"),
    ("signInCancelled", "Sign-in was cancelled", "로그인을 취소했어요"),
    ("signInFailedDetail", "Sign-in failed: $DETAIL$", "로그인하지 못했어요: $DETAIL$"),
    ("notSignedIn", "Not signed in — please sign in first", "로그인하지 않았어요. 먼저 로그인해 주세요"),
    ("savingDots", "💾 Saving...", "💾 저장 중…"),
    ("videoSaved", "Video saved! Processing started.", "영상을 저장했어요! 처리를 시작했어요."),
    ("failedSaveVideo", "Failed to save video", "영상을 저장하지 못했어요"),
    ("cannotReadTab", "Could not read current tab URL", "현재 탭의 URL을 읽지 못했어요"),
    ("alreadySavedBtn", "✓ Already saved", "✓ 이미 저장됨"),
    ("alreadyInLibrary", "Already in your library", "이미 내 라이브러리에 있어요"),
    ("serverSlow", "The server is slow — the page will appear in your library shortly.",
     "서버 응답이 느려요. 곧 내 라이브러리에 페이지가 나타나요."),
    ("bookmarkedToast", "Bookmarked! Find it in the 🔖 Saved tab.", "북마크했어요! 🔖 저장됨 탭에서 볼 수 있어요."),
    ("savedSummarySoon", "Saved! The summary will be ready in a minute.", "저장했어요! 1분 안에 요약이 준비돼요."),
    ("saveFailed", "Save failed", "저장하지 못했어요"),
    ("errorBtn", "❌ Error", "❌ 오류"),
    ("savedCheck", "✓ Saved!", "✓ 저장했어요!"),
    ("bookmarkedCheck", "✓ Bookmarked!", "✓ 북마크했어요!"),

    # disclosures (security audit 2026-11-01, finding 5)
    ("aiCaptureDisclosure",
     "Only when you click Save, BrainTube reads this conversation from the page and sends its text to the BrainTube server, where Anthropic (Claude) summarises it.",
     "저장을 누를 때만 BrainTube가 이 페이지에서 대화를 읽어요. 대화 내용은 BrainTube 서버로 보내지고, Anthropic(Claude)이 요약해요."),
    ("playlistSyncDisclosure",
     "While you are signed in, adding a video to one of your YouTube playlists also imports that playlist into your BrainTube library.",
     "로그인한 동안 YouTube 재생목록에 영상을 추가하면 그 재생목록도 내 BrainTube 라이브러리로 가져와요."),

    # side panel
    ("sidePanelTitle", "BrainTube Side Panel", "BrainTube 사이드 패널"),
    ("tabChat", "💬 Chat", "💬 채팅"),
    ("tabSummary", "📝 Summary", "📝 요약"),
    ("tabTranscript", "📄 Transcript", "📄 스크립트"),
    ("tabHighlights", "✨ Highlights", "✨ 하이라이트"),
    ("tabSaved", "🔖 Saved", "🔖 저장됨"),
    ("videoNotInLibrary", "Video not in library", "라이브러리에 없는 영상이에요"),
    ("saveToUnlock", "Save this video to unlock AI features", "이 영상을 저장하면 AI 기능을 쓸 수 있어요"),
    ("modeThisVideo", "📹 This video", "📹 이 영상"),
    ("modeAllKnowledge", "🧠 All my knowledge", "🧠 내 모든 지식"),
    ("askVideoPlaceholder", "Ask anything about this video...", "이 영상에 대해 무엇이든 물어보세요…"),
    ("askCorpusPlaceholder", "Ask across everything you've saved...", "저장한 모든 내용에 대해 물어보세요…"),
    ("send", "Send", "보내기"),
    ("tagsPlaceholder", "Tags (comma-separated, optional)", "태그 (쉼표로 구분, 선택)"),
    ("bookmarkThisPage", "🔖 Bookmark this page", "🔖 이 페이지 북마크"),
    ("filterUnread", "Unread", "안 읽음"),
    ("filterRead", "Read", "읽음"),
    ("filterAll", "All", "전체"),
    ("pleaseSignIn", "Please sign in to use BrainTube", "BrainTube를 사용하려면 로그인해 주세요"),
    ("openYouTubeVideo", "Open a YouTube video to use this feature", "이 기능을 쓰려면 YouTube 영상을 열어 주세요"),
    ("youtubeVideo", "YouTube Video", "YouTube 영상"),
    ("failedLoadVideo", "Failed to load video data", "영상 정보를 불러오지 못했어요"),
    ("statusProcessing", "🟡 Processing", "🟡 처리 중"),
    ("generateSummary", "🤖 Generate AI Summary", "🤖 AI 요약 만들기"),
    ("summaryHeading", "Summary", "요약"),
    ("keyTakeaways", "Key Takeaways", "핵심 내용"),
    ("processingBtn", "⏳ Processing...", "⏳ 처리 중…"),
    ("startedRefresh", "✅ Started! Refresh in a minute", "✅ 시작했어요! 1분 뒤에 새로고침해 주세요"),
    ("failedTryAgain", "❌ Failed — try again", "❌ 하지 못했어요. 다시 시도해 주세요"),
    ("noTranscript", "No transcript available", "스크립트가 없어요"),
    ("noHighlights", "No highlights yet", "아직 하이라이트가 없어요"),
    ("greetItem", "👋 Hi! Ask me anything about this video!", "👋 안녕하세요! 이 영상에 대해 무엇이든 물어보세요!"),
    ("greetCorpus", "🧠 Ask me anything across your entire saved knowledge base!",
     "🧠 저장한 지식 베이스 전체에서 무엇이든 물어보세요!"),
    ("stillProcessingNote", "⚠️ Note: This video is still processing. Chat will work once it's indexed.",
     "⚠️ 참고: 이 영상은 아직 처리 중이에요. 색인이 끝나면 채팅할 수 있어요."),
    ("stillProcessingWait", "⏳ This video is still processing. Please wait until it's indexed before chatting.",
     "⏳ 이 영상은 아직 처리 중이에요. 색인이 끝난 뒤에 채팅해 주세요."),
    ("thinking", "💭 Thinking...", "💭 생각 중…"),
    ("justNow", "just now", "방금"),
    ("minutesAgo", "$COUNT$m ago", "$COUNT$분 전"),
    ("hoursAgo", "$COUNT$h ago", "$COUNT$시간 전"),
    ("daysAgo", "$COUNT$d ago", "$COUNT$일 전"),
    ("loadingEllipsis", "Loading…", "불러오는 중…"),
    ("failedLoadBookmarks", "Failed to load bookmarks.", "북마크를 불러오지 못했어요."),
    ("emptyUnread", "No unread bookmarks yet.", "아직 안 읽은 북마크가 없어요."),
    ("emptyRead", "No read bookmarks yet.", "아직 읽은 북마크가 없어요."),
    ("emptyAll", "No bookmarks yet.", "아직 북마크가 없어요."),
    ("saveForLaterHint", "Save pages for later using the button above.", "위 버튼으로 나중에 볼 페이지를 저장해 보세요."),
    ("markUnread", "Mark unread", "안 읽음으로 표시"),
    ("markRead", "Mark as read", "읽음으로 표시"),
    ("removeBookmark", "Remove bookmark", "북마크 삭제"),
    ("signInFirstWarn", "⚠️ Sign in first", "⚠️ 먼저 로그인해 주세요"),

    # Google sign-in tab (auth.html)
    ("authPageTitle", "BrainTube – Signing in…", "BrainTube – 로그인 중…"),
    ("connectingGoogle", "Connecting to Google…", "Google에 연결하는 중…"),
    ("waitingGoogle", "Waiting for Google sign-in…", "Google 로그인을 기다리는 중…"),
    ("signInCancelledTab", "Sign-in cancelled or failed. You can close this tab.",
     "로그인을 취소했거나 로그인하지 못했어요. 이 탭은 닫아도 돼요."),
    ("signingInToBrainTube", "Signing in to BrainTube…", "BrainTube에 로그인하는 중…"),

    # API errors shown to the user
    ("saveTimedOut", "Video save timed out after 30 seconds. The server may be busy — try again.",
     "영상 저장이 30초 안에 끝나지 않았어요. 서버가 바쁠 수 있어요. 다시 시도해 주세요."),
    ("chatUnavailable", "Chat unavailable — please try again in a moment.", "지금은 채팅을 쓸 수 없어요. 잠시 후 다시 시도해 주세요."),
    ("chatUnavailableStatus", "Chat unavailable ($STATUS$)", "지금은 채팅을 쓸 수 없어요 ($STATUS$)"),
    ("pageCannotBeSaved", "This page cannot be saved", "이 페이지는 저장할 수 없어요"),

    # X bookmarks import panel (x-import.js). Placeholders keep the same order in both languages.
    ("xImportButton", "Import bookmarks (up to $LIMIT$)", "북마크 가져오기 (최대 $LIMIT$개)"),
    ("xImportIntro", "Saves each bookmarked post to BrainTube with its links and the post it quotes.",
     "북마크한 게시물을 링크와 인용한 게시물까지 BrainTube에 저장해요."),
    ("xImportFinding", "Finding bookmarks… $COUNT$", "북마크를 찾는 중… $COUNT$"),
    ("xImportProgress", "Saving $INDEX$ of $TOTAL$… ($SAVED$ saved)", "저장 중 $INDEX$/$TOTAL$… ($SAVED$개 저장됨)"),
    ("xImportStop", "Stop", "중지"),
    ("xImportNone", "No bookmarks found on this page.", "이 페이지에서 북마크를 찾지 못했어요."),
    ("xImportSignIn", "Sign in to the BrainTube extension first, then try again.",
     "먼저 BrainTube 확장 프로그램에 로그인한 뒤 다시 시도해 주세요."),
    ("xImportDone", "Done: $SAVED$ saved, $ALREADY$ already in BrainTube, $FAILED$ failed.",
     "완료: $SAVED$개 저장, $ALREADY$개는 이미 BrainTube에 있어요, $FAILED$개 실패."),
    ("xImportStopped", "Stopped: $SAVED$ saved, $ALREADY$ already in BrainTube, $FAILED$ failed.",
     "중지됨: $SAVED$개 저장, $ALREADY$개는 이미 BrainTube에 있어요, $FAILED$개 실패."),
    ("xImportError", "Import stopped: $ERROR$", "가져오기가 중지됐어요: $ERROR$"),
    ("xImportAgain", "Import again", "다시 가져오기"),

    # plan, credits and upgrade prompts (popup + side panel). Plan names per GLOSSARY: 무료 / 스타터 / 프로.
    ("planFree", "Free", "무료"),
    ("planStarter", "Starter", "스타터"),
    ("planPro", "Pro", "프로"),
    ("planProPlus", "Pro+", "프로+"),
    ("planTrial", "Pro trial", "프로 무료 체험"),
    ("creditsLeft", "$COUNT$ credits left", "크레딧 $COUNT$개 남음"),
    ("creditsTrialEnds", "$COUNT$ credits · ends $DATE$", "크레딧 $COUNT$개 · $DATE$ 종료"),
    ("upgrade", "Upgrade", "업그레이드"),
    ("keepPro", "Keep Pro", "프로 계속 쓰기"),
    ("seePlans", "See plans", "요금제 보기"),
    ("notNow", "Not now", "나중에"),
    ("limitTitle", "You're out of AI credits", "AI 크레딧을 다 썼어요"),
    ("limitBody", "Saving and summaries stay free. Starter gives you $STARTER$ AI credits a month, Pro $PRO$, for Ask AI, quizzes and more.",
     "저장과 요약은 계속 무료예요. 스타터는 매달 AI 크레딧 $STARTER$개, 프로는 $PRO$개를 드려요. AI 질문, 퀴즈 등에 쓸 수 있어요."),
    ("limitBodyTrial", "Saving and summaries stay free. Keep Pro to get 1,000 AI credits every month.",
     "저장과 요약은 계속 무료예요. 프로를 계속 쓰면 매달 AI 크레딧 1,000개를 받아요."),
    ("nudgeTitle", "You've saved $COUNT$ things to BrainTube", "BrainTube에 $COUNT$개를 저장했어요"),
    ("nudgeBody", "Ask questions across all of them. Pro gives you $PRO$ AI credits a month; Free has $FREE$.",
     "저장한 내용 전체에 질문해 보세요. 프로는 매달 AI 크레딧 $PRO$개, 무료는 $FREE$개예요."),
    ("nudgeBodyTrial", "Your Pro trial is on. Keep Pro so your library keeps its AI chat, summaries and quizzes.",
     "지금 프로 무료 체험 중이에요. 프로를 계속 쓰면 AI 채팅, 요약, 퀴즈를 그대로 쓸 수 있어요."),
    ("rateLimited", "Too many saves right now. Try again in a few minutes.", "지금은 저장 요청이 너무 많아요. 몇 분 뒤에 다시 시도해 주세요."),
    ("chatRateLimited", "Too many questions right now. Try again in a few minutes.", "지금은 질문이 너무 많아요. 몇 분 뒤에 다시 시도해 주세요."),
]

ROOT = os.path.join(os.path.dirname(__file__), "..", "_locales")


def entry(text):
    e = {"message": text}
    names = re.findall(r"\$([A-Z]+)\$", text)
    if names:
        e["placeholders"] = {n.lower(): {"content": f"${i + 1}"} for i, n in enumerate(names)}
    return e


keys = [k for k, _, _ in M]
assert len(keys) == len(set(keys)), "duplicate key"
for lang, col in (("en", 1), ("ko", 2)):
    os.makedirs(os.path.join(ROOT, lang), exist_ok=True)
    out = {row[0]: entry(row[col]) for row in M}
    with open(os.path.join(ROOT, lang, "messages.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")
print(f"{len(M)} messages x 2 locales")
