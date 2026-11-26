// Pure helpers: tidy and read URLs, parse pasted F5Bot alerts, parse CSV.

const TRACKING = /^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$|ref_source$|share_id$|rdt$|context$|trk$|trackingId$|si$|igshid$|s$|t$)/i;

// One canonical form per thread, so the same link isn't added twice.
export function normalizeUrl(raw) {
  let u;
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

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
function slugTitle(slug) {
  try { slug = decodeURIComponent(slug); } catch { /* keep as is */ }
  return cap(slug.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim());
}

// Guess the channel, place and a title from a pasted link.
export function guessFromUrl(raw) {
  const url = normalizeUrl(raw);
  if (!url) return null;
  const u = new URL(url);
  const host = u.hostname.replace(/^www\./, '');
  const path = u.pathname;
  let channel = null, placeName = '', title = '';
  if (host === 'reddit.com' || host === 'redd.it') {
    const m = path.match(/^\/r\/([^/]+)(?:\/comments\/[^/]+\/([^/]+))?/i);
    channel = 'reddit_comment';
    if (m) { placeName = `r/${m[1]}`; if (m[2]) title = slugTitle(m[2]); }
  } else if (host === 'facebook.com' || host === 'fb.com') {
    channel = /\/groups\//.test(path) ? 'fb_group_comment' : 'fb_dm';
  } else if (host === 'linkedin.com') {
    if (/^\/in\//.test(path)) channel = 'li_connect';
    else {
      channel = 'li_comment';
      const m = path.match(/^\/posts\/[^_]+_(.+?)-(?:activity|ugcPost|share)-/);
      if (m) title = slugTitle(m[1]);
      const tag = path.match(/^\/feed\/hashtag\/([^/]+)/);
      if (tag) placeName = `#${tag[1]}`;
    }
  } else if (host === 'upwork.com') {
    channel = 'upwork';
    const m = path.match(/\/(?:jobs|freelance-jobs\/apply)\/([^/]+?)_~/);
    if (m) title = slugTitle(m[1]);
  } else if (host === 'quora.com') {
    channel = 'forums';
    const seg = path.split('/').filter(Boolean)[0];
    if (seg && !/^(profile|topic|q)$/i.test(seg)) title = slugTitle(seg);
  } else if (host === 'news.ycombinator.com' || host === 'lobste.rs') {
    channel = 'forums';
  } else if (host === 'indiehackers.com') {
    channel = 'indie_hackers';
    const m = path.match(/\/post\/([^/]+)/);
    if (m) title = slugTitle(m[1].replace(/-[0-9a-f]{6,}$/i, ''));
  } else if (host === 'producthunt.com') {
    channel = 'product_hunt';
  } else if (host === 'x.com') {
    channel = 'x';
  } else if (host === 'instagram.com') {
    channel = 'instagram';
  } else if (host === 'discord.com' || host === 'discord.gg' || host.endsWith('slack.com')) {
    channel = 'chat_groups';
  }
  return { url, host, channel, placeName, title };
}

// Pull every Reddit, Hacker News or Lobsters link out of pasted alert emails (F5Bot or similar),
// with the nearest line of text as its title and the keyword it matched, when the email says.
export function parseAlerts(text) {
  const lines = String(text || '').split(/\r?\n/);
  const out = new Map();
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
        // Unwrap tracking redirects that carry the real link in a parameter.
        for (const v of x.searchParams.values()) if (/^https?:\/\//i.test(v)) { real = v; break; }
      } catch { continue; }
      if (!/(^|\.)(reddit\.com|redd\.it|news\.ycombinator\.com|lobste\.rs)$/i.test(safeHost(real))) continue;
      const url = normalizeUrl(real);
      if (!url || out.has(url)) continue;
      let title = line.replace(found, '').replace(/[<>[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!title || /^(link|view|open|comments?)$/i.test(title)) {
        for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
          const prev = lines[j].trim();
          if (prev && !/https?:\/\//i.test(prev) && !/keyword/i.test(prev)) { title = prev; break; }
        }
      }
      const guess = guessFromUrl(url) || {};
      out.set(url, { url, title: (title || guess.title || '').slice(0, 300), keyword, channel: guess.channel || 'forums', placeName: guess.placeName || '' });
    }
  }
  return [...out.values()];
}

function safeHost(u) { try { return new URL(u).hostname; } catch { return ''; } }

// RFC 4180-style CSV with quoted fields; the delimiter (comma, semicolon or tab) is detected.
export function parseCsv(text) {
  text = String(text || '').replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let inQ = false;
  for (const ch of first) { if (ch === '"') inQ = !inQ; else if (!inQ && ch in counts) counts[ch]++; }
  const delim = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] : ',';
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
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

// "1,234" → 1234, "12.5%" → 12.5, "" → null
export function toNumber(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(/[\s,]/g, '').replace(/%$/, '');
  if (!s || s === '-' || s === '–') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Dates as exported: 2026-11-24, 11/24/2026 (month first) or 24/11/2026 (day first), Nov 24, 2026.
export function toDay(v, dayFirst = false) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/);
  if (m) {
    let a = +m[1], b = +m[2]; const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    if (dayFirst || a > 12) [a, b] = [b, a];
    return iso(y, a, b);
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) { const d = new Date(t); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
  return null;
}
function iso(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
