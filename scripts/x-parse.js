// BrainTube - turns the JSON that x.com's own Bookmarks timeline returns into plain posts.
// Classic script (no import/export): loaded in the page's MAIN world before x-hook.js, and by the
// node test through vm. Pure: no DOM, no chrome.*, no network.
(function (root) {
  const unwrap = (r) => (r && r.__typename === 'TweetWithVisibilityResults' ? r.tweet : r);

  const authorOf = (t) => {
    const u = t?.core?.user_results?.result;
    return {
      handle: u?.core?.screen_name || u?.legacy?.screen_name || null,
      name: u?.core?.name || u?.legacy?.name || null,
    };
  };

  // Long posts carry their full text in note_tweet; legacy.full_text is cut at ~280 characters.
  const textOf = (t) => {
    const note = t?.note_tweet?.note_tweet_results?.result?.text;
    let text = note || t?.legacy?.full_text || '';
    // Expand t.co links to where they point.
    const urls = [...(t?.legacy?.entities?.urls || []), ...(t?.note_tweet?.note_tweet_results?.result?.entity_set?.urls || [])];
    for (const u of urls) if (u.url && u.expanded_url) text = text.split(u.url).join(u.expanded_url);
    // Drop the trailing t.co link X adds for attached media.
    for (const m of t?.legacy?.extended_entities?.media || t?.legacy?.entities?.media || []) {
      if (m.url) text = text.split(m.url).join('').trim();
    }
    return text.trim();
  };

  function toPost(raw) {
    const t = unwrap(raw);
    if (!t || !t.rest_id || !t.legacy) return null;
    const author = authorOf(t);
    const quoted = unwrap(t.quoted_status_result?.result);
    const links = [...new Set((t.legacy.entities?.urls || []).map((u) => u.expanded_url).filter(Boolean))];
    const media = (t.legacy.extended_entities?.media || []).map((m) => m.type);
    return {
      id: t.rest_id,
      url: `https://x.com/${author.handle || 'i/web'}/status/${t.rest_id}`,
      author: author.handle,
      authorName: author.name,
      createdAt: t.legacy.created_at ? new Date(t.legacy.created_at).toISOString() : null,
      text: textOf(t),
      links,
      media,
      card: t.card?.legacy?.binding_values?.find?.((b) => b.key === 'title')?.value?.string_value || null,
      quoted: quoted?.rest_id
        ? { author: authorOf(quoted).handle, text: textOf(quoted), url: `https://x.com/${authorOf(quoted).handle || 'i/web'}/status/${quoted.rest_id}` }
        : null,
    };
  }

  // Every post found anywhere in a Bookmarks / BookmarkFolderTimeline response, in page order, no repeats.
  function parseXTimeline(json) {
    const out = [];
    const seen = new Set();
    const walk = (o, depth) => {
      if (!o || typeof o !== 'object' || depth > 40) return;
      if (Array.isArray(o)) { for (const x of o) walk(x, depth + 1); return; }
      // Promoted entries are ads, not bookmarks.
      if (o.itemContent?.promotedMetadata) return;
      if (o.tweet_results?.result) {
        const p = toPost(o.tweet_results.result);
        if (p && !seen.has(p.id)) { seen.add(p.id); out.push(p); }
        return; // the quoted post is read inside toPost, not as a bookmark of its own
      }
      for (const k in o) walk(o[k], depth + 1);
    };
    walk(json, 0);
    return out;
  }

  // The text BrainTube saves for a post: who, when, the post, links and the quoted post.
  function postText(p) {
    const parts = [];
    const date = p.createdAt ? p.createdAt.slice(0, 10) : '';
    parts.push(`${p.authorName ? `${p.authorName} ` : ''}(@${p.author || 'unknown'}) on X${date ? `, ${date}` : ''}:`);
    if (p.text) parts.push(p.text);
    if (p.card) parts.push(`Link preview: ${p.card}`);
    if (p.links.length) parts.push(`Links:\n${p.links.join('\n')}`);
    if (p.quoted) parts.push(`Quoting @${p.quoted.author || 'unknown'} (${p.quoted.url}):\n${p.quoted.text}`);
    if (p.media.length) parts.push(`Attached: ${p.media.join(', ')}`);
    return parts.join('\n\n');
  }

  function postTitle(p) {
    const first = (p.text || p.quoted?.text || 'Post').split('\n').find((l) => l.trim()) || 'Post';
    return `@${p.author || 'unknown'} on X: ${first.trim().slice(0, 110)}`;
  }

  root.btX = { parseXTimeline, postText, postTitle };
})(typeof globalThis !== 'undefined' ? globalThis : this);
