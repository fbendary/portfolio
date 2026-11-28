// Queue: collected threads and comments, worked through in four steps.
//   Triage     copy a batch for Claude chat, paste back its picks (or pick by hand)
//   Shortlist  write the gist of each reply, copy a drafting prompt, paste back the comments, approve
//   Post       copy & open one by one, or export the lot for Claude in Chrome; mark posted (logs it)
//   Posted     what went out
import { h, mount, seg, select, toast, copyText, extLink, relDay, fmt, emptyState, errorBox, lsGet, lsSet, debounce } from '../ui.js';
import { sb, q, all, refs, flowName, placeName, logActivity, explain } from '../db.js';
import { flowTag } from './common.js';

const STEPS = [
  { value: 'triage', label: 'Triage' }, { value: 'shortlist', label: 'Shortlist' },
  { value: 'post', label: 'Ready to post' }, { value: 'posted', label: 'Posted' },
];
const COLS = 'id,flow_key,channel_key,place_id,url,title,snippet,found_at,source,score,status,kind,author,queue,reason,angle,gist,draft,exported_at';
const sid = (id) => id.slice(0, 8);

export async function render(root, ctx) {
  let step = STEPS.some((x) => x.value === ctx.sub) ? ctx.sub : 'triage';
  const body = h('div');
  const counts = h('p', { class: 'muted' });
  mount(root,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Queue'), counts)),
    h('div', { class: 'toolbar', style: { marginBottom: '14px' } }, seg(STEPS, step, (v) => { step = v; ctx.app.setHash('queue', v === 'triage' ? '' : v); load(); }, 'Step')),
    body);
  await load();

  function scoped(b) { return ctx.flow === 'all' ? b : b.eq('flow_key', ctx.flow); }

  async function load() {
    body.classList.add('loading');
    try {
      const n = async (fn) => (await fn(scoped(sb.from('inbox_items').select('id', { count: 'exact', head: true })))).count || 0;
      const [untriaged, shortlist, ready] = await Promise.all([
        n((b) => b.is('queue', null).eq('status', 'new')), n((b) => b.eq('queue', 'shortlist')), n((b) => b.eq('queue', 'approved')),
      ]);
      counts.textContent = `${fmt(untriaged)} to triage · ${fmt(shortlist)} shortlisted · ${fmt(ready)} ready to post. Reddit is collected every hour at :07.`;
      const views = { triage, shortlist: shortlistView, post: postView, posted: postedView };
      const el = await views[step]({ untriaged, shortlist, ready });
      if (ctx.alive()) mount(body, el);
    } catch (e) { mount(body, errorBox(e.message || explain(e))); }
    finally { body.classList.remove('loading'); }
  }

  function head(title, text, ...acts) { return h('div', { class: 'panel-head' }, h('div', null, h('h2', null, title), text ? h('p', null, text) : null), acts.length ? h('div', { class: 'toolbar' }, acts) : null); }
  function meta(it) { return h('div', { class: 'meta' }, flowTag(it.flow_key, ctx.flow), it.place_id ? placeName(it.place_id) : '', ` · ${it.kind === 'comment' ? 'comment' : 'post'}`,
    it.author ? ` by u/${it.author}` : '', ` · ${relDay(it.found_at.slice(0, 10))}`, it.score != null ? ` · ${it.score} points` : ''); }
  async function setQueue(it, patch) { await q(sb.from('inbox_items').update(patch).eq('id', it.id)); Object.assign(it, patch); }

  // ------------------------------------------------------------ triage
  async function triage({ untriaged }) {
    let size = Number(lsGet('ld-q-size', '150'));
    let kind = lsGet('ld-q-kind', 'all');
    const list = await q(scoped(sb.from('inbox_items').select(COLS)).is('queue', null).eq('status', 'new')
      .order('found_at', { ascending: false }).limit(60));
    const paste = h('textarea', { rows: 5, placeholder: 'Paste Claude’s picks here: one line per pick, “id | why | angle”' });
    const result = h('p', { class: 'small' });
    const batchInfo = () => { try { const b = JSON.parse(lsGet('ld-q-batch', 'null')); return b ? `Last batch: ${b.ids.length} items, copied ${relDay(b.at.slice(0, 10))}.` : 'No batch copied yet.'; } catch { return ''; } };
    const info = h('p', { class: 'small' }, batchInfo());

    const copyBatch = async () => {
      let b = scoped(sb.from('inbox_items').select(COLS)).is('queue', null).eq('status', 'new');
      if (kind !== 'all') b = b.eq('kind', kind);
      const items = await q(b.order('found_at', { ascending: false }).limit(size));
      if (!items.length) return toast('Nothing to triage.');
      const ok = await copyText(triagePrompt(items));
      lsSet('ld-q-batch', JSON.stringify({ ids: items.map((x) => x.id), at: new Date().toISOString() }));
      info.textContent = batchInfo();
      toast(ok ? `Copied ${items.length} items. Paste them into Claude, then paste its answer below.` : 'Couldn’t copy', { error: !ok });
    };

    const applyPicks = async () => {
      const picks = parsePicks(paste.value);
      let batch = [];
      try { batch = JSON.parse(lsGet('ld-q-batch', 'null'))?.ids || []; } catch { /* none */ }
      if (!picks.length) return toast('No picks found. Each line should start with an id, then | reason | angle.', { error: true });
      const pool = batch.length ? batch : (await q(scoped(sb.from('inbox_items').select('id')).is('queue', null).limit(5000))).map((x) => x.id);
      const byShort = new Map(pool.map((id) => [sid(id), id]));
      let picked = 0, unknown = 0;
      const pickedIds = new Set();
      for (const p of picks) {
        const id = byShort.get(p.id);
        if (!id) { unknown++; continue; }
        await q(sb.from('inbox_items').update({ queue: 'shortlist', reason: p.reason, angle: p.angle }).eq('id', id));
        pickedIds.add(id); picked++;
      }
      const passIds = batch.filter((id) => !pickedIds.has(id));
      for (let i = 0; i < passIds.length; i += 200) await q(sb.from('inbox_items').update({ queue: 'pass' }).in('id', passIds.slice(i, i + 200)).is('queue', null));
      lsSet('ld-q-batch', null);
      result.textContent = `${picked} shortlisted${passIds.length ? `, ${passIds.length} passed` : ''}${unknown ? `, ${unknown} ids not found in the batch` : ''}.`;
      toast(`${picked} added to the shortlist`);
      paste.value = '';
      ctx.app.refreshCounts();
      load();
    };

    return h('div', { class: 'stack' },
      h('section', { class: 'panel' },
        head('Triage with Claude', 'Copy a batch, paste it into Claude chat, then paste Claude’s answer back here. Everything in the batch that Claude didn’t pick is marked as passed.'),
        h('div', { class: 'toolbar' },
          seg([{ value: 'all', label: 'Posts and comments' }, { value: 'post', label: 'Posts' }, { value: 'comment', label: 'Comments' }], kind, (v) => { kind = v; lsSet('ld-q-kind', v); }, 'Kind'),
          select([50, 100, 150, 250, 400].map((n) => ({ value: n, label: `${n} newest` })), size, (v) => { size = Number(v); lsSet('ld-q-size', v); }, { 'aria-label': 'Batch size', style: { width: 'auto' } }),
          h('button', { type: 'button', class: 'btn-ld primary', onclick: copyBatch }, 'Copy batch for Claude')),
        info,
        h('div', { class: 'form', style: { marginTop: '8px' } }, paste,
          h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn-ld primary', onclick: applyPicks }, 'Add picks to the shortlist'), result))),
      h('section', { class: 'panel' },
        head('Or skim by hand', `The ${Math.min(60, untriaged)} newest of ${fmt(untriaged)} waiting.`,
          h('button', { type: 'button', class: 'btn-ld small', onclick: async () => {
            const ids = list.filter((x) => x.queue == null).map((x) => x.id);
            if (!ids.length) return;
            await q(sb.from('inbox_items').update({ queue: 'pass' }).in('id', ids));
            toast(`Passed ${ids.length}`); load();
          } }, 'Pass all shown')),
        list.length ? h('div', { class: 'rows' }, list.map((it) => {
          const acts = h('div', { class: 'acts' },
            h('button', { type: 'button', class: 'btn-ld small primary', onclick: async () => { await setQueue(it, { queue: 'shortlist' }); acts.replaceChildren(h('span', { class: 'badge is-lead' }, 'shortlisted')); } }, 'Pick'),
            h('button', { type: 'button', class: 'btn-ld small ghost', onclick: async () => { await setQueue(it, { queue: 'pass' }); acts.replaceChildren(h('span', { class: 'badge' }, 'passed')); } }, 'Pass'));
          return h('div', { class: 'row rw' }, h('div', { class: 'grow' }, h('div', { class: 'title' }, extLink(it.url, it.title || it.url)), meta(it),
            it.snippet ? h('div', { class: 'meta clamp2', style: { marginTop: '4px', color: 'var(--ink)' } }, it.snippet) : null), acts);
        })) : emptyState('Nothing waiting', ['The collector adds new posts and comments from your subreddits every hour.'])));
  }

  // ------------------------------------------------------------ shortlist
  async function shortlistView() {
    const list = await all((o) => scoped(sb.from('inbox_items').select(COLS, o)).eq('queue', 'shortlist').order('found_at', { ascending: false }).order('id'));
    const paste = h('textarea', { rows: 5, placeholder: 'Paste Claude’s drafts here: “### id” then the comment' });
    const copyDrafting = async () => {
      const ready = list.filter((x) => x.gist.trim() && !x.draft.trim());
      if (!ready.length) return toast('Write a gist on at least one item first (items with a draft already are left out).', { error: true });
      const ok = await copyText(draftPrompt(ready));
      toast(ok ? `Copied ${ready.length} for drafting. Paste Claude’s answer below.` : 'Couldn’t copy', { error: !ok });
    };
    const applyDrafts = async () => {
      const drafts = parseDrafts(paste.value);
      const byShort = new Map(list.map((x) => [sid(x.id), x]));
      let n = 0;
      for (const d of drafts) { const it = byShort.get(d.id); if (!it) continue; await setQueue(it, { draft: d.text }); n++; }
      toast(n ? `${n} drafts added. Read each one, then approve it.` : 'No drafts found. Each should start with “### id”.', { error: !n });
      if (n) { paste.value = ''; load(); }
    };
    return h('div', { class: 'stack' },
      h('section', { class: 'panel' },
        head('Draft with Claude', 'Write the gist of each reply in a line, copy the drafting prompt into Claude chat, paste its answer back, then read and approve each comment.',
          h('button', { type: 'button', class: 'btn-ld primary', onclick: copyDrafting }, 'Copy drafting prompt')),
        h('div', { class: 'form' }, paste, h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn-ld primary', onclick: applyDrafts }, 'Add drafts')))),
      list.length ? h('section', { class: 'panel' }, h('div', { class: 'rows' }, list.map(itemEditor)))
        : emptyState('The shortlist is empty', ['Triage a batch first, or pick items by hand under Triage.']));
  }

  function itemEditor(it) {
    const saveSoon = debounce((patch) => setQueue(it, patch).catch((e) => toast(e.message, { error: true })), 600);
    const gist = h('textarea', { rows: 2, placeholder: 'Your gist: what you want to say, in a line or two' }); gist.value = it.gist;
    gist.addEventListener('input', () => saveSoon({ gist: gist.value }));
    const draft = h('textarea', { rows: 5, placeholder: 'The comment (from Claude, or write it yourself)' }); draft.value = it.draft;
    draft.addEventListener('input', () => saveSoon({ draft: draft.value }));
    const row = h('div', { class: 'row', style: { display: 'block' } },
      h('div', { class: 'title' }, extLink(it.url, it.title || it.url)), meta(it),
      it.snippet ? h('div', { class: 'meta', style: { marginTop: '4px', color: 'var(--ink)' } }, it.snippet) : null,
      it.reason || it.angle ? h('div', { class: 'meta', style: { marginTop: '4px' } }, it.reason ? `Why: ${it.reason}` : '', it.reason && it.angle ? ' · ' : '', it.angle ? `Angle: ${it.angle}` : '') : null,
      h('div', { class: 'form', style: { marginTop: '8px' } }, gist, draft,
        h('div', { class: 'form-actions' },
          h('button', { type: 'button', class: 'btn-ld small primary', onclick: async () => {
            if (!draft.value.trim()) return toast('Add the comment first.', { error: true });
            await setQueue(it, { gist: gist.value, draft: draft.value, queue: 'approved' }); row.remove(); toast('Approved: it’s under Ready to post'); ctx.app.refreshCounts();
          } }, 'Approve'),
          h('button', { type: 'button', class: 'btn-ld small ghost', onclick: async () => { await setQueue(it, { queue: 'pass' }); row.remove(); } }, 'Pass'))));
    return row;
  }

  // ------------------------------------------------------------ ready to post
  async function postView() {
    const list = await all((o) => scoped(sb.from('inbox_items').select(COLS, o)).eq('queue', 'approved').order('found_at').order('id'));
    if (!list.length) return emptyState('Nothing ready to post', ['Approve drafts on the Shortlist.']);
    const exported = list.filter((x) => x.exported_at);
    const exportChrome = async () => {
      const fresh = await all((o) => scoped(sb.from('inbox_items').select(COLS, o)).eq('queue', 'approved').order('found_at').order('id'));
      const items = fresh.filter((x) => !x.exported_at);
      const list = fresh;
      const pick = items.length ? items : list;
      const ok = await copyText(chromePrompt(pick));
      if (!ok) return toast('Couldn’t copy', { error: true });
      await q(sb.from('inbox_items').update({ exported_at: new Date().toISOString() }).in('id', pick.map((x) => x.id)));
      toast(`Copied ${pick.length} for Claude in Chrome. When it’s done, mark the ones it posted.`);
      load();
    };
    return h('div', { class: 'stack' },
      h('section', { class: 'panel' },
        head('Post', 'One at a time: Copy & open copies the comment and opens the thread; paste, post, then Mark posted. Or hand the whole list to Claude in Chrome.',
          h('button', { type: 'button', class: 'btn-ld primary', onclick: exportChrome }, 'Copy list for Claude in Chrome'),
          exported.length ? h('button', { type: 'button', class: 'btn-ld', onclick: async () => { for (const it of exported) await markPosted(it, true); toast(`Marked ${exported.length} posted`); load(); } }, `Mark the ${exported.length} exported as posted`) : null),
        h('p', { class: 'small' }, 'Pace it: a few minutes between comments, and stop if Reddit shows a warning or a captcha. Many subreddits remove AI-sounding comments, so edit drafts into your own words.')),
      h('section', { class: 'panel' }, h('div', { class: 'rows' }, list.map((it) => {
        const row = h('div', { class: 'row', style: { display: 'block' } },
          h('div', { class: 'title' }, extLink(it.url, it.title || it.url), it.exported_at ? h('span', { class: 'badge', style: { marginLeft: '6px' } }, 'sent to Chrome') : null), meta(it),
          h('div', { class: 'tpl-body open' }, it.draft),
          h('div', { class: 'form-actions', style: { marginTop: '8px' } },
            h('button', { type: 'button', class: 'btn-ld small primary', onclick: async () => { await copyText(it.draft); window.open(it.url, '_blank', 'noopener,noreferrer'); toast('Copied. Paste it in the reply box, post, then Mark posted.'); } }, 'Copy & open'),
            h('button', { type: 'button', class: 'btn-ld small', onclick: async () => { await markPosted(it); row.remove(); } }, 'Mark posted'),
            h('button', { type: 'button', class: 'btn-ld small ghost', onclick: async () => { await setQueue(it, { queue: 'shortlist', exported_at: null }); row.remove(); } }, 'Back to shortlist')));
        return row;
      }))));
  }

  async function markPosted(it, quiet) {
    try {
      const c = refs.channel.get(it.channel_key);
      const action = c && c.actions.includes('comment') ? 'comment' : 'dm_sent';
      await logActivity({ flow_key: it.flow_key || refs.flows[0].key, channel_key: it.channel_key || 'reddit_comment', place_id: it.place_id, action_key: action, count: 1, inbox_item_id: it.id, note: 'From the queue' });
      await setQueue(it, { queue: 'posted' });
      if (!quiet) toast('Logged as a comment');
      ctx.app.refreshCounts();
    } catch (e) { toast(e.message || explain(e), { error: true }); }
  }

  async function postedView() {
    const list = await q(scoped(sb.from('inbox_items').select(COLS)).eq('queue', 'posted').order('updated_at', { ascending: false }).limit(100));
    if (!list.length) return emptyState('Nothing posted from the queue yet', []);
    return h('section', { class: 'panel' }, h('div', { class: 'rows' }, list.map((it) => h('div', { class: 'row', style: { display: 'block' } },
      h('div', { class: 'title' }, extLink(it.url, it.title || it.url)), meta(it), h('div', { class: 'meta clamp2', style: { marginTop: '4px' } }, it.draft)))));
  }
}

// ------------------------------------------------------------ prompts and parsers

function flowBrief(keys) {
  return keys.map((k) => { const f = refs.flow.get(k); return f ? `- ${f.name} (${k}): I help ${f.audience}. Offer: ${f.offer}.` : ''; }).filter(Boolean).join('\n');
}
const oneLine = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

function triagePrompt(items) {
  const flows = [...new Set(items.map((x) => x.flow_key).filter(Boolean))];
  return `You're helping me find Reddit posts and comments where a reply from me would genuinely help someone, and where that help fits what I do. Skim fast; don't overthink.

What I do, by flow:
${flowBrief(flows)}

Pick an item only if a thoughtful, helpful reply from me fits: someone asking for help or advice, describing a problem my work speaks to, or a discussion I can add something real to. Skip venting with nothing to answer, jokes, memes, people already well answered, mod or bot posts, and anything where a stranger's advice would be unwelcome. Never pick on the chance to sell. For Carna, no medical questions.

Answer with one line per pick and nothing else:
id | why it's worth it (a few words) | the angle for my reply (one line)

Items (id · flow · subreddit · post or comment · thread title — text):
${items.map((x) => `${sid(x.id)} · ${x.flow_key || '?'} · ${placeName(x.place_id) || ''} · ${x.kind} · ${oneLine(x.title, 120)} — ${oneLine(x.snippet, 280)}`).join('\n')}`;
}

function draftPrompt(items) {
  const flows = [...new Set(items.map((x) => x.flow_key).filter(Boolean))];
  return `Write Reddit replies for me, one per item below, from my gist.

Who I am, by flow:
${flowBrief(flows)}

How to write them:
- Answer the person first, specifically, as a knowledgeable peer. Plain words, warm, no marketing.
- Follow my gist; don't add claims I didn't make. No links and no product names unless my gist says so.
- Usually 40 to 150 words. No emojis, hashtags, bullet-point walls or "Great question". Sound like a person, not an AI.
- For Carna: no health or medical claims.

Answer in exactly this format for each item, nothing else:
### id
the comment

Items:
${items.map((x) => `### ${sid(x.id)}
Link: ${x.url}
Subreddit: ${placeName(x.place_id) || ''} · replying to a ${x.kind}${x.author ? ` by u/${x.author}` : ''}
Thread: ${oneLine(x.title, 200)}
They wrote: ${oneLine(x.snippet, 600)}
${x.angle ? `Angle: ${x.angle}\n` : ''}My gist: ${x.gist.trim()}`).join('\n\n')}`;
}

function chromePrompt(items) {
  return `Post these Reddit comments for me from my own logged-in Reddit account, one at a time.

For each item:
1. Open the link. It points at either a post or a specific comment.
2. If the post or comment is deleted, removed or locked, or commenting isn't allowed, skip it and note why.
3. Reply to exactly that post (the main comment box) or that comment (its Reply button).
4. Paste the comment text exactly as given. Don't change it.
5. Submit, check it appears, then wait about 2 minutes before the next one.

Stop right away and tell me if Reddit shows a rate limit, a captcha or any warning about my account.
When you finish, list the ids you posted and the ids you skipped (with the reason).

${items.map((x) => `### ${sid(x.id)}
Link: ${x.url}
Reply to: the ${x.kind}${x.author ? ` by u/${x.author}` : ''}
Comment:
${x.draft.trim()}`).join('\n\n')}`;
}

// "abc12345 | reason | angle" (Claude sometimes adds bullets, backticks or a header row)
export function parsePicks(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.replace(/[`*]/g, '').match(/^\W*([0-9a-f]{8})\b\s*[|·:-]?\s*(.*)$/i);
    if (!m) continue;
    const [reason = '', ...rest] = m[2].split('|').map((s) => s.trim());
    out.push({ id: m[1].toLowerCase(), reason: reason.slice(0, 300), angle: rest.join(' | ').slice(0, 300) });
  }
  return out;
}

// "### abc12345" then the comment, until the next ###
export function parseDrafts(text) {
  const out = [];
  const parts = String(text || '').split(/^\s*#{2,4}\s*/m);
  for (const p of parts) {
    const m = p.match(/^`?([0-9a-f]{8})`?[^\n]*\n([\s\S]*)$/i);
    if (m && m[2].trim()) out.push({ id: m[1].toLowerCase(), text: m[2].trim() });
  }
  return out;
}
