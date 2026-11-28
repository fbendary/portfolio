// Hacker News: new stories and comments matching each flow's phrases, through the free HN Search
// API (hn.algolia.com, no key). Phrases live in settings → importers → hn → queries.

import type { Importer, InboxRow } from '../_shared/importer.ts';
import { clearOld, plain, queriesByFlow, sinceLast } from '../_shared/importer.ts';

type Hit = { objectID: string; created_at_i: number; author: string; title?: string; story_title?: string; story_text?: string; comment_text?: string; points?: number; _tags: string[] };

export const hn: Importer = {
  key: 'hn',
  needs: [],
  async fetch({ db, settings }) {
    const since = Math.floor(await sinceLast(db, 'hn'));
    const items = new Map<string, InboxRow>();
    let calls = 0;
    for (const [flow, phrases] of queriesByFlow(settings)) {
      for (const phrase of phrases) {
        const p = new URLSearchParams({ query: phrase, tags: '(story,comment)', numericFilters: `created_at_i>${since}`, hitsPerPage: '50' });
        calls++;
        const res = await fetch(`https://hn.algolia.com/api/v1/search_by_date?${p}`);
        if (!res.ok) throw new Error(`HN search ${res.status}`);
        for (const x of ((await res.json()).hits ?? []) as Hit[]) {
          const url = `https://news.ycombinator.com/item?id=${x.objectID}`;
          if (items.has(url)) continue;
          const isComment = x._tags.includes('comment');
          items.set(url, {
            url, kind: isComment ? 'comment' : 'post', author: x.author, title: (x.title || x.story_title || '').slice(0, 300),
            snippet: plain(isComment ? x.comment_text ?? '' : x.story_text ?? ''), found_at: new Date(x.created_at_i * 1000).toISOString(),
            score: x.points ?? null, flow_key: flow, channel_key: 'forums', source: 'hn_api',
          });
        }
      }
    }
    const cleared = await clearOld(db, 'hn_api');
    return { inbox_items: [...items.values()], meta: { requests: calls, found: items.size, cleared, since: new Date(since * 1000).toISOString() } };
  },
};
