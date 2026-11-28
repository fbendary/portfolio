// Stack Exchange: new questions on chosen sites (optionally one tag), through the official API
// (no key: 300 requests a day per IP, about 3 an hour here). Sites live in
// settings → importers → stackexchange → queries as { flow: ["workplace", "webapps:google-sheets"] }.
// Content is CC BY-SA: replies are yours, but quote with attribution.

import type { Importer, InboxRow } from '../_shared/importer.ts';
import { clearOld, plain, queriesByFlow, sinceLast } from '../_shared/importer.ts';

type Q = { question_id: number; link: string; title: string; body?: string; creation_date: number; score: number; owner?: { display_name?: string } };

export const stackexchange: Importer = {
  key: 'stackexchange',
  needs: [],
  async fetch({ db, settings }) {
    const since = Math.floor(await sinceLast(db, 'stackexchange'));
    const items = new Map<string, InboxRow>();
    let quota: number | null = null, calls = 0;
    for (const [flow, sites] of queriesByFlow(settings)) {
      for (const entry of sites) {
        const [site, tag] = entry.split(':');
        const p = new URLSearchParams({ order: 'desc', sort: 'creation', site, fromdate: String(since), pagesize: '50', filter: 'withbody' });
        if (tag) p.set('tagged', tag);
        calls++;
        const res = await fetch(`https://api.stackexchange.com/2.3/questions?${p}`);
        const json = await res.json();
        if (json.error_message) throw new Error(`Stack Exchange: ${json.error_message}`);
        quota = json.quota_remaining ?? quota;
        for (const x of (json.items ?? []) as Q[]) {
          const url = x.link;
          if (items.has(url)) continue;
          items.set(url, {
            url, kind: 'post', author: plain(x.owner?.display_name ?? '', 80), title: plain(x.title, 300), snippet: plain(x.body ?? ''),
            found_at: new Date(x.creation_date * 1000).toISOString(), score: x.score, flow_key: flow, channel_key: 'forums', source: 'stackexchange_api',
          });
        }
        if (json.backoff) await new Promise((r) => setTimeout(r, Number(json.backoff) * 1000));
      }
    }
    const cleared = await clearOld(db, 'stackexchange_api');
    return { inbox_items: [...items.values()], meta: { requests: calls, quota_remaining: quota, found: items.size, cleared } };
  },
};
