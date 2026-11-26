// Sources: per flow, which channels are on, their phase (Now, Next, Later), focus, weekly target and
// daily cap; the places in each channel; and the saved searches to run.
import { h, mount, field, select, seg, toast, sheet, confirmBox, switchEl, copyText, extLink, ago, debounce, emptyState, isUrl } from '../ui.js';
import { sb, q, refs, index, reload, chLabel, flowName, getFc, explain } from '../db.js';
import { GROUP, LANE, PHASE, trackedLink, channelOptions } from './common.js';

const PLACE_STATUS = [{ value: 'to_join', label: 'To join' }, { value: 'joined', label: 'Joined' }, { value: 'active', label: 'Active' }, { value: 'banned', label: 'Banned' }, { value: 'avoid', label: 'Avoid' }];

export async function render(root, ctx) {
  if (ctx.flow === 'all') return overview(root, ctx);
  const flow = ctx.flow;
  const placesBox = h('div'), searchesBox = h('div');
  mount(root,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, `Sources · ${flowName(flow)}`), h('p', null, (refs.settings['plan.flows'] || {})[flow]?.first || 'Which channels this flow uses, and how hard.'))),
    h('div', { class: 'stack' }, channelsPanel(), searchesBox, placesBox));
  paintSearches(); paintPlaces();

  // ---------------------------------------------------------------- channels
  function channelsPanel() {
    const groups = Object.keys(GROUP);
    return h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('div', null, h('h2', null, 'Channels'),
        h('p', null, 'Leading channels get about 70% of the hours, testing ones the rest. Changes save as you go.'))),
      groups.map((g) => {
        const list = refs.channels.filter((c) => c.group_key === g);
        if (!list.length) return null;
        return h('div', { class: 'src-group' }, h('h3', null, GROUP[g]), list.map((c) => channelRow(c)));
      }));
  }

  function channelRow(c) {
    const fc = { ...getFc(flow, c.key) };
    const row = h('div', { class: ['src', !fc.enabled && 'off'] });
    const save = async (patch, quiet) => {
      Object.assign(fc, patch);
      row.classList.toggle('off', !fc.enabled);
      try {
        const [saved] = await q(sb.from('flow_channels').upsert({ flow_key: flow, channel_key: c.key, enabled: fc.enabled, phase: fc.phase, focus: fc.focus, weekly_target: fc.weekly_target, daily_cap: fc.daily_cap, where_hint: fc.where_hint || '' }, { onConflict: 'flow_key,channel_key' }).select('*'));
        const i = refs.flowChannels.findIndex((x) => x.flow_key === flow && x.channel_key === c.key);
        if (i >= 0) refs.flowChannels[i] = saved; else refs.flowChannels.push(saved);
        index();
        if (!quiet) toast(`${c.label}: saved`, { ms: 1800 });
      } catch (e) { toast(e.message || explain(e), { error: true }); }
    };
    const numIn = (k, placeholder) => {
      const el = h('input', { type: 'number', min: k === 'daily_cap' ? 1 : 0, value: fc[k] ?? '', placeholder, inputmode: 'numeric', 'aria-label': `${c.label} ${k === 'daily_cap' ? 'daily cap' : 'weekly target'}` });
      el.addEventListener('input', debounce(() => { const v = el.value.trim(); save({ [k]: v === '' ? null : Math.max(k === 'daily_cap' ? 1 : 0, Math.round(Number(v))) }, true); }, 600));
      return el;
    };
    const where = h('input', { type: 'text', value: fc.where_hint || '', placeholder: 'Where: a subreddit, a group…', 'aria-label': `${c.label} where` });
    where.addEventListener('input', debounce(() => save({ where_hint: where.value.trim() }, true), 700));
    row.append(
      h('div', { class: 'name' }, h('b', null, c.label), h('small', null, `${LANE[c.lane]} lane${c.notes ? ` · ${c.notes}` : ''}`)),
      h('div', { class: 'cell', 'data-label': 'Phase' }, seg(Object.entries(PHASE).map(([value, label]) => ({ value, label })), fc.phase, (v) => save({ phase: v, enabled: true }), `${c.label} phase`)),
      h('div', { class: 'cell', 'data-label': 'Focus' }, seg([{ value: 'lead', label: 'Leading' }, { value: 'test', label: 'Testing' }], fc.focus, (v) => save({ focus: v }), `${c.label} focus`)),
      h('div', { class: 'cell', 'data-label': 'A week' }, numIn('weekly_target', 'target')),
      h('div', { class: 'cell', 'data-label': 'A day' }, c.lane === 'volume' ? numIn('daily_cap', c.daily_cap ? `cap ${c.daily_cap}` : 'cap') : h('span', { class: 'small' }, '–')),
      h('div', { class: 'cell', 'data-label': 'Where' }, where),
      h('div', { class: 'sw', style: { display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end' } },
        h('button', { type: 'button', class: 'btn-ld small ghost', title: 'Copy a tracked link to the portfolio for this channel', onclick: async () => { const ok = await copyText(trackedLink(c.key, flow)); toast(ok ? `Copied ${trackedLink(c.key, flow)}` : 'Couldn’t copy', { error: !ok }); } }, 'Copy tracked link'),
        switchEl(fc.enabled, (on) => save({ enabled: on }), `${c.label} on for ${flowName(flow)}`)));
    return row;
  }

  // ---------------------------------------------------------------- saved searches
  function paintSearches() {
    const list = refs.searches.filter((x) => x.flow_key === flow);
    const byCh = new Map();
    for (const s of list) { if (!byCh.has(s.channel_key)) byCh.set(s.channel_key, []); byCh.get(s.channel_key).push(s); }
    mount(searchesBox, h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('div', null, h('h2', null, 'Saved searches'), h('p', null, 'Open one in a new tab (it’s marked as run), then paste good threads into the Inbox.')),
        h('button', { type: 'button', class: 'btn-ld small', onclick: () => editSearch(null) }, '+ Add search')),
      list.length ? [...byCh.entries()].map(([ch, items]) => h('div', { class: 'src-group' }, h('h3', null, chLabel(ch)),
        h('div', { class: 'rows' }, items.map((s) => h('div', { class: 'row rw' },
          h('div', { class: 'grow' }, h('div', { class: 'title' }, s.label), h('div', { class: 'meta' }, `Last run ${ago(s.last_run_at)}${s.notes ? ` · ${s.notes}` : ''}`)),
          h('div', { class: 'acts' },
            h('a', { class: 'btn-ld small primary', href: s.url, target: '_blank', rel: 'noopener noreferrer', onclick: () => markRun(s) }, 'Open'),
            h('button', { type: 'button', class: 'btn-ld small', onclick: () => markRun(s, true) }, 'Mark run'),
            h('button', { type: 'button', class: 'btn-ld small ghost', onclick: () => editSearch(s) }, 'Edit')))))))
        : emptyState('No saved searches for this flow', ['Add the searches you run every day: a Reddit search sorted by New, a Google site: search, a LinkedIn content search or an Upwork search URL.'])));
  }

  async function markRun(s, notify) {
    try {
      const now = new Date().toISOString();
      await q(sb.from('saved_searches').update({ last_run_at: now }).eq('id', s.id));
      s.last_run_at = now;
      if (notify) toast(`${s.label}: marked as run`);
      setTimeout(paintSearches, 300);
    } catch (e) { toast(e.message || explain(e), { error: true }); }
  }

  function editSearch(s) {
    const st = s ? { ...s } : { flow_key: flow, channel_key: 'reddit_comment', label: '', query: '', url: '', notes: '' };
    const inp = (k, props = {}) => { const el = h(k === 'notes' ? 'textarea' : 'input', { type: 'text', value: st[k] || '', ...props }); if (k === 'notes') el.value = st[k] || ''; el.addEventListener('input', () => { st[k] = el.value; }); return el; };
    const sh = sheet({
      title: s ? 'Edit saved search' : 'New saved search',
      body: h('form', { class: 'form', id: 'ss-form' },
        field('Channel', select(channelOptions(flow), st.channel_key, (v) => { st.channel_key = v; })),
        field('Label', inp('label', { required: true, placeholder: 'Reddit · “no idea what career”' })),
        field('Query', inp('query', { placeholder: 'The phrase, for your own reference' })),
        field('Link', inp('url', { type: 'url', required: true, placeholder: 'https://www.reddit.com/search/?q=…&sort=new&t=week' }), 'Must start with https://'),
        field('Notes', inp('notes', { rows: 2 }))),
      foot: [
        s ? h('button', { type: 'button', class: 'btn-ld danger', onclick: async () => { if (!(await confirmBox(`Delete “${s.label}”?`))) return; await q(sb.from('saved_searches').delete().eq('id', s.id)); await reload('searches'); sh.close(); paintSearches(); } }, 'Delete') : null,
        h('button', { type: 'button', class: 'btn-ld primary', onclick: async () => {
          if (!st.label.trim() || !/^https:\/\//.test(st.url.trim())) return toast('Add a label and an https:// link.', { error: true });
          const row = { flow_key: flow, channel_key: st.channel_key, label: st.label.trim(), query: st.query.trim(), url: st.url.trim(), notes: (st.notes || '').trim() };
          try {
            if (s) await q(sb.from('saved_searches').update(row).eq('id', s.id)); else await q(sb.from('saved_searches').insert({ ...row, sort: refs.searches.length + 1 }));
            await reload('searches'); sh.close(); paintSearches(); toast('Saved');
          } catch (e) { toast(e.message || explain(e), { error: true }); }
        } }, 'Save'),
      ],
    });
  }

  // ---------------------------------------------------------------- places
  function paintPlaces() {
    const list = refs.places.filter((p) => p.flow_key === flow);
    const byCh = new Map();
    for (const p of list) { if (!byCh.has(p.channel_key)) byCh.set(p.channel_key, []); byCh.get(p.channel_key).push(p); }
    mount(placesBox, h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('div', null, h('h2', null, 'Places'), h('p', null, 'The specific communities: their self-promotion rules, size and your standing there.')),
        h('button', { type: 'button', class: 'btn-ld small', onclick: () => editPlace(null) }, '+ Add place')),
      list.length ? [...byCh.entries()].map(([ch, items]) => h('div', { class: 'src-group' }, h('h3', null, chLabel(ch)),
        h('div', { class: 'rows' }, items.map((p) => h('div', { class: 'row rw' },
          h('div', { class: 'grow' },
            h('div', { class: 'title' }, isUrl(p.url) ? extLink(p.url, p.name) : p.name, h('span', { class: ['badge', p.status === 'active' && 'ok', (p.status === 'banned' || p.status === 'avoid') && 'dot'], style: { marginLeft: '8px' } }, PLACE_STATUS.find((x) => x.value === p.status)?.label)),
            h('div', { class: 'meta' }, [p.members != null ? `${p.members.toLocaleString('en-US')} members` : null, p.rules ? `Rules: ${p.rules}` : 'Rules not noted yet', p.notes || null].filter(Boolean).join(' · '))),
          h('div', { class: 'acts' }, h('button', { type: 'button', class: 'btn-ld small ghost', onclick: () => editPlace(p) }, 'Edit')))))))
        : emptyState('No places for this flow yet', ['Add the subreddits, Facebook groups, LinkedIn hashtags and Upwork categories you work in, with their self-promotion rules.'])));
  }

  function editPlace(p) {
    const st = p ? { ...p } : { flow_key: flow, channel_key: 'reddit_comment', name: '', url: '', rules: '', members: '', status: 'to_join', notes: '' };
    const inp = (k, props = {}) => { const el = h(props.rows ? 'textarea' : 'input', { type: 'text', value: st[k] ?? '', ...props }); if (props.rows) el.value = st[k] ?? ''; el.addEventListener('input', () => { st[k] = el.value; }); return el; };
    const sh = sheet({
      title: p ? p.name : 'New place',
      body: h('div', { class: 'form' },
        h('div', { class: 'form-row' }, field('Channel', select(channelOptions(flow), st.channel_key, (v) => { st.channel_key = v; })), field('Status', select(PLACE_STATUS, st.status, (v) => { st.status = v; }))),
        h('div', { class: 'form-row' }, field('Name', inp('name', { required: true, placeholder: 'r/findapath' })), field('Members', inp('members', { type: 'number', min: 0, inputmode: 'numeric' }), 'From the place itself; update now and then.')),
        field('Link', inp('url', { type: 'url', placeholder: 'https://…' })),
        field('Self-promotion rules', inp('rules', { rows: 2, placeholder: 'In your words: no links? promo thread on Fridays? ask the mods?' })),
        field('Notes', inp('notes', { rows: 2 }))),
      foot: [
        p ? h('button', { type: 'button', class: 'btn-ld danger', onclick: async () => { if (!(await confirmBox(`Delete ${p.name}?`))) return; try { await q(sb.from('places').delete().eq('id', p.id)); await reload('places'); sh.close(); paintPlaces(); } catch (e) { toast(e.message || explain(e), { error: true }); } } }, 'Delete') : null,
        h('button', { type: 'button', class: 'btn-ld primary', onclick: async () => {
          if (!String(st.name).trim()) return toast('Add a name.', { error: true });
          const row = { flow_key: flow, channel_key: st.channel_key, name: String(st.name).trim(), url: String(st.url || '').trim(), rules: String(st.rules || '').trim(), members: st.members === '' || st.members == null ? null : Math.max(0, Math.round(Number(st.members))), status: st.status, notes: String(st.notes || '').trim() };
          try {
            if (p) await q(sb.from('places').update(row).eq('id', p.id)); else await q(sb.from('places').insert(row));
            await reload('places'); sh.close(); paintPlaces(); toast('Saved');
          } catch (e) { toast(e.code === '23505' ? 'That place is already in this channel.' : e.message || explain(e), { error: true }); }
        } }, 'Save'),
      ],
    });
  }
}

// All flows: one matrix of channels × flows. Click a flow to edit it.
function overview(root, ctx) {
  const cell = (f, c) => {
    const fc = getFc(f.key, c.key);
    return h('td', null, fc.enabled ? h('span', { class: ['badge', fc.phase === 'now' && 'now'] }, `${PHASE[fc.phase]}${fc.focus === 'lead' ? ' · leading' : ''}${fc.weekly_target ? ` · ${fc.weekly_target}/wk` : ''}`) : h('span', { class: 'small' }, '–'));
  };
  mount(root,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Sources'), h('p', null, 'Every channel across the four flows. Pick a flow to change its channels, places and saved searches.')),
      h('div', { class: 'toolbar' }, refs.flows.map((f) => h('button', { type: 'button', class: 'btn-ld small', onclick: () => ctx.app.setFlow(f.key) }, `Edit ${f.name}`)))),
    h('section', { class: 'panel' }, h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl matrix' },
      h('thead', null, h('tr', null, h('th', null, 'Channel'), refs.flows.map((f) => h('th', null, f.name)))),
      h('tbody', null, refs.channels.map((c) => h('tr', null, h('td', null, c.label, h('div', { class: 'small' }, `${GROUP[c.group_key]} · ${LANE[c.lane]} lane`)), refs.flows.map((f) => cell(f, c)))))))),
    h('p', { class: 'note' }, `Saved searches: ${refs.searches.length} · Places: ${refs.places.length}. Both are per flow.`));
}
