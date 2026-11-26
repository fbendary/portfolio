// Inbox: threads and posts worth acting on. Paste a link (channel, place and title are guessed),
// or paste alert emails. Engaged logs an activity, Make lead opens a lead, Skip hides it.
import { h, mount, field, select, seg, toast, relDay, extLink, emptyState, errorBox } from '../ui.js';
import { sb, q, all, refs, chLabel, flowName, placeName, placesFor, logActivity, deleteActivity, reload, explain } from '../db.js';
import { flowTag, flowOptions, channelOptions } from './common.js';
import { guessFromUrl, parseAlerts, normalizeUrl } from '../parse.js';
import { openLead } from './leadsheet.js';

const STATUS = [
  { value: 'new', label: 'New' }, { value: 'engaged', label: 'Engaged' }, { value: 'lead', label: 'Became lead' },
  { value: 'skipped', label: 'Skipped' }, { value: 'all', label: 'All' },
];

// The three actions, shared with the Today screen. done() runs once the item has left "new".
export function inboxActions(it, ctx, done) {
  // An item that came in without a flow (an alert whose keyword matched no saved search) gets one first,
  // so nothing is credited to the wrong flow.
  if (!it.flow_key) {
    if (ctx.flow !== 'all') it.flow_key = ctx.flow;
    else {
      return [select([{ value: '', label: 'Which flow is this for?' }, ...refs.flows.map((f) => ({ value: f.key, label: f.name }))], '', async (v) => {
        if (!v) return;
        try { await q(sb.from('inbox_items').update({ flow_key: v }).eq('id', it.id)); it.flow_key = v; done('new'); }
        catch (e) { toast(e.message || explain(e), { error: true }); }
      }, { 'aria-label': 'Flow for this item', style: { width: 'auto' } })];
    }
  }
  const engaged = async () => {
    const c = refs.channel.get(it.channel_key);
    const action = c && refs.action.get(c.primary_action) && refs.action.get(c.primary_action).direction === 'out' ? c.primary_action : 'comment';
    try {
      const rec = await logActivity({ flow_key: it.flow_key, channel_key: it.channel_key || 'forums', place_id: it.place_id, action_key: action, count: 1, inbox_item_id: it.id });
      done('engaged');
      toast(`Engaged: logged a ${refs.action.get(action).label.toLowerCase()}`, {
        undo: async () => { await deleteActivity(rec.id); await q(sb.from('inbox_items').update({ status: 'new' }).eq('id', it.id)); done('new'); },
      });
    } catch (e) { toast(e.message || explain(e), { error: true }); }
  };
  const makeLead = () => openLead(null, {
    flow: ctx.flow,
    prefill: { flow_key: it.flow_key, channel_key: it.channel_key, place_id: it.place_id, source_inbox_id: it.id, notes: [it.title, it.url].filter(Boolean).join('\n'), stage: 'new' },
    onChange: async () => {
      const [row] = await q(sb.from('inbox_items').select('status').eq('id', it.id));
      if (row && row.status === 'lead') done('lead');
    },
  });
  const skip = async () => {
    try {
      await q(sb.from('inbox_items').update({ status: 'skipped' }).eq('id', it.id));
      done('skipped');
      toast('Skipped', { undo: async () => { await q(sb.from('inbox_items').update({ status: 'new' }).eq('id', it.id)); done('new'); } });
    } catch (e) { toast(e.message || explain(e), { error: true }); }
  };
  return [
    h('button', { type: 'button', class: 'btn-ld small primary', onclick: engaged, title: 'You commented or replied: logs it' }, 'Engaged'),
    h('button', { type: 'button', class: 'btn-ld small', onclick: makeLead }, 'Make lead'),
    h('button', { type: 'button', class: 'btn-ld small ghost', onclick: skip }, 'Skip'),
  ];
}

export async function render(root, ctx) {
  let status = ctx.params.get('status') || 'new';
  let channel = '';
  let items = [];
  const listBox = h('div');
  mount(root,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Inbox'), h('p', null, 'Found threads to act on. Help first; log what you do.'))),
    h('div', { class: 'grid2' },
      h('div', { class: 'stack' }, filters(), listBox),
      h('div', { class: 'stack' }, addPanel(), alertsPanel())));
  await load();

  function filters() {
    const chSel = select([{ value: '', label: 'Every channel' }, ...refs.channels.map((c) => ({ value: c.key, label: c.label }))], channel, (v) => { channel = v; load(); }, { 'aria-label': 'Channel', style: { width: 'auto' } });
    return h('div', { class: 'toolbar' }, seg(STATUS, status, (v) => { status = v; ctx.app.setHash('inbox', '', status === 'new' ? {} : { status }); load(); }, 'Status'), chSel);
  }

  async function load() {
    listBox.classList.add('loading');
    try {
      items = await all((o) => {
        let b = sb.from('inbox_items').select('*', o);
        if (ctx.flow !== 'all') b = b.eq('flow_key', ctx.flow);
        if (status !== 'all') b = b.eq('status', status);
        if (channel) b = b.eq('channel_key', channel);
        return b.order('found_at', { ascending: false }).order('id').limit(300);
      });
    } catch (e) { mount(listBox, errorBox(e.message)); return; }
    finally { listBox.classList.remove('loading'); }
    if (!ctx.alive()) return;
    paintList();
  }

  function paintList() {
    if (!items.length) {
      mount(listBox, status === 'new'
        ? emptyState('Nothing to act on yet', [
          'Open a saved search under Sources (each link opens in a new tab and is marked as run).',
          'Find a thread where you can genuinely help.',
          'Paste its link in “Add a thread”, or paste F5Bot alert emails under “Paste alerts”.'])
        : emptyState('Nothing here', ['Try another status or channel.']));
      return;
    }
    mount(listBox, h('section', { class: 'panel' }, h('div', { class: 'rows' }, items.map((it) => {
      const row = h('div', { class: 'row rw' });
      const done = (st) => { it.status = st; ctx.app.refreshCounts(); if (status !== 'all' && st !== status) { items = items.filter((x) => x.id !== it.id); paintList(); } else paintList(); };
      row.append(
        h('div', { class: 'grow' },
          h('div', { class: 'title' }, extLink(it.url, it.title || it.url)),
          h('div', { class: 'meta' }, flowTag(it.flow_key, ctx.flow), chLabel(it.channel_key), it.place_id ? ` · ${placeName(it.place_id)}` : '',
            ` · found ${relDay(it.found_at.slice(0, 10))}`, it.source !== 'manual' ? ` · ${it.source}` : '', it.score != null ? ` · score ${it.score}` : '',
            status === 'all' ? ` · ${STATUS.find((x) => x.value === it.status)?.label}` : ''),
          it.snippet ? h('div', { class: 'meta clamp2', style: { marginTop: '4px' } }, it.snippet) : null),
        h('div', { class: 'acts' }, it.status === 'new' ? inboxActions(it, ctx, done) : it.status === 'lead' && it.lead_id
          ? h('button', { type: 'button', class: 'btn-ld small', onclick: () => openLead(it.lead_id, { flow: ctx.flow }) }, 'Open lead')
          : h('button', { type: 'button', class: 'btn-ld small ghost', onclick: async () => { await q(sb.from('inbox_items').update({ status: 'new' }).eq('id', it.id)); done('new'); } }, 'Back to new')));
      return row;
    }))));
  }

  // ---------------------------------------------------------------- add one link
  function addPanel() {
    const st = { url: '', title: '', snippet: '', flow_key: ctx.flow !== 'all' ? ctx.flow : refs.flows[0].key, channel_key: '', place_id: '', newPlace: '', addPlace: true, score: '' };
    const box = h('div', { class: 'form' });
    const urlInp = h('input', { type: 'url', placeholder: 'Paste a link to a thread or post', required: true, autocomplete: 'off' });
    urlInp.addEventListener('input', () => {
      st.url = urlInp.value;
      const g = guessFromUrl(st.url);
      if (g) {
        if (g.channel) st.channel_key = g.channel;
        if (g.title && !st.titleTouched) st.title = g.title;
        st.newPlace = '';
        if (g.placeName) {
          const p = placesFor(st.flow_key, st.channel_key).find((x) => x.name.toLowerCase() === g.placeName.toLowerCase());
          if (p) st.place_id = p.id; else { st.place_id = ''; st.newPlace = g.placeName; }
        }
      }
      paint();
    });
    const form = h('form', { class: 'form', onsubmit: async (e) => { e.preventDefault(); await add(); } }, field('Link', urlInp), box);
    paint();
    return h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('div', null, h('h2', null, 'Add a thread'), h('p', null, 'Reddit, Facebook groups, LinkedIn posts, Upwork jobs, Quora, Indie Hackers…'))), form);

    function paint() {
      const title = h('input', { type: 'text', value: st.title, placeholder: 'What it’s about' });
      title.addEventListener('input', () => { st.title = title.value; st.titleTouched = true; });
      const snip = h('textarea', { rows: 2, placeholder: 'Optional: the line that made it worth saving' }, st.snippet);
      snip.addEventListener('input', () => { st.snippet = snip.value; });
      const places = placesFor(st.flow_key, st.channel_key);
      box.replaceChildren(
        field('Title', title),
        h('div', { class: 'form-row' },
          ctx.flow === 'all' ? field('Flow', select(flowOptions(), st.flow_key, (v) => { st.flow_key = v; paint(); })) : null,
          field('Channel', select([{ value: '', label: 'Choose…' }, ...channelOptions(st.flow_key)], st.channel_key, (v) => { st.channel_key = v; paint(); })),
          field('Place', select([{ value: '', label: places.length ? 'None' : 'No places yet' }, ...places.map((p) => ({ value: p.id, label: p.name }))], st.place_id, (v) => { st.place_id = v; }))),
        st.newPlace ? h('label', { class: 'check small' }, (() => { const c = h('input', { type: 'checkbox', checked: st.addPlace }); c.addEventListener('change', () => { st.addPlace = c.checked; }); return c; })(), `Add ${st.newPlace} to Places`) : null,
        field('Snippet', snip),
        h('div', { class: 'form-actions' }, h('button', { type: 'submit', class: 'btn-ld primary' }, 'Add to inbox')));
    }

    async function add() {
      const url = normalizeUrl(st.url);
      if (!url) return toast('That doesn’t look like a link.', { error: true });
      if (!st.channel_key) return toast('Pick a channel.', { error: true });
      try {
        let placeId = st.place_id || null;
        if (!placeId && st.newPlace && st.addPlace) {
          const [p] = await q(sb.from('places').insert({ flow_key: st.flow_key, channel_key: st.channel_key, name: st.newPlace, status: 'active', url: st.newPlace.startsWith('r/') ? `https://www.reddit.com/${st.newPlace}/new/` : '' }).select('*'));
          placeId = p.id; await reload('places');
        }
        await q(sb.from('inbox_items').insert({ url, title: st.title.trim(), snippet: st.snippet.trim(), flow_key: st.flow_key, channel_key: st.channel_key, place_id: placeId, source: 'manual' }));
        toast('Added to the inbox');
        Object.assign(st, { url: '', title: '', snippet: '', place_id: '', newPlace: '', titleTouched: false });
        urlInp.value = '';
        paint();
        ctx.app.refreshCounts();
        if (status === 'new' || status === 'all') load();
      } catch (e) { toast(e.code === '23505' ? 'That link is already in the inbox.' : e.message || explain(e), { error: true }); }
    }
  }

  // ---------------------------------------------------------------- paste alerts
  function alertsPanel() {
    const st = { text: '', flow_key: ctx.flow !== 'all' ? ctx.flow : refs.flows[0].key, found: [] };
    const preview = h('div');
    const ta = h('textarea', { rows: 5, placeholder: 'Paste one or more F5Bot alert emails (or any text with Reddit, Hacker News or Lobsters links)' });
    ta.addEventListener('input', () => { st.text = ta.value; scan(); });
    const flowSel = ctx.flow === 'all' ? field('Flow when the keyword doesn’t match a saved search', select(flowOptions(), st.flow_key, (v) => { st.flow_key = v; scan(); })) : null;
    return h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('div', null, h('h2', null, 'Paste alerts'), h('p', null, 'F5Bot keyword alerts, copied from the email.'))),
      h('div', { class: 'form' }, ta, flowSel, preview));

    function flowFor(keyword) {
      if (!keyword) return st.flow_key;
      const k = keyword.toLowerCase();
      const hit = refs.searches.find((x) => (x.query || '').toLowerCase().replace(/["“”]/g, '').includes(k) || x.label.toLowerCase().includes(k));
      return hit && (ctx.flow === 'all' || hit.flow_key === ctx.flow) ? hit.flow_key : st.flow_key;
    }

    function scan() {
      st.found = parseAlerts(st.text).map((x) => ({ ...x, flow_key: flowFor(x.keyword), on: true }));
      if (!st.text.trim()) { preview.replaceChildren(); return; }
      if (!st.found.length) { preview.replaceChildren(h('p', { class: 'small' }, 'No Reddit, Hacker News or Lobsters links found in that text.')); return; }
      preview.replaceChildren(
        h('div', { class: 'rows' }, st.found.map((x) => {
          const c = h('input', { type: 'checkbox', checked: true, 'aria-label': 'Include' });
          c.addEventListener('change', () => { x.on = c.checked; });
          return h('div', { class: 'row' }, c, h('div', { class: 'grow' }, h('div', { class: 'title' }, x.title || x.url), h('div', { class: 'meta' }, `${flowName(x.flow_key)} · ${chLabel(x.channel)}${x.placeName ? ` · ${x.placeName}` : ''}${x.keyword ? ` · “${x.keyword}”` : ''}`)));
        })),
        h('div', { class: 'form-actions', style: { marginTop: '8px' } }, h('button', { type: 'button', class: 'btn-ld primary', onclick: addAll }, `Add ${st.found.length} to the inbox`)));
    }

    async function addAll() {
      const picked = st.found.filter((x) => x.on);
      if (!picked.length) return;
      const run = await q(sb.from('import_runs').insert({ importer: 'f5bot', status: 'running', meta: { via: 'paste' } }).select('id'));
      try {
        const rows = picked.map((x) => {
          const place = x.placeName ? refs.places.find((p) => p.flow_key === x.flow_key && p.name.toLowerCase() === x.placeName.toLowerCase()) : null;
          return { url: x.url, title: x.title, flow_key: x.flow_key, channel_key: x.channel, place_id: place ? place.id : null, source: 'f5bot', snippet: x.keyword ? `Keyword: ${x.keyword}` : '' };
        });
        const added = await q(sb.from('inbox_items').upsert(rows, { onConflict: 'url', ignoreDuplicates: true }).select('id'));
        await q(sb.from('import_runs').update({ status: 'ok', finished_at: new Date().toISOString(), rows: added.length }).eq('id', run[0].id));
        toast(`Added ${added.length}${added.length < rows.length ? ` (${rows.length - added.length} were already here)` : ''}`);
        ta.value = ''; st.text = ''; scan();
        ctx.app.refreshCounts();
        load();
      } catch (e) {
        await sb.from('import_runs').update({ status: 'error', finished_at: new Date().toISOString(), error: e.message }).eq('id', run[0].id);
        toast(e.message || explain(e), { error: true });
      }
    }
  }
}
