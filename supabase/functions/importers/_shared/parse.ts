// Pure parsing helpers, the server-side twins of admin/js/parse.js (keep them in step).
// No Deno APIs here, so they can be tested anywhere.

const TRACKING = /^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$|ref_source$|share_id$|rdt$|context$|trk$|trackingId$|si$|igshid$|s$|t$)/i;

// One canonical form per thread, the same as the dashboard's, so duplicates are caught.
export function normalizeUrl(raw: string): string | null {
  let u: URL;
  try { u = new URL(String(raw).trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  if (/(^|\.)reddit\.com$/.test(u.hostname)) u.hostname = 'www.reddit.com';
  if (u.hostname === 'm.facebook.com' || u.hostname === 'mbasic.facebook.com') u.hostname = 'www.facebook.com';
  if (u.hostname === 'twitter.com' || u.hostname === 'mobile.twitter.com') u.hostname = 'x.com';
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  let out = u.toString();
  if (u.pathname.length > 1 && out.endsWith('/') && !u.search) out = out.slice(0, -1);
  return out;
}

export type Alert = { url: string; title: string; keyword: string; channel: string; placeName: string };

function host(u: string): string { try { return new URL(u).hostname; } catch { return ''; } }

// Every Reddit, Hacker News or Lobsters link in alert emails, with a title and the matched keyword.
export function parseAlerts(text: string): Alert[] {
  const lines = String(text || '').split(/\r?\n/);
  const out = new Map<string, Alert>();
  let keyword = '';
  const urlRe = /https?:\/\/[^\s<>"'()\]]+/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const kw = line.match(/keyword[s]?\s*[:\-–]?\s*["“'‘]([^"”'’]+)["”'’]/i) || line.match(/\bfor\s+["“'‘]([^"”'’]+)["”'’]/i);
    if (kw) keyword = kw[1].trim();
    for (const found of line.match(urlRe) || []) {
      let real = found.replace(/[.,;:!?]+$/, '');
      try {
        const x = new URL(real);
        for (const v of x.searchParams.values()) if (/^https?:\/\//i.test(v)) { real = v; break; }
      } catch { continue; }
      if (!/(^|\.)(reddit\.com|redd\.it|news\.ycombinator\.com|lobste\.rs)$/i.test(host(real))) continue;
      const url = normalizeUrl(real);
      if (!url || out.has(url)) continue;
      let title = line.replace(found, '').replace(/[<>[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!title || /^(link|view|open|comments?)$/i.test(title)) {
        for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
          const prev = lines[j].trim();
          if (prev && !/https?:\/\//i.test(prev) && !/keyword/i.test(prev)) { title = prev; break; }
        }
      }
      const m = new URL(url).pathname.match(/^\/r\/([^/]+)/i);
      const isReddit = /reddit\.com|redd\.it/i.test(host(url));
      out.set(url, { url, title: title.slice(0, 300), keyword, channel: isReddit ? 'reddit_comment' : 'forums', placeName: m ? `r/${m[1]}` : '' });
    }
  }
  return [...out.values()];
}

export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  text = String(text || '').replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQ = false;
  for (const ch of first) { if (ch === '"') inQ = !inQ; else if (!inQ && ch in counts) counts[ch]++; }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const delim = best[1] ? best[0] : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  const [header = [], ...body] = rows;
  return { header: header.map((x) => x.trim()), rows: body };
}

export function toNumber(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).trim().replace(/[\s,]/g, '').replace(/%$/, '');
  if (!s || s === '-' || s === '–') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function toDay(v: unknown, dayFirst = false): string | null {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/);
  if (m) {
    let a = +m[1], b = +m[2];
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    if (dayFirst || a > 12) [a, b] = [b, a];
    return iso(y, a, b);
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) { const d = new Date(t); return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); }
  return null;
}

function iso(y: number, m: number, d: number): string | null {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Turns a saved Reddit search link into the matching OAuth API path, or null if it isn't one.
//   https://www.reddit.com/search/?q=…&sort=new&t=week          → /search?q=…
//   https://www.reddit.com/r/a+b/search/?q=…&restrict_sr=1      → /r/a+b/search?q=…&restrict_sr=1
//   https://www.reddit.com/r/a+b/new/                           → /r/a+b/new
export function redditApiPath(link: string, limit = 25): string | null {
  let u: URL;
  try { u = new URL(link); } catch { return null; }
  if (!/(^|\.)reddit\.com$/i.test(u.hostname)) return null;
  const p = u.pathname.replace(/\/+$/, '');
  const common = `limit=${limit}&raw_json=1`;
  let m = p.match(/^\/r\/([A-Za-z0-9_+]+)\/new$/);
  if (m) return `/r/${m[1]}/new?${common}`;
  const q = u.searchParams.get('q');
  if (!q) return null;
  const params = new URLSearchParams({ q, sort: u.searchParams.get('sort') || 'new', t: u.searchParams.get('t') || 'week' });
  m = p.match(/^\/r\/([A-Za-z0-9_+]+)\/search$/);
  if (m) { params.set('restrict_sr', '1'); return `/r/${m[1]}/search?${params}&${common}`; }
  if (p === '/search') return `/search?${params}&type=link&${common}`;
  return null;
}
