// Templates: per flow and channel, with copy, edit and the reply rate from the activity that used them.
import { h, mount, select, field, toast, sheet, confirmBox, copyText, fmt, pct, ratio, switchEl, emptyState } from '../ui.js';
import { sb, q, refs, reload, chLabel, flowName, explain } from '../db.js';
import { activityDays, flowOptions, channelOptions } from './common.js';

export async function render(root, ctx) {
  let channel = ctx.params.get('channel') || '';
  let showOff = false;
  const listBox = h('div');
  mount(root,
    h('div', { class: 'page-head' },
      h('div', null, h('h1', null, 'Templates'), h('p', null, '{Braces} are the parts to make personal every time.')),
      h('button', { type: 'button', class: 'btn-ld primary', onclick: () => edit(null) }, '+ New template')),
    h('div', { class: 'toolbar', style: { marginBottom: '12px' } },
      select([{ value: '', label: 'Every channel' }, ...refs.channels.filter((c) => refs.templates.some((t) => t.channel_key === c.key)).map((c) => ({ value: c.key, label: c.label }))], channel, (v) => { channel = v; paint(); }, { 'aria-label': 'Channel', style: { width: 'auto' } }),
      h('label', { class: 'check small' }, switchEl(showOff, (v) => { showOff = v; paint(); }, 'Show inactive'), 'Show inactive')),
    listBox);
  let stats = new Map();
  try {
    const rows = await activityDays({ flow: ctx.flow, cols: 'day,flow_key,channel_key,action_key,direction,template_id,place_id,n', extra: (b) => b.not('template_id', 'is', null) });
    for (const r of rows) {
      const x = stats.get(r.template_id) || { sends: 0, replies: 0 };
      if (r.direction === 'out') x.sends += r.n;
      if (r.action_key === 'reply') x.replies += r.n;
      stats.set(r.template_id, x);
    }
  } catch { stats = new Map(); }
  if (!ctx.alive()) return;
  paint();

  function paint() {
    const list = refs.templates.filter((t) => (ctx.flow === 'all' || t.flow_key === ctx.flow) && (!channel || t.channel_key === channel) && (showOff || t.active));
    if (!list.length) { mount(listBox, emptyState('No templates here', ['Add one with + New template. Pick it when you log a send, and its reply rate shows up here.'])); return; }
    const byFlow = new Map();
    for (const t of list) { if (!byFlow.has(t.flow_key)) byFlow.set(t.flow_key, []); byFlow.get(t.flow_key).push(t); }
    mount(listBox, h('div', { class: 'stack' }, [...byFlow.entries()].map(([f, items]) => h('section', { class: 'panel' },
      ctx.flow === 'all' ? h('h2', null, flowName(f)) : null,
      h('div', { class: 'rows' }, items.map((t) => card(t)))))));
  }

  function card(t) {
    const st = stats.get(t.id) || { sends: 0, replies: 0 };
    const body = h('div', { class: 'tpl-body' }, highlight(t.body));
    const more = h('button', { type: 'button', class: 'btn-ld small ghost' }, 'Show all');
    more.addEventListener('click', () => { body.classList.toggle('open'); more.textContent = body.classList.contains('open') ? 'Show less' : 'Show all'; });
    return h('div', { class: 'row', style: { display: 'block' } },
      h('div', { class: 'tpl-card' },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'baseline' } },
          h('div', null, h('div', { class: 'title' }, t.name, t.active ? null : h('span', { class: 'badge', style: { marginLeft: '6px' } }, 'inactive')),
            h('div', { class: 'meta' }, chLabel(t.channel_key), ' · ', st.sends ? `${fmt(st.sends)} sent · ${fmt(st.replies)} replies · ${pct(ratio(st.replies, st.sends))} reply rate` : 'Not used yet')),
          h('div', { class: 'acts' },
            h('button', { type: 'button', class: 'btn-ld small primary', onclick: async () => { const ok = await copyText(t.body); toast(ok ? 'Copied. Fill in the {braces} before you send.' : 'Couldn’t copy', { error: !ok }); } }, 'Copy'),
            h('button', { type: 'button', class: 'btn-ld small', onclick: () => edit(t) }, 'Edit'))),
        body, t.body.split('\n').length > 7 || t.body.length > 420 ? more : null));
  }

  function highlight(text) {
    return text.split(/(\{[^}]+\})/g).filter(Boolean).map((part) => (/^\{[^}]+\}$/.test(part) ? h('span', { class: 'ph-b' }, part) : part));
  }

  function edit(t) {
    const st = t ? { ...t } : { flow_key: ctx.flow !== 'all' ? ctx.flow : refs.flows[0].key, channel_key: channel || '', name: '', body: '', active: true };
    const name = h('input', { type: 'text', value: st.name, required: true });
    name.addEventListener('input', () => { st.name = name.value; });
    const body = h('textarea', { rows: 12 }); body.value = st.body;
    body.addEventListener('input', () => { st.body = body.value; });
    const chBox = h('div');
    const paintCh = () => chBox.replaceChildren(field('Channel', select([{ value: '', label: 'Any channel' }, ...channelOptions(st.flow_key)], st.channel_key || '', (v) => { st.channel_key = v; })));
    paintCh();
    const sh = sheet({
      title: t ? 'Edit template' : 'New template',
      body: h('div', { class: 'form' },
        h('div', { class: 'form-row' }, field('Flow', select(flowOptions(), st.flow_key, (v) => { st.flow_key = v; paintCh(); })), chBox),
        field('Name', name),
        field('Text', body, 'Cold emails need your real name, postal address, a line that it’s promotional, and an opt-out.'),
        h('label', { class: 'check' }, switchEl(st.active, (v) => { st.active = v; }, 'Active'), 'Active (offered when you log)')),
      foot: [
        t ? h('button', { type: 'button', class: 'btn-ld danger', onclick: async () => {
          if (!(await confirmBox(`Delete “${t.name}”? Its past sends keep their numbers but lose the link.`))) return;
          try { await q(sb.from('templates').delete().eq('id', t.id)); await reload('templates'); sh.close(); paint(); } catch (e) { toast(e.message || explain(e), { error: true }); }
        } }, 'Delete') : null,
        h('button', { type: 'button', class: 'btn-ld primary', onclick: async () => {
          if (!st.name.trim()) return toast('Name it first.', { error: true });
          const row = { flow_key: st.flow_key, channel_key: st.channel_key || null, name: st.name.trim(), body: st.body, active: st.active };
          try {
            if (t) await q(sb.from('templates').update(row).eq('id', t.id)); else await q(sb.from('templates').insert(row));
            await reload('templates'); sh.close(); paint(); toast('Saved');
          } catch (e) { toast(e.code === '23505' ? 'A template with that name already exists in this flow.' : e.message || explain(e), { error: true }); }
        } }, 'Save'),
      ],
    });
  }
}
