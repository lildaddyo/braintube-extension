# Chrome Web Store listing, Korean (ko)

The extension name and summary come from `_locales/ko/messages.json` (`extName`, `extDescription`) since v1.6.0, so
Korean Chrome users see them once 1.6.0 is published. The detailed description below is pasted in the Developer
Dashboard: BrainTube item › Store listing › language dropdown › Korean (한국어) › Description › Save draft, then
submit with the next upload. Screenshots: the English ones stay until Korean captures exist.

v1.7.0 (security audit 2026-11-01): the 🔒 section now says exactly what is read, when, where it goes and which AI
processors get it, in step with `store/LISTING.en.md` and the popup copy. The old lines "방문 기록을 추적하지 않아요"
and "제3자 데이터 공유도 없어요" are gone: playlist sync runs in the background and content goes to AI processors.

## Name (from manifest, max 75)
BrainTube - YouTube 지식 베이스

## Summary (from manifest, max 132)
YouTube 영상을 저장하고 AI 요약을 받아 보세요. 내 지식 베이스도 바로 검색할 수 있어요.

## Detailed description
YouTube 영상을 저장하고, AI 요약을 받고, 내 지식 베이스를 검색하세요.

매주 몇 시간씩 YouTube를 보지만, 실제로 기억나는 건 얼마나 되나요?

BrainTube는 YouTube와 웹에서 본 것을 모든 AI가 쓸 수 있는 지식 베이스로 정리해요.

🔍 문제
좋은 영상을 보고 "이건 기억해야지" 생각해요. 일주일 뒤면 잊어버리죠.

메모는 여러 앱에 흩어져 있고, 북마크는 다시 열어 보지 않아요. 석 달 전에 본 영상에서 누가 무슨 말을 했는지 검색할 방법도 없어요.

익숙한 이야기인가요?

🧠 해결책
BrainTube는 YouTube 영상, 기사, LinkedIn 게시물, 웹 페이지를 나만의 지식 라이브러리에 저장하고, 바로 검색하고 활용할 수 있게 해 줘요.

깔끔한 사이드 패널이 보고 있는 콘텐츠 바로 옆에 열려요. 탭을 오갈 필요도, 번거로운 과정도 없어요.

✨ 이런 걸 할 수 있어요
🧠 AI 요약: YouTube 영상이나 웹 페이지에서 메모, 핵심 내용, 구조화된 개요를 바로 받아 보세요. 다시 볼 필요 없이 기억에 남겨요.

💬 콘텐츠와 채팅: 영상이나 기사에 대해 무엇이든 물어보세요. 실제 스크립트를 바탕으로 답하고, 누르면 해당 부분으로 바로 이동하는 타임스탬프 출처도 함께 보여 줘요.

📝 하이라이트와 메모: 스크립트에서 텍스트를 선택해 하이라이트하고, 정확한 순간으로 연결되는 타임스탬프 메모를 남기세요. 보고 읽는 모든 것 위에 나만의 메모를 쌓을 수 있어요.

🔍 라이브러리 전체 검색: 지금까지 저장한 모든 스크립트, 하이라이트, 메모를 전문 검색해요. 그 영상의 그 한 문장도 몇 초 만에 찾아요.

⚡ 클릭 한 번으로 저장: 사이드 패널에서 저장을 누르면 끝이에요. 지금 보는 페이지나 영상이 라이브러리에 들어가 요약, 검색, 다시 보기를 할 수 있어요.

📂 컬렉션과 태그: 주제, 프로젝트, 관심사별로 지식을 정리하세요. 관련 콘텐츠를 묶어 체계적인 학습 경로를 만들 수 있어요.

🎯 이런 분께 추천해요
튜토리얼, 강의, 심층 영상을 보며 배우는 YouTube 학습자
몇 시간 분량의 콘텐츠에서 특정 내용을 다시 찾아야 하는 연구자
영상 강의로 공부 라이브러리를 만드는 학생
웨비나, 팟캐스트, 업계 인사이트를 챙겨 보는 직장인
그냥 스크롤하는 게 아니라 배우려고 보는 모든 분

⚡ 사용 방법
BrainTube를 설치하세요 (10초면 끝나요)
YouTube나 아무 웹사이트를 둘러보세요
🧠 아이콘을 누르면 콘텐츠 옆에 사이드 패널이 열려요
저장을 누르면 AI가 요약, 스크립트, 핵심 내용을 만들어요
하이라이트, 메모, 검색, 채팅을 모두 사이드 패널에서 할 수 있어요
새 탭도, 복사·붙여 넣기도, 화면 전환도 필요 없어요.

🔒 BrainTube가 읽는 것과 보내는 곳
페이지·영상 저장: 저장, URL 저장, 북마크를 누를 때만 그 탭의 주소와 화면에 보이는 텍스트를 BrainTube 서버로 보내요. 서버가 내용을 읽고 요약해요.
AI 대화 저장 (claude.ai, chatgpt.com): BrainTube 팝업에서 대화 저장을 누를 때만 그 대화 내용을 읽어 BrainTube 서버로 보내요. 요약은 Anthropic(Claude)이 해요. 자동으로 저장하는 일은 없어요.
YouTube 재생목록 동기화: 로그인한 동안 youtube.com에서 내 YouTube 재생목록에 영상을 추가하면, 그 재생목록 ID를 BrainTube로 보내 재생목록을 내 라이브러리로 가져와요. 이 동작은 백그라운드에서 일어나요.
AI 처리: 요약, 채팅, 검색에는 BrainTube를 대신해 콘텐츠를 처리하는 AI 서비스(Anthropic, OpenAI, Google Gemini)를 사용해요.
방문 기록을 저장하지 않아요: 위의 경우가 아니면 내가 방문한 페이지를 기록하거나 보내지 않아요.
광고가 없고 데이터를 판매하지 않아요. 저장한 데이터는 내 계정에만 보관돼요.
로그인 정보는 로그아웃할 때까지 이 컴퓨터에만 보관되고, 웹페이지는 읽을 수 없어요.
개인정보 처리방침: https://brain-tube.com/ko/privacy

🚀 시작하기
무료로 쓸 수 있어요. https://brain-tube.com/ko 에서 가입하고 확장 프로그램을 설치하세요.

정리된 나만의 지식 베이스가 클릭 한 번 거리에 있어요.
