// Bluesky: new posts matching each flow's phrases, through Bluesky's public AppView search
// (api.bsky.app, no account needed). Phrases live in settings → importers → bluesky → queries.

import type { Importer, InboxRow } from '../_shared/importer.ts';
import { clearOld, queriesByFlow, sinceLast } from '../_shared/importer.ts';

type Post = { uri: string; author: { handle: string }; record: { text?: string; createdAt?: string; reply?: unknown }; likeCount?: number; indexedAt: string };

export const bluesky: Importer = {
  key: 'bluesky',
  needs: [],
  async fetch({ db, settings }) {
    const since = new Date((await sinceLast(db, 'bluesky')) * 1000).toISOString();
    const items = new Map<string, InboxRow>();
    let calls = 0;
    for (const [flow, phrases] of queriesByFlow(settings)) {
      for (const phrase of phrases) {
        const p = new URLSearchParams({ q: phrase, sort: 'latest', since, limit: '50', lang: 'en' });
        calls++;
        const res = await fetch(`https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?${p}`, { headers: { 'User-Agent': 'lead-desk/1' } });
        if (!res.ok) throw new Error(`Bluesky search ${res.status}`);
        for (const x of ((await res.json()).posts ?? []) as Post[]) {
          const rkey = x.uri.split('/').pop();
          const url = `https://bsky.app/profile/${x.author.handle}/post/${rkey}`;
          if (items.has(url)) continue;
          const text = (x.record.text ?? '').replace(/\s+/g, ' ').trim();
          items.set(url, {
            url, kind: x.record.reply ? 'comment' : 'post', author: x.author.handle, title: text.slice(0, 120), snippet: text.slice(0, 600),
            found_at: x.record.createdAt ?? x.indexedAt, score: x.likeCount ?? null, flow_key: flow, channel_key: 'bluesky', source: 'bluesky_api',
          });
        }
      }
    }
    const cleared = await clearOld(db, 'bluesky_api');
    return { inbox_items: [...items.values()], meta: { requests: calls, found: items.size, cleared, since } };
  },
};
