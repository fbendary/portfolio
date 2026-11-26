// F5Bot: forwarded alert emails into inbox_items.
//
// Point an email-to-webhook service at /functions/v1/importers/f5bot?secret=… (or send the
// x-importer-secret header) and forward F5Bot's alert emails to it. The body can be the raw email
// text, JSON ({ "text": "…" }), or a form post with a "body-plain" or "text" field. You can also
// paste alerts straight into the dashboard (Inbox → Paste alerts), which needs none of this.

import type { Importer, InboxRow } from '../_shared/importer.ts';
import { parseAlerts } from '../_shared/parse.ts';

export const f5bot: Importer = {
  key: 'f5bot',
  needs: [],

  async fetch({ db, req, body, settings }) {
    const text = emailText(req.headers.get('content-type') ?? '', body);
    const alerts = parseAlerts(text);
    if (!alerts.length) return { inbox_items: [], meta: { found: 0, note: 'No Reddit, Hacker News or Lobsters links in the body.' } };

    // The flow comes from the saved search whose phrase matches the alert's keyword.
    const [{ data: searches }, { data: places }] = await Promise.all([
      db.from('saved_searches').select('flow_key,label,query'),
      db.from('places').select('id,flow_key,name'),
    ]);
    const fallback = typeof settings.default_flow === 'string' ? settings.default_flow : null;
    const flowFor = (keyword: string) => {
      if (!keyword) return fallback;
      const k = keyword.toLowerCase();
      const hit = (searches ?? []).find((x) => String(x.query || '').toLowerCase().replace(/["“”]/g, '').includes(k) || String(x.label).toLowerCase().includes(k));
      return hit?.flow_key ?? fallback;
    };
    const inbox_items: InboxRow[] = alerts.map((a) => {
      const flow_key = flowFor(a.keyword);
      const place = a.placeName ? (places ?? []).find((p) => p.flow_key === flow_key && p.name.toLowerCase() === a.placeName.toLowerCase()) : null;
      return { url: a.url, title: a.title, snippet: a.keyword ? `Keyword: ${a.keyword}` : '', flow_key, channel_key: a.channel, place_id: place?.id ?? null, source: 'f5bot' };
    });
    return { inbox_items, meta: { found: alerts.length } };
  },
};

function emailText(contentType: string, body: string): string {
  if (contentType.includes('application/json')) {
    try {
      const j = JSON.parse(body);
      return String(j.text ?? j['body-plain'] ?? j.plain ?? j.body ?? '');
    } catch { return body; }
  }
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const f = new URLSearchParams(body);
    return f.get('body-plain') ?? f.get('stripped-text') ?? f.get('text') ?? '';
  }
  return body;
}
