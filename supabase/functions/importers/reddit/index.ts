// Reddit: your karma into metric_values (reddit.karma), and new posts from the saved Reddit searches
// into inbox_items.
//
// Needs a Reddit "script" app for your own account, and access that Reddit has approved. Since
// November 2025 Reddit requires approval for Data API access under its Responsible Builder Policy,
// and commercial use needs its own agreement. Read supabase/functions/importers/README.md first.

import type { Importer, InboxRow, MetricRow } from '../_shared/importer.ts';
import { mondayOf } from '../_shared/importer.ts';
import { normalizeUrl, redditApiPath } from '../_shared/parse.ts';

type Child = { data: { permalink: string; title: string; selftext?: string; created_utc: number; score: number; subreddit: string; over_18?: boolean } };

export const reddit: Importer = {
  key: 'reddit',
  needs: ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'REDDIT_USERNAME', 'REDDIT_PASSWORD', 'REDDIT_USER_AGENT'],

  async fetch({ db, env }) {
    const ua = env('REDDIT_USER_AGENT')!; // e.g. "web:lead-desk:v1 (by /u/yourname)"
    const token = await getToken(env, ua);
    const api = async (path: string) => {
      const res = await fetch(`https://oauth.reddit.com${path}`, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': ua } });
      if (res.status === 429) throw new Error('Reddit rate limit reached; try again later.');
      if (!res.ok) throw new Error(`Reddit ${res.status} on ${path.split('?')[0]}`);
      const left = Number(res.headers.get('x-ratelimit-remaining') ?? '10');
      if (left < 2) await new Promise((r) => setTimeout(r, 2000));
      return res.json();
    };

    // 1. Karma
    const me = await api('/api/v1/me');
    const karma = Number(me.total_karma ?? (Number(me.link_karma || 0) + Number(me.comment_karma || 0)));
    const metric_values: MetricRow[] = [{ metric_key: 'reddit.karma', period_start: mondayOf(), value: karma, source: 'reddit_api' }];

    // 2. Saved Reddit searches → inbox (one request each, in order, newest first)
    const { data: searches, error } = await db.from('saved_searches').select('id,flow_key,channel_key,url').like('url', 'https://www.reddit.com/%');
    if (error) throw error;
    const { data: places } = await db.from('places').select('id,flow_key,name');
    const inbox_items: InboxRow[] = [];
    const weekAgo = Date.now() / 1000 - 8 * 86400;
    for (const s of searches ?? []) {
      const path = redditApiPath(s.url);
      if (!path) continue;
      const listing = await api(path);
      for (const c of (listing?.data?.children ?? []) as Child[]) {
        const d = c.data;
        if (!d?.permalink || d.over_18 || d.created_utc < weekAgo) continue;
        const url = normalizeUrl(`https://www.reddit.com${d.permalink}`);
        if (!url) continue;
        const place = (places ?? []).find((p) => p.flow_key === s.flow_key && p.name.toLowerCase() === `r/${d.subreddit}`.toLowerCase());
        inbox_items.push({
          url, title: d.title.slice(0, 300), snippet: (d.selftext ?? '').replace(/\s+/g, ' ').slice(0, 280),
          found_at: new Date(d.created_utc * 1000).toISOString(), score: d.score, flow_key: s.flow_key,
          channel_key: 'reddit_comment', place_id: place?.id ?? null, saved_search_id: s.id, source: 'reddit_api',
        });
      }
      await db.from('saved_searches').update({ last_run_at: new Date().toISOString() }).eq('id', s.id);
    }
    const unique = [...new Map(inbox_items.map((x) => [x.url, x])).values()];
    return { metric_values, inbox_items: unique, meta: { karma, searches: searches?.length ?? 0, found: unique.length } };
  },
};

// Script-app password grant: only works for the account that owns the app.
async function getToken(env: (n: string) => string | undefined, ua: string): Promise<string> {
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${env('REDDIT_CLIENT_ID')}:${env('REDDIT_CLIENT_SECRET')}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': ua,
    },
    body: new URLSearchParams({ grant_type: 'password', username: env('REDDIT_USERNAME')!, password: env('REDDIT_PASSWORD')! }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error(`Reddit sign-in failed (${res.status}${json.error ? `: ${json.error}` : ''}). Check the app’s credentials and that Reddit approved API access.`);
  return json.access_token;
}
