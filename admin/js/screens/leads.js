// Leads: the pipeline by stage, with search and filters; the lead sheet opens from any card.
import { h, mount, select, seg, today, addDays, relDay, money, emptyState, debounce, errorBox, pct } from '../ui.js';
import { sb, all, refs, chLabel, placeName } from '../db.js';
import { STAGES, flowTag } from './common.js';
import { openLead } from './leadsheet.js';

const ACTIVE = ['new', 'contacted', 'replied', 'call_booked', 'client'];
const RANK = { new: 0, contacted: 1, replied: 2, call_booked: 3, client: 4 };

export async function render(root, ctx) {
  const f = { search: ctx.params.get('q') || '', channel: ctx.params.get('channel') || '', place: '', due: ctx.params.get('due') || 'any', closed: false };
  let leads = [];
  const boardBox = h('div');
  const funnelBox = h('div');
  const search = h('input', { type: 'search', placeholder: 'Search name, company, handle, notes', value: f.search, 'aria-label': 'Search leads' });
  search.addEventListener('input', debounce(() => { f.search = search.value.trim(); paint(); }, 200));
  const placeBox = h('span');

  mount(root,
    h('div', { class: 'page-head' },
      h('div', null, h('h1', null, 'Leads'), h('p', null, 'Every person or business you’re talking to, by stage.')),
      h('button', { type: 'button', class: 'btn-ld primary', onclick: () => openLead(null, { flow: ctx.flow, onChange: reloadLeads }) }, '+ Add lead')),
    h('div', { class: 'toolbar', style: { marginBottom: '12px' } },
      h('div', { style: { flex: '1 1 260px' } }, search),
      select([{ value: '', label: 'Every channel' }, ...refs.channels.map((c) => ({ value: c.key, label: c.label }))], f.channel, (v) => { f.channel = v; f.place = ''; paintPlaces(); paint(); }, { 'aria-label': 'Channel', style: { width: 'auto' } }),
      placeBox,
      seg([{ value: 'any', label: 'Any' }, { value: 'overdue', label: 'Overdue' }, { value: 'today', label: 'Due today' }, { value: 'week', label: 'This week' }, { value: 'none', label: 'No follow-up' }], f.due, (v) => { f.due = v; paint(); }, 'Follow-up')),
    funnelBox, boardBox);
  paintPlaces();
  await reloadLeads();

  // A lead link in the hash (#/leads/<id>) opens its sheet.
  if (ctx.sub) openLead(ctx.sub, { flow: ctx.flow, onChange: reloadLeads, onClose: () => ctx.app.setHash('leads', '', {}) });

  function paintPlaces() {
    const opts = refs.places.filter((p) => (ctx.flow === 'all' || p.flow_key === ctx.flow) && (!f.channel || p.channel_key === f.channel || (refs.channel.get(p.channel_key) || {}).platform === (refs.channel.get(f.channel) || {}).platform));
    mount(placeBox, opts.length ? select([{ value: '', label: 'Every place' }, ...opts.map((p) => ({ value: p.id, label: p.name }))], f.place, (v) => { f.place = v; paint(); }, { 'aria-label': 'Place', style: { width: 'auto' } }) : null);
  }

  async function reloadLeads() {
    boardBox.classList.add('loading');
    try {
      leads = await all((o) => {
        let b = sb.from('leads').select('id,flow_key,channel_key,place_id,name,handle,email,company,role,stage,furthest_stage,value,currency,next_follow_up,notes,created_at,last_touch_at', o);
        if (ctx.flow !== 'all') b = b.eq('flow_key', ctx.flow);
        return b.order('created_at', { ascending: false }).order('id');
      });
    } catch (e) { mount(boardBox, errorBox(e.message)); return; }
    finally { boardBox.classList.remove('loading'); }
    if (!ctx.alive()) return;
    paint();
    ctx.app.refreshCounts();
  }

  function visible() {
    const t = today(), wk = addDays(t, 7);
    const term = f.search.toLowerCase();
    return leads.filter((l) => {
      if (f.channel && l.channel_key !== f.channel) return false;
      if (f.place && l.place_id !== f.place) return false;
      if (term && ![l.name, l.company, l.handle, l.email, l.role, l.notes].some((x) => String(x || '').toLowerCase().includes(term))) return false;
      const d = l.next_follow_up;
      if (f.due === 'overdue' && !(d && d < t)) return false;
      if (f.due === 'today' && d !== t) return false;
      if (f.due === 'week' && !(d && d <= wk)) return false;
      if (f.due === 'none' && d) return false;
      return true;
    });
  }

  function paint() {
    const list = visible();
    // Funnel: how many of these leads ever reached each stage (Not now and Lost keep their furthest).
    const reached = (k) => list.filter((l) => RANK[l.furthest_stage] >= RANK[k]).length;
    const steps = ACTIVE.map((k) => ({ k, n: reached(k) }));
    mount(funnelBox, leads.length ? h('div', { class: 'funnel-strip' }, steps.map((x, i) => h('div', null,
      h('b', null, x.n), STAGES.find((s) => s.key === x.k).label === 'New' ? 'Leads' : `Reached ${STAGES.find((s) => s.key === x.k).label.toLowerCase()}`,
      i > 0 && steps[i - 1].n ? h('span', { class: 'small' }, ` · ${pct(x.n / steps[i - 1].n)}`) : null))) : null);
    if (!leads.length) {
      mount(boardBox, emptyState('No leads yet', [
        'From the Inbox: Make lead on a thread where someone needs what you offer.',
        'Or + Add lead for someone you’re already talking to (warm network, an enquiry).',
        'Each touch you log on the lead moves its stage and sets the next follow-up.']));
      return;
    }
    const by = (k) => list.filter((l) => l.stage === k);
    const closed = list.filter((l) => l.stage === 'not_now' || l.stage === 'lost');
    mount(boardBox, h('div', { class: 'board' },
      ACTIVE.map((k) => column(STAGES.find((s) => s.key === k).label, by(k))),
      column('Not now · Lost', closed, true)));
  }

  function column(label, items, closed) {
    const value = items.reduce((a, l) => a + (Number(l.value) || 0), 0);
    const cur = items.find((l) => l.value != null)?.currency || 'USD';
    const shown = closed && !f.closed ? items.slice(0, 8) : items;
    return h('section', { class: 'col', 'aria-label': label },
      h('div', { class: 'col-head' }, label, h('span', null, `${items.length}${value ? ` · ${money(value, cur)}` : ''}`)),
      shown.map((l) => card(l)),
      closed && items.length > shown.length ? h('button', { type: 'button', class: 'btn-ld small ghost', onclick: () => { f.closed = true; paint(); } }, `Show all ${items.length}`) : null,
      !items.length ? h('p', { class: 'small' }, 'None') : null);
  }

  function card(l) {
    const t = today();
    const late = l.next_follow_up && l.next_follow_up < t;
    return h('button', { type: 'button', class: 'card-ld', onclick: () => { ctx.app.setHash('leads', l.id, {}); openLead(l.id, { flow: ctx.flow, onChange: reloadLeads, onClose: () => ctx.app.setHash('leads', '', {}) }); } },
      h('b', null, l.name),
      l.company || l.role ? h('small', null, [l.role, l.company].filter(Boolean).join(' · ')) : null,
      h('small', null, flowTag(l.flow_key, ctx.flow), chLabel(l.channel_key), l.place_id ? ` · ${placeName(l.place_id)}` : '', l.stage === 'not_now' || l.stage === 'lost' ? ` · ${l.stage === 'lost' ? 'Lost' : 'Not now'}` : ''),
      l.value != null ? h('small', null, money(l.value, l.currency)) : null,
      l.next_follow_up ? h('span', { class: ['due', late && 'late'] }, late ? `Follow-up ${relDay(l.next_follow_up)}` : `Follow up ${relDay(l.next_follow_up)}`) : null);
  }
}
