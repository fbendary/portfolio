// Activity: the batch logger and the log by day, editable.
import { h, mount, sheet, toast, confirmBox, today, addDays, dayOf, longDate, timeOf, fmt, emptyState, errorBox, zoned } from '../ui.js';
import { sb, all, q, refs, chLabel, actLabel, placeName, deleteActivity, explain } from '../db.js';
import { flowTag } from './common.js';
import { logForm } from './logform.js';

export async function render(root, ctx) {
  let days = 14;
  let acts = [];
  const logBox = h('div');
  mount(root,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Activity'), h('p', null, 'Log a batch (“12 Facebook comments”), or fix anything logged by mistake.'))),
    h('div', { class: 'grid2' },
      h('div', { class: 'stack' }, logBox),
      h('div', { class: 'stack' }, h('section', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('div', null, h('h2', null, 'Log activity'), h('p', null, 'Today unless you pick another day.'))),
        logForm({ flow: ctx.flow, onLogged: () => load() })))));
  await load();

  async function load() {
    logBox.classList.add('loading');
    const since = zoned(addDays(today(), -(days - 1)), '00:00').toISOString();
    try {
      acts = await all((o) => {
        let b = sb.from('activities').select('*', o).gte('occurred_at', since);
        if (ctx.flow !== 'all') b = b.eq('flow_key', ctx.flow);
        return b.order('occurred_at', { ascending: false }).order('id');
      });
    } catch (e) { mount(logBox, errorBox(e.message)); return; }
    finally { logBox.classList.remove('loading'); }
    if (!ctx.alive()) return;
    paint();
  }

  function paint() {
    if (!acts.length) {
      mount(logBox, emptyState(`Nothing logged in the last ${days} days`, [
        'Use the quick-log chips on Today for single actions.',
        'Use the form here for batches and for other days.',
        'Replies, enquiries, calls and clients are logged the same way, or from a lead’s sheet.'],
      h('p', { style: { marginTop: '10px' } }, h('button', { type: 'button', class: 'btn-ld small', onclick: () => { days += 30; load(); } }, 'Look further back'))));
      return;
    }
    const byDay = new Map();
    for (const a of acts) { const d = dayOf(a.occurred_at); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(a); }
    mount(logBox, h('section', { class: 'panel' },
      [...byDay.entries()].map(([d, list]) => {
        const out = list.filter((a) => a.direction === 'out').reduce((x, a) => x + a.count, 0);
        const back = list.filter((a) => a.direction !== 'out').reduce((x, a) => x + a.count, 0);
        return h('div', { class: 'day' },
          h('div', { class: 'day-head' }, d === today() ? 'Today' : longDate(d), h('span', null, `${fmt(out)} out · ${fmt(back)} back`)),
          h('div', { class: 'rows' }, list.map((a) => row(a))));
      }),
      h('div', { class: 'form-actions', style: { marginTop: '12px' } }, h('button', { type: 'button', class: 'btn-ld small', onclick: () => { days += 14; load(); } }, `Show 14 more days (now ${days})`))));
  }

  function row(a) {
    const tpl = a.template_id && refs.template.get(a.template_id);
    return h('div', { class: 'row rw' },
      h('div', { class: 'grow' },
        h('div', { class: 'title' }, `${a.count > 1 ? `${fmt(a.count)} × ` : ''}${actLabel(a.action_key)}`,
          a.direction !== 'out' ? h('span', { class: 'badge is-lead', style: { marginLeft: '6px' } }, a.direction === 'in' ? 'came back' : a.direction === 'call' ? 'call' : 'win') : null),
        h('div', { class: 'meta' }, timeOf(a.occurred_at), ' · ', flowTag(a.flow_key, ctx.flow), chLabel(a.channel_key),
          a.place_id ? ` · ${placeName(a.place_id)}` : '', tpl ? ` · ${tpl.name}` : '', a.links ? ` · ${a.links} with a link` : '',
          a.lead_id ? ' · on a lead' : '', a.note ? ` · ${a.note}` : '')),
      h('div', { class: 'acts' },
        h('button', { type: 'button', class: 'btn-ld small', onclick: () => edit(a) }, 'Edit'),
        h('button', { type: 'button', class: 'btn-ld small ghost', onclick: () => remove(a) }, 'Delete')));
  }

  function edit(a) {
    const sh = sheet({ title: 'Edit activity', body: logForm({ flow: ctx.flow, edit: a, onSaved: () => { sh.close(); load(); } }) });
    const when = h('input', { type: 'date', value: dayOf(a.occurred_at), max: today() });
    sh.body.append(h('div', { class: 'form-row' }, h('label', { class: 'field' }, h('span', null, 'Move to another day'), when),
      h('div', { class: 'form-actions', style: { alignSelf: 'end' } }, h('button', { type: 'button', class: 'btn-ld small', onclick: async () => {
        try { await q(sb.from('activities').update({ occurred_at: zoned(when.value, '12:00').toISOString() }).eq('id', a.id)); sh.close(); load(); toast('Moved'); }
        catch (e) { toast(e.message || explain(e), { error: true }); }
      } }, 'Move'))));
  }

  async function remove(a) {
    if (a.lead_id && !(await confirmBox('Delete this touch? The lead keeps its current stage.'))) return;
    try {
      await deleteActivity(a.id);
      acts = acts.filter((x) => x.id !== a.id); paint();
      const { id, created_at, direction, ...rest } = a;
      toast('Deleted', { undo: async () => { await q(sb.from('activities').insert(rest)); load(); } });
    } catch (e) { toast(e.message || explain(e), { error: true }); }
  }
}
