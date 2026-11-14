// Screenshot / QA harness: a stand-in for the chrome.* APIs and the BrainTube backend, so the REAL popup.html
// and sidepanel.html render in a normal browser tab. Loaded before the page's module by serve.py.
// Query: ?s=<scenario>&lang=en|ko. Not part of the extension package (store/ is excluded from the zip).
(() => {
  const q = new URLSearchParams(location.search);
  const S = q.get('s') || 'free';
  const LANG = q.get('lang') === 'ko' ? 'ko' : 'en';
  const KO = LANG === 'ko';

  // ── i18n from the shipped messages.json ──────────────────────────────────────
  const xhr = new XMLHttpRequest();
  xhr.open('GET', `/_locales/${LANG}/messages.json`, false);
  xhr.send();
  const MSG = JSON.parse(xhr.responseText);
  function getMessage(key, subs) {
    const m = MSG[key];
    if (!m) return '';
    const arr = Array.isArray(subs) ? subs : subs == null ? [] : [subs];
    let text = m.message;
    if (m.placeholders) {
      for (const [name, ph] of Object.entries(m.placeholders)) {
        const idx = Number(String(ph.content).replace('$', '')) - 1;
        text = text.split(`$${name.toUpperCase()}$`).join(arr[idx] ?? '');
      }
    }
    return text;
  }

  // ── storage ──────────────────────────────────────────────────────────────────
  const listeners = [];
  const area = (init = {}) => {
    const data = { ...init };
    return {
      async get(keys) {
        if (keys == null) return { ...data };
        const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
        const out = {};
        for (const k of list) if (k in data) out[k] = data[k];
        return out;
      },
      async set(obj) { Object.assign(data, obj); },
      async remove(keys) { for (const k of [].concat(keys)) delete data[k]; },
    };
  };
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
  const fakeJwt = `x.${btoa(JSON.stringify({ exp }))}.y`;
  const session = { access_token: fakeJwt, refresh_token: 'r', expires_at: exp, user: { id: 'u1', email: KO ? 'minji@example.com' : 'alex@example.com' } };
  const saveCount = S.endsWith('nudge') ? 4 : 12;
  const local = area({ bt_session: session, session, bt_save_count: saveCount, bt_save_nudge_shown_at: saveCount >= 5 ? 5 : 0 });

  // ── tabs ─────────────────────────────────────────────────────────────────────
  const VIDEO = KO
    ? { id: 'Kq3mPz8Lr2Q', title: '장기 기억은 어떻게 만들어질까? 신경과학자가 설명하는 기억의 원리' }
    : { id: 'Kq3mPz8Lr2Q', title: 'How long-term memories form: a neuroscientist explains' };
  const tab = S.startsWith('web')
    ? { id: 7, url: 'https://example.com/blog/spaced-repetition-guide', title: 'A practical guide to spaced repetition' }
    : { id: 7, url: `https://www.youtube.com/watch?v=${VIDEO.id}`, title: `${VIDEO.title} - YouTube` };
  window.__opened = [];

  globalThis.chrome = {
    i18n: { getMessage },
    storage: { local, session: area(), onChanged: { addListener: (f) => listeners.push(f) } },
    tabs: {
      query: (_q, cb) => { const r = [tab]; if (cb) cb(r); return Promise.resolve(r); },
      create: ({ url }) => { window.__opened.push(url); console.log('[mock] open', url); },
      sendMessage: () => {},
    },
    runtime: { sendMessage: async () => ({ ok: true, title: 'Conversation' }), lastError: null },
    sidePanel: { open: async () => {} },
    scripting: { executeScript: async () => [{ result: { title: tab.title, text: '' } }] },
    identity: { getRedirectURL: () => 'https://x.chromiumapp.org/' },
  };

  // ── backend ──────────────────────────────────────────────────────────────────
  const PLANS = {
    free:   { sub: { subscribed: false, plan: 'free' }, credits: { balance: 24, monthly_allowance: 30 } },
    nudge:  { sub: { subscribed: false, plan: 'free' }, credits: { balance: 22, monthly_allowance: 30 } },
    low:    { sub: { subscribed: false, plan: 'free' }, credits: { balance: 3, monthly_allowance: 30 } },
    limit:  { sub: { subscribed: false, plan: 'free' }, credits: { balance: 0, monthly_allowance: 30 } },
    trial:  { sub: { subscribed: false, plan: 'pro', reverse_trial: true, pro_trial_until: new Date(Date.now() + 9 * 864e5).toISOString() }, credits: { balance: 940, monthly_allowance: 1000 } },
    pro:    { sub: { subscribed: true, plan: 'pro' }, credits: { balance: 812, monthly_allowance: 1000 } },
  };
  const plan = PLANS[S.replace(/^(yt|web|sp)-/, '')] || PLANS[S] || PLANS.free;
  const saved = /saved|sp-|chat|summary|bookmarks/.test(S);

  const ITEM = {
    id: 'item1', video_id: VIDEO.id, title: VIDEO.title, status: 'indexed',
    summary: KO
      ? '장기 기억은 해마에서 처음 만들어진 뒤, 잠자는 동안 반복 재생되며 대뇌 피질로 옮겨져 안정화돼요. 간격을 두고 다시 떠올리는 연습이 이 과정을 가장 확실하게 강화해요.'
      : 'New memories are first encoded in the hippocampus, then replayed during sleep and gradually consolidated into the cortex. Retrieval practice spread out over days strengthens that consolidation more than re-reading.',
    key_takeaways: KO
      ? ['해마는 새 기억의 임시 저장소예요', '수면 중 재생이 기억을 피질로 옮겨요', '간격 반복이 다시 읽기보다 효과적이에요']
      : ['The hippocampus holds new memories first', 'Sleep replay moves them into the cortex', 'Spaced retrieval beats re-reading'],
  };
  const SEGS = (KO
    ? ['오늘은 기억이 어떻게 만들어지는지 이야기해 볼게요.', '새로운 경험은 먼저 해마에 저장돼요.', '잠자는 동안 해마는 그 경험을 다시 재생해요.', '그래서 다음 날 다시 떠올리는 연습이 중요해요.']
    : ["Today we're looking at how a memory actually forms.", 'A new experience is first stored by the hippocampus.', 'During sleep, the hippocampus replays that experience.', "That's why testing yourself the next day matters so much."]
  ).map((text, i) => ({ id: `s${i}`, start_time_sec: 12 + i * 41, text }));
  const BOOKMARKS = (KO
    ? [['간격 반복 실전 가이드', 'example.com', ['학습']], ['수면과 기억 공고화에 관한 최신 연구', 'example.org', ['연구', '수면']], ['딥 워크를 위한 하루 루틴', 'example.net', []]]
    : [['A practical guide to spaced repetition', 'example.com', ['learning']], ['New research on sleep and memory consolidation', 'example.org', ['research', 'sleep']], ['A daily routine for deep work', 'example.net', []]]
  ).map(([title, host, tags], i) => ({ id: `b${i}`, title, source_url: `https://${host}/post-${i}`, source_type: 'web', tags, is_read: false, bookmarked_at: new Date(Date.now() - (i * 5 + 1) * 3600e3).toISOString() }));
  const ANSWER = KO
    ? '영상에서는 **잠자는 동안의 재생**이 핵심이라고 설명해요. 해마가 낮에 저장한 경험을 다시 재생하면서 대뇌 피질과의 연결이 강해지고, 그래서 다음 날 스스로 떠올려 보는 연습(3:15)이 다시 읽기보다 효과적이에요.'
    : 'The video says the key step is **replay during sleep**: the hippocampus replays what you stored during the day, which strengthens the links into the cortex. That is why testing yourself the next day (3:15) works better than re-reading.';

  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = String(input?.url || input);
    if (!url.includes('supabase.co')) return realFetch(input, init);
    const path = new URL(url).pathname;
    await new Promise((r) => setTimeout(r, 30));
    if (path.endsWith('/check-subscription')) return json(plan.sub);
    if (path.endsWith('/check-credits')) return json(plan.credits);
    if (path.endsWith('/track')) return json({ ok: true });
    if (path.endsWith('/process-youtube') || path.endsWith('/process-content')) {
      return S.includes('ratelimit') ? json({ error: 'Too many requests' }, 429) : json({ itemId: 'new1' });
    }
    if (path.endsWith('/ask-item-ai') || path.endsWith('/ai-router')) {
      if (S.includes('limit')) return json({ error: 'Insufficient credits', required: 2, balance: 0 }, 402);
      return json({ answer: ANSWER });
    }
    if (path.includes('/rest/v1/items')) {
      if (url.includes('is_bookmark=eq.true')) return json(BOOKMARKS);
      if (url.includes('video_id=eq.')) return json(saved ? [ITEM] : []);
      return json([]);
    }
    if (path.includes('/transcript_segments')) return json(SEGS);
    if (path.includes('/highlights')) return json([]);
    return json({});
  };
  window.__mock = { S, LANG, VIDEO };
})();
