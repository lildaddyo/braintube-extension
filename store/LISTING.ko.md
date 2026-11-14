# Chrome Web Store listing, Korean (ko) — v1.6.4 rewrite (2026-11-14)

Name and summary come from `_locales/ko/messages.json` (`extName`, `extDescription`). The detailed description is
pasted in the Developer Dashboard: BrainTube item › Store listing › language dropdown › Korean (한국어) ›
Description. Screenshots: `store/screenshots/ko-1.png` … `ko-5.png`. Same claims as `LISTING.en.md` (claim map
there); Korean terms follow dark-n-cozy `messages/ko/GLOSSARY.md` (크레딧, 요금제, 무료/스타터/프로, 해요체).

v1.7.0 (security audit 2026-11-01): the 🔒 section now says exactly what is read, when, where it goes and which AI
processors get it, in step with `store/LISTING.en.md` and the popup copy. The old lines "방문 기록을 추적하지 않아요"
and "제3자 데이터 공유도 없어요" are gone: playlist sync runs in the background and content goes to AI processors.

## Name (from manifest, max 75)
BrainTube: YouTube 영상 저장하고 AI에게 질문하기

## Summary (from manifest, max 132)
YouTube 영상, 기사, AI 대화를 클릭 한 번으로 저장하고 라이브러리 전체에 질문해 보세요. Claude, ChatGPT, Cursor에서도 쓸 수 있어요.

## Detailed description
내 YouTube 라이브러리를, 이미 쓰고 있는 AI 도구 안에서.

BrainTube는 보고 읽은 것을 하나의 라이브러리에 저장하고, 그 라이브러리에 질문할 수 있게 해 줘요. 사이드 패널에서도, BrainTube 앱에서도, Claude, ChatGPT, Cursor 같은 MCP 클라이언트에서도요.

클릭 한 번으로 저장
• 지금 보고 있는 YouTube 영상, 아무 웹 페이지, Claude나 ChatGPT 대화를 저장해요.
• 태그와 읽지 않음 필터가 있는 읽을거리 목록에 페이지를 북마크해요.
• X(Twitter) 북마크 페이지에서 북마크를 가져올 수 있어요.

저장하면 바로 쓸 수 있어요
• 저장할 때마다 요약과 핵심 내용이 만들어져요.
• YouTube 영상은 타임스탬프가 있는 전체 스크립트를 보여 줘요. 줄을 누르면 그 장면으로 이동해요.
• 저장, 스크립트, 자동 요약은 모든 요금제에서 무료이고 무제한이에요.

AI에게 질문하기
• 보고 있는 영상과 대화하거나, "내 모든 지식"으로 바꿔 저장한 내용 전체에 질문해 보세요.
• BrainTube를 Claude, ChatGPT, Cursor 같은 MCP 클라이언트에 연결하면 AI가 내 라이브러리를 검색하고 찾은 내용을 BrainTube에 저장할 수 있어요.

요금제와 크레딧
• 무료: 무제한 저장, 매달 AI 크레딧 30개, MCP 포함. 카드가 필요 없어요.
• 스타터: 매달 AI 크레딧 300개. 프로: 매달 AI 크레딧 1,000개.
• 크레딧은 항목별 AI 질문이나 퀴즈 같은 AI 기능에 써요. 요금제와 남은 크레딧은 팝업에서 바로 확인하고 업그레이드할 수 있어요.

개인정보: BrainTube가 읽는 것과 보내는 곳
• 페이지·영상 저장: 저장, URL 저장, 북마크를 누를 때만 그 탭의 주소와 화면에 보이는 텍스트를 BrainTube 서버로 보내요. 서버가 내용을 읽고 요약해요.
• AI 대화 저장 (claude.ai, chatgpt.com): BrainTube 팝업에서 대화 저장을 누를 때만 그 대화 내용을 읽어 BrainTube 서버로 보내요. 요약은 Anthropic(Claude)이 해요. 자동으로 저장하는 일은 없어요.
• X 북마크: X 북마크 페이지에서 가져오기를 누를 때만 목록을 스크롤해 북마크한 게시물 최대 100개의 텍스트를 BrainTube로 보내요. X에서는 아무것도 좋아요, 게시, 변경하지 않아요.
• YouTube 재생목록 동기화: 로그인한 동안 youtube.com에서 내 YouTube 재생목록에 영상을 추가하면, 그 재생목록 ID를 BrainTube로 보내 재생목록을 내 라이브러리로 가져와요. 이 동작은 백그라운드에서 일어나요.
• AI 처리: 요약, 채팅, 검색에는 BrainTube를 대신해 콘텐츠를 처리하는 AI 서비스(Anthropic, OpenAI, Google Gemini)를 사용해요.
• 광고가 없고 데이터를 판매하지 않아요. 내 라이브러리는 내 계정에만 보이고 EU에 저장돼요.
• 로그인 정보는 로그아웃할 때까지 이 컴퓨터에만 보관되고, 웹페이지는 읽을 수 없어요.
• 개인정보 처리방침: https://brain-tube.com/ko/privacy

영어와 한국어로 쓸 수 있어요.

https://brain-tube.com/ko 에서 무료로 시작하세요.
