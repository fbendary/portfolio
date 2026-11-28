// Collect: prompts for Claude in Chrome, and the box its results come back into.
//   LinkedIn prospects (SkillX)  → Prospects (inbox_items, kind person)
//   Facebook groups (Carna)       → Sources → Places
//   Facebook posts (Carna)        → Queue (inbox_items, source fb_chrome)
// Criteria are saved in settings → collect. Claude in Chrome only reads; it never connects, joins,
// posts or messages during collection.
import { h, mount, toast, copyText, field, errorBox } from '../ui.js';
import { sb, q, refs, saveSetting, reload, explain, flowName } from '../db.js';
import { normalizeUrl } from '../parse.js';

const CHROME = 'Claude in Chrome';

export async function render(root, ctx) {
  const cfg = structuredClone(refs.settings.collect || {});
  const result = h('div');
  const paste = h('textarea', { rows: 8, placeholder: `${CHROME} pastes its results here (one JSON object per line), or paste them yourself` });
  mount(root,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Collect'),
      h('p', null, `Copy a prompt into ${CHROME}. It reads LinkedIn or Facebook in your logged-in browser, at a person’s pace, and pastes what it finds into the box below.`))),
    h('div', { class: 'stack' },
      h('div', { class: 'grid3' }, linkedinCard(), groupsCard(), postsCard()),
      h('section', { class: 'panel', id: 'results' },
        h('div', { class: 'panel-head' }, h('div', null, h('h2', null, 'Paste results'), h('p', null, 'Prospects go to Prospects, groups to Sources → Places, posts to the Queue. Duplicates are skipped.'))),
        h('div', { class: 'form' }, paste, h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn-ld primary', id: 'import-results', onclick: () => importResults(paste.value) }, 'Import')), result)),
      h('p', { class: 'note' }, 'LinkedIn and Facebook don’t allow automated reading in their terms. Keep sessions small and human-paced, and stop if either site shows a warning; the risk is to your own accounts.')));

  async function save() { try { await saveSetting('collect', cfg); } catch (e) { toast(e.message || explain(e), { error: true }); } }
  function listField(obj, key, label, hint) {
    const t = h('textarea', { rows: 3 }); t.value = (obj[key] || []).join('\n');
    t.addEventListener('change', () => { obj[key] = t.value.split('\n').map((s) => s.trim()).filter(Boolean); save(); });
    return field(label, t, hint);
  }
  function numField(obj, key, label) {
    const i = h('input', { type: 'number', min: 1, max: 500, value: obj[key] ?? '' });
    i.addEventListener('change', () => { obj[key] = Math.max(1, Number(i.value) || 1); save(); });
    return field(label, i);
  }
  function textField(obj, key, label) {
    const t = h('textarea', { rows: 3 }); t.value = obj[key] || '';
    t.addEventListener('change', () => { obj[key] = t.value.trim(); save(); });
    return field(label, t);
  }
  function copyBtn(label, make) { return h('button', { type: 'button', class: 'btn-ld primary', onclick: async () => {
    const ok = await copyText(make());
    toast(ok ? `Copied. Paste it into ${CHROME}.` : 'Couldn’t copy', { error: !ok });
  } }, label); }

  function linkedinCard() {
    const c = (cfg.linkedin ||= {});
    return h('section', { class: 'panel' },
      h('h2', null, 'LinkedIn prospects'),
      h('p', { class: 'small', style: { margin: '0 0 10px' } }, `${flowName(c.flow || 'skillx')}: HR, People and L&D heads at small and medium, non-tech companies in English-speaking countries. They arrive under Prospects.`),
      h('div', { class: 'form' },
        listField(c, 'titles', 'Job titles', 'One per line.'),
        listField(c, 'countries', 'Countries'),
        listField(c, 'sizes', 'Company sizes (LinkedIn bands)'),
        textField(c, 'exclude', 'Leave out'),
        numField(c, 'cap', 'People per session'),
        copyBtn('Copy prompt for Claude in Chrome', () => linkedinPrompt(c))));
  }
  function groupsCard() {
    const c = (cfg.facebook_groups ||= {});
    return h('section', { class: 'panel' },
      h('h2', null, 'Facebook groups'),
      h('p', { class: 'small', style: { margin: '0 0 10px' } }, `${flowName(c.flow || 'carna')}: groups where your audience gathers or talks about health. They arrive under Sources → Places, to join.`),
      h('div', { class: 'form' }, listField(c, 'terms', 'Search terms', 'Add your town to some, e.g. “moms Austin”.'), numField(c, 'cap', 'Groups per session'),
        copyBtn('Copy prompt for Claude in Chrome', () => groupsPrompt(c))));
  }
  function postsCard() {
    const c = (cfg.facebook_posts ||= {});
    const joined = refs.places.filter((p) => p.flow_key === (c.flow || 'carna') && p.channel_key === 'fb_group_comment' && ['joined', 'active'].includes(p.status));
    return h('section', { class: 'panel' },
      h('h2', null, 'Facebook posts'),
      h('p', { class: 'small', style: { margin: '0 0 10px' } }, `${flowName(c.flow || 'carna')}: recent posts asking for help or sharing a health struggle, from your ${joined.length} joined group${joined.length === 1 ? '' : 's'} (mark groups Joined under Sources → Places) and Facebook’s post search. They arrive in the Queue.`),
      h('div', { class: 'form' }, listField(c, 'terms', 'Search terms'), numField(c, 'days', 'Posts from the last … days'), numField(c, 'cap', 'Posts per session'),
        copyBtn('Copy prompt for Claude in Chrome', () => postsPrompt(c, joined))));
  }

  // ------------------------------------------------------------ import
  async function importResults(text) {
    const rows = parseLines(text);
    if (!rows.length) return toast('Nothing to import: expected one JSON object per line.', { error: true });
    const prospects = rows.filter((r) => r.type === 'prospect'), groups = rows.filter((r) => r.type === 'group'), posts = rows.filter((r) => r.type === 'post');
    const out = [];
    try {
      if (prospects.length) {
        const flow = (cfg.linkedin || {}).flow || 'skillx';
        const items = prospects.map((p) => ({ url: normalizeUrl(String(p.profile_url || '').replace(/\?.*$/, '')), p })).filter((x) => x.url && /linkedin\.com\/in\//.test(x.url)).map(({ url, p }) => ({
          url, kind: 'person', source: 'li_chrome', flow_key: flow, channel_key: 'li_connect',
          title: String(p.name || '').slice(0, 200), author: String(p.name || '').slice(0, 200), snippet: [p.title, p.signal].filter(Boolean).join(' · ').slice(0, 600),
          company: String(p.company || '').slice(0, 200), role: String(p.title || '').slice(0, 200), country: String(p.country || '').slice(0, 60),
          details: { company_size: p.company_size || '', industry: p.industry || '', company_url: p.company_url || '', signal: p.signal || '' },
        }));
        const added = items.length ? await q(sb.from('inbox_items').upsert(items, { onConflict: 'url', ignoreDuplicates: true }).select('id')) : [];
        out.push(`${added.length} new prospect${added.length === 1 ? '' : 's'}${items.length - added.length ? ` (${items.length - added.length} already here)` : ''}${prospects.length - items.length ? `, ${prospects.length - items.length} without a profile link` : ''}`);
      }
      if (groups.length) {
        const flow = (cfg.facebook_groups || {}).flow || 'carna';
        const known = new Set(refs.places.filter((p) => p.flow_key === flow && p.channel_key === 'fb_group_comment').map((p) => p.name.toLowerCase()));
        const fresh = groups.filter((g) => g.name && !known.has(String(g.name).toLowerCase()));
        const rowsIn = fresh.map((g) => ({
          flow_key: flow, channel_key: 'fb_group_comment', name: String(g.name).slice(0, 200), url: normalizeUrl(g.url || '') || '', status: 'to_join',
          members: Number(String(g.members || '').replace(/[^0-9.kKmM]/g, '').replace(/k$/i, 'e3').replace(/m$/i, 'e6')) || null,
          rules: String(g.promotion || '').slice(0, 500), notes: [g.privacy, g.activity, g.why].filter(Boolean).join(' · ').slice(0, 500),
        }));
        for (const r of rowsIn) if (r.members) r.members = Math.round(r.members);
        if (rowsIn.length) { await q(sb.from('places').upsert(rowsIn, { onConflict: 'flow_key,channel_key,name', ignoreDuplicates: true })); await reload('places'); }
        out.push(`${rowsIn.length} new group${rowsIn.length === 1 ? '' : 's'} in Places${groups.length - rowsIn.length ? ` (${groups.length - rowsIn.length} already there)` : ''}`);
      }
      if (posts.length) {
        const flow = (cfg.facebook_posts || {}).flow || 'carna';
        const places = refs.places.filter((p) => p.flow_key === flow && p.channel_key === 'fb_group_comment');
        const items = posts.map((p) => ({ url: normalizeUrl(p.url || ''), p })).filter((x) => x.url && /facebook\.com/.test(x.url)).map(({ url, p }) => ({
          url, kind: 'post', source: 'fb_chrome', flow_key: flow, channel_key: 'fb_group_comment',
          place_id: (places.find((pl) => pl.name.toLowerCase() === String(p.group || '').toLowerCase()) || {}).id || null,
          title: String(p.text || '').replace(/\s+/g, ' ').slice(0, 120), snippet: String(p.text || '').replace(/\s+/g, ' ').slice(0, 600),
          author: String(p.author || '').slice(0, 100), score: Number(p.reactions) || null,
          details: { group: p.group || '', posted: p.posted || '', comments: p.comments ?? null, why: p.why || '' },
        }));
        const added = items.length ? await q(sb.from('inbox_items').upsert(items, { onConflict: 'url', ignoreDuplicates: true }).select('id')) : [];
        out.push(`${added.length} new post${added.length === 1 ? '' : 's'} in the Queue${items.length - added.length ? ` (${items.length - added.length} already here)` : ''}`);
      }
      await q(sb.from('import_runs').insert({ importer: 'chrome', status: 'ok', finished_at: new Date().toISOString(), rows: rows.length, meta: { prospects: prospects.length, groups: groups.length, posts: posts.length } }));
      mount(result, h('p', { class: 'small' }, `Imported: ${out.join('; ')}.`),
        h('div', { class: 'toolbar' }, prospects.length ? h('a', { class: 'btn-ld small', href: '#/prospects' }, 'Open Prospects') : null,
          groups.length ? h('a', { class: 'btn-ld small', href: `#/sources?flow=${(cfg.facebook_groups || {}).flow || 'carna'}` }, 'Open Places') : null,
          posts.length ? h('a', { class: 'btn-ld small', href: '#/queue' }, 'Open Queue') : null));
      paste.value = '';
      toast(`Imported ${rows.length} line${rows.length === 1 ? '' : 's'}`);
      ctx.app.refreshCounts();
    } catch (e) { mount(result, errorBox(e.message || explain(e))); }
  }
}

// JSON objects, one per line (or a JSON array, or inside a code block).
export function parseLines(text) {
  const s = String(text || '').replace(/```(?:json)?/g, '').trim();
  if (s.startsWith('[')) { try { return JSON.parse(s).filter((x) => x && typeof x === 'object'); } catch { /* fall through */ } }
  const out = [];
  for (const line of s.split(/\r?\n/)) {
    const t = line.trim().replace(/,$/, '');
    if (!t.startsWith('{')) continue;
    try { const o = JSON.parse(t); if (o && typeof o === 'object') out.push(o); } catch { /* skip */ }
  }
  return out;
}

const ending = () => `When you're done, open ${location.origin}/admin/#/collect in this browser, paste every line into the "Paste results" box and click Import. If you can't, just give me the lines.`;

function linkedinPrompt(c) {
  return `Use my logged-in LinkedIn to find up to ${c.cap || 40} people who could buy AI upskilling training for their company's staff. Only read: never connect, follow, message, like or comment.

Who:
- Their current title is one of these, or very close: ${(c.titles || []).join('; ')}.
- Their company has ${(c.sizes || []).join(' or ')} employees on its LinkedIn page (roughly 20 to 200 people).
- The company is NOT any of these: ${c.exclude || 'a tech company'}.
- The person or company is based in ${(c.countries || []).join(', ')}.

How:
1. Use LinkedIn's People search with one title at a time, filtered by those locations.
2. For each promising person, open their profile, then their current company's page, and check the company size and industry before adding them. Skip anyone who doesn't fit every rule.
3. Prefer people active in the last few months, and anyone who posts or comments about AI, training, productivity or tools at work.
4. Go at a person's pace: a few seconds on each page. Stop at ${c.cap || 40} people, after about 30 minutes, or straight away if LinkedIn shows a warning, a captcha or a search limit.

For each person, write one line of JSON, nothing else on the line:
{"type":"prospect","name":"","title":"","company":"","company_size":"51-200","industry":"","country":"","profile_url":"https://www.linkedin.com/in/...","company_url":"https://www.linkedin.com/company/...","signal":"anything useful: posts about AI, recently started, hiring, team size"}

${ending()}`;
}

function groupsPrompt(c) {
  return `Use my logged-in Facebook to find as many Facebook groups as you can, up to ${c.cap || 60}, for Carna: a wellness coach for busy professionals and sports parents who are curious about, or struggling with, their health (movement, food, sleep, stress, people). Only read: never join, post, comment, react or message.

Look for:
- groups where those people gather: parents (especially sports parents and working moms), busy professionals, local community groups;
- groups about health, fitness, healthy eating, meal prep, weight, sleep, stress or burnout;
- groups where members ask for help, not ones that are only ads or links.
Prefer groups in English-speaking countries that are active (several posts a day) and have more than 1,000 members.

Search terms to start from (use Facebook search, Groups tab): ${(c.terms || []).join('; ')}. Follow "related groups" suggestions too.

For each group, open its About section and write one line of JSON, nothing else on the line:
{"type":"group","name":"","url":"https://www.facebook.com/groups/...","members":"12K","privacy":"public or private","activity":"e.g. 20 posts a day","promotion":"what the rules say about self-promotion, or 'not stated'","why":"who's in it and why it fits"}

Go at a person's pace and stop if Facebook shows a warning or a captcha.

${ending()}`;
}

function postsPrompt(c, joined) {
  return `Use my logged-in Facebook to collect up to ${c.cap || 50} recent posts (from the last ${c.days || 3} days) where someone asks for help or shares a struggle that Carna's coaching could genuinely help with: finding time to exercise, eating well on a busy schedule, energy, sleep, stress, weight, motivation, healthy habits for the family. Only read: never comment, react, join or message.

Where to look:
${joined.length ? `- These groups I've joined:\n${joined.map((p) => `  - ${p.name}${p.url ? ` (${p.url})` : ''}`).join('\n')}\n` : ''}- Facebook search, Posts tab, set to recent, for: ${(c.terms || []).join('; ')}.

Skip: medical emergencies or questions that need a doctor, posts that are ads or selling something, posts with dozens of good answers already, and anything older than ${c.days || 3} days.

For each post, open it so you have its own link (click the time stamp), then write one line of JSON, nothing else on the line:
{"type":"post","url":"https://www.facebook.com/groups/.../posts/...","group":"group name","author":"first name only","posted":"as shown, e.g. 5h","text":"the post, up to 500 characters","reactions":0,"comments":0,"why":"what they need, in a few words"}

Go at a person's pace and stop if Facebook shows a warning or a captcha.

${ending()}`;
}
