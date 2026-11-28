// Reddit: every new post and comment in the subreddits under Sources → Places (any flow, any Reddit
// channel, unless the place is marked banned or avoid), plus your saved Reddit searches, into the
// review queue (inbox_items, source reddit_api). If REDDIT_USERNAME and REDDIT_PASSWORD are set too,
// it also records your karma (reddit.karma).
//
// Uses a Reddit app's client ID and secret (app-only, read-only access). Reddit approves Data API
// access case by case, and commercial use needs its own agreement: read
// supabase/functions/importers/README.md first.

import type { Importer, InboxRow, MetricRow } from '../_shared/importer.ts';
import { mondayOf } from '../_shared/importer.ts';
import { normalizeUrl, redditApiPath } from '../_shared/parse.ts';

type Thing = {
  kind: string;
  data: {
    name: string; permalink: string; created_utc: number; score: number; subreddit: string; author?: string;
    title?: string; selftext?: string; over_18?: boolean; body?: string; link_title?: string; stickied?: boolean;
  };
};

const MAX_PAGES = 10;          // per flow and kind: up to 1,000 items an hour
const OVERLAP_S = 10 * 60;     // re-read the last 10 minutes so nothing falls between runs
const KEEP_DAYS = 7;           // collected items nobody acted on are cleared after this

export const reddit: Importer = {
  key: 'reddit',
  needs: ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'REDDIT_USER_AGENT'],

  async fetch({ db, env }) {
    const ua = env('REDDIT_USER_AGENT')!; // e.g. "web:lead-desk:v1 (by /u/yourname)"
    const withUser = !!(env('REDDIT_USERNAME') && env('REDDIT_PASSWORD'));
    const token = await getToken(env, ua, withUser);
    let calls = 0;
    const api = async (path: string) => {
      calls++;
      const res = await fetch(`https://oauth.reddit.com${path}`, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': ua } });
      if (res.status === 429) throw new Error('Reddit rate limit reached; the next run will catch up.');
      if (!res.ok) throw new Error(`Reddit ${res.status} on ${path.split('?')[0]}`);
      if (Number(res.headers.get('x-ratelimit-remaining') ?? '100') < 5) await new Promise((r) => setTimeout(r, 3000));
      return res.json();
    };

    // Since when: the last good run, minus a little overlap; an hour on the first run.
    const { data: last } = await db.from('import_runs').select('started_at').eq('importer', 'reddit').eq('status', 'ok')
      .order('started_at', { ascending: false }).limit(1).maybeSingle();
    const since = (last ? Date.parse(last.started_at) / 1000 : Date.now() / 1000 - 3600) - OVERLAP_S;

    const [{ data: places, error: pErr }, { data: channels }] = await Promise.all([
      db.from('places').select('id,flow_key,channel_key,name,status'),
      db.from('channels').select('key,platform'),
    ]);
    if (pErr) throw pErr;
    const redditChannels = new Set((channels ?? []).filter((c) => c.platform === 'reddit').map((c) => c.key));
    const subsByFlow = new Map<string, Map<string, string>>(); // flow → lower-case sub → place id
    for (const p of places ?? []) {
      const m = /^r\/([A-Za-z0-9_]{2,21})$/.exec(p.name.trim());
      if (!m || !redditChannels.has(p.channel_key) || p.status === 'banned' || p.status === 'avoid') continue;
      if (!subsByFlow.has(p.flow_key)) subsByFlow.set(p.flow_key, new Map());
      subsByFlow.get(p.flow_key)!.set(m[1].toLowerCase(), p.id);
    }

    const items = new Map<string, InboxRow & { kind: string; author: string }>();
    const add = (t: Thing, flow: string, placeId: string | null, searchId: string | null) => {
      const d = t.data;
      if (!d?.permalink || d.over_18 || d.stickied || d.created_utc < since) return;
      if (d.author === 'AutoModerator' || d.author === '[deleted]') return;
      const url = normalizeUrl(`https://www.reddit.com${d.permalink}`);
      if (!url || items.has(url)) return;
      const isComment = t.kind === 't1';
      const text = (isComment ? d.body : d.selftext) ?? '';
      items.set(url, {
        url, kind: isComment ? 'comment' : 'post', author: d.author ?? '',
        title: (isComment ? d.link_title : d.title ?? '')?.slice(0, 300) ?? '',
        snippet: text.replace(/\s+/g, ' ').trim().slice(0, 600),
        found_at: new Date(d.created_utc * 1000).toISOString(), score: d.score, flow_key: flow,
        channel_key: 'reddit_comment', place_id: placeId, saved_search_id: searchId, source: 'reddit_api',
      });
    };

    // 1. New posts and new comments, one multireddit per flow, page by page back to `since`.
    for (const [flow, subs] of subsByFlow) {
      const multi = [...subs.keys()].join('+');
      for (const listing of ['new', 'comments']) {
        let after = '';
        for (let page = 0; page < MAX_PAGES; page++) {
          const json = await api(`/r/${multi}/${listing}?limit=100&raw_json=1${after ? `&after=${after}` : ''}`);
          const children: Thing[] = json?.data?.children ?? [];
          for (const t of children) add(t, flow, subs.get(t.data.subreddit.toLowerCase()) ?? null, null);
          after = json?.data?.after ?? '';
          const oldest = children.length ? Math.min(...children.map((t) => t.data.created_utc)) : 0;
          if (!after || !children.length || oldest < since) break;
        }
      }
    }

    // 2. Saved searches whose link is on reddit.com.
    const { data: searches } = await db.from('saved_searches').select('id,flow_key,url').like('url', 'https://www.reddit.com/%');
    for (const s of searches ?? []) {
      const path = redditApiPath(s.url, 50);
      if (!path) continue;
      const json = await api(path);
      for (const t of (json?.data?.children ?? []) as Thing[]) add(t, s.flow_key, subsByFlow.get(s.flow_key)?.get(t.data.subreddit.toLowerCase()) ?? null, s.id);
      await db.from('saved_searches').update({ last_run_at: new Date().toISOString() }).eq('id', s.id);
    }

    // 3. Karma, if signed in as you.
    const metric_values: MetricRow[] = [];
    if (withUser) {
      const me = await api('/api/v1/me');
      metric_values.push({ metric_key: 'reddit.karma', period_start: mondayOf(), value: Number(me.total_karma ?? 0), source: 'reddit_api' });
    }

    // 4. Clear collected items nobody acted on after a week, so the table stays small.
    const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString();
    const { count: cleared } = await db.from('inbox_items').delete({ count: 'exact' })
      .eq('source', 'reddit_api').eq('status', 'new').or('queue.is.null,queue.eq.pass').lt('found_at', cutoff);

    const inbox_items = [...items.values()];
    return {
      inbox_items, metric_values,
      meta: { subreddits: [...subsByFlow.values()].reduce((a, m) => a + m.size, 0), requests: calls, found: inbox_items.length, cleared: cleared ?? 0, since: new Date(since * 1000).toISOString() },
    };
  },
};

// App-only (client credentials) by default; password grant when a username and password are set.
async function getToken(env: (n: string) => string | undefined, ua: string, withUser: boolean): Promise<string> {
  const body = withUser
    ? new URLSearchParams({ grant_type: 'password', username: env('REDDIT_USERNAME')!, password: env('REDDIT_PASSWORD')! })
    : new URLSearchParams({ grant_type: 'client_credentials' });
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${env('REDDIT_CLIENT_ID')}:${env('REDDIT_CLIENT_SECRET')}`)}`, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': ua },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) throw new Error(`Reddit sign-in failed (${res.status}${json.error ? `: ${json.error}` : ''}). Check the app's client ID and secret.`);
  return json.access_token;
}
