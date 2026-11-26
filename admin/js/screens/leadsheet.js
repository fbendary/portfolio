// The lead sheet: details, one-tap touches that move the stage and set the next follow-up, and the
// timeline of every touch.
import { h, sheet, field, select, toast, confirmBox, today, dayOf, shortDate, relDay, longDate, money, isUrl, extLink, lsGet, lsSet, errorBox } from '../ui.js';
import { sb, q, refs, chLabel, flowName, actLabel, placeName, placesFor, templatesFor, logActivity, deleteActivity, explain, prefs } from '../db.js';
import { STAGES, STAGE, followUpAfter, sendAction, flowOptions, channelOptions } from './common.js';

const SNAP = ['stage', 'contacted_at', 'replied_at', 'call_booked_at', 'client_at', 'not_now_at', 'lost_at', 'next_follow_up', 'last_touch_at'];
const COUNTRIES = ['US', 'GB', 'CA', 'AU', 'NZ', 'IE'];

// Open a lead (id) or a new one (prefill). onChange runs after anything is saved.
export async function openLead(id, { prefill = {}, onChange = () => {}, onClose = () => {}, flow = 'all' } = {}) {
  let lead = null, acts = [];
  const sh = sheet({ title: id ? 'Lead' : 'New lead', onClose: () => { onChange(); onClose(); } });
  sh.body.append(h('p', { class: 'muted' }, 'Loading…'));
  try {
    if (id) {
      [lead, acts] = await Promise.all([
        q(sb.from('leads').select('*').eq('id', id).single()),
        q(sb.from('activities').select('*').eq('lead_id', id).order('occurred_at', { ascending: false }).limit(200)),
      ]);
    }
  } catch (e) {
    sh.body.replaceChildren(errorBox(e.message || explain(e)));
    return sh;
  }
  const draft = lead ? { ...lead } : {
    flow_key: prefill.flow_key || (flow !== 'all' ? flow : refs.flows[0].key),
    channel_key: prefill.channel_key || '', place_id: prefill.place_id || null, name: prefill.name || '', handle: prefill.handle || '',
    email: '', company: '', role: '', country: '', stage: prefill.stage || 'new', value: null, currency: prefs().currency || 'USD',
    next_follow_up: prefill.next_follow_up || null, notes: prefill.notes || '', source_inbox_id: prefill.source_inbox_id || null,
  };
  paint();
  return sh;

  // Touches change stage and follow-up; keep unsaved edits to the other fields.
  function sync() { if (lead) { draft.stage = lead.stage; draft.next_follow_up = lead.next_follow_up; } }

  function paint() {
    sync();
    sh.setTitle(lead ? lead.name : 'New lead');
    sh.body.replaceChildren(
      lead ? touchesPanel() : null,
      detailsForm(),
      lead ? timelinePanel() : null,
    );
  }

  // ------------------------------------------------------------ touches
  function touchesPanel() {
    const ch = lead.channel_key || 'warm';
    const send = sendAction(ch);
    const tpls = templatesFor(lead.flow_key, ch);
    const tplKey = `ld-tpl:${lead.flow_key}:${ch}`;
    const tplSel = select([{ value: '', label: 'No template' }, ...tpls.map((t) => ({ value: t.id, label: t.name }))], lsGet(tplKey, ''), (v) => lsSet(tplKey, v || null), { 'aria-label': 'Template used' });
    const btn = (label, fn, primary) => h('button', { type: 'button', class: ['btn-ld', 'small', primary && 'primary'], onclick: fn }, label);
    const due = lead.next_follow_up;
    return h('section', { class: 'panel' },
      h('div', { class: 'panel-head' },
        h('div', null, h('h2', null, `${STAGE[lead.stage]}${lead.stage === 'not_now' || lead.stage === 'lost' ? ` (reached ${STAGE[lead.furthest_stage]})` : ''}`),
          h('p', null, `${flowName(lead.flow_key)} · ${chLabel(lead.channel_key)}${due ? ` · follow up ${relDay(due)}` : ''}`))),
      h('div', { class: 'touches' },
        btn(actLabel(send), () => touch(send, tplSel.value), lead.stage === 'new'),
        btn('Followed up', () => touch('follow_up', tplSel.value)),
        btn('They replied', () => touch('reply')),
        btn('Call booked', () => touch('call_booked')),
        btn('Client won', () => touch('client_won')),
        btn('Not now', () => setStage('not_now')),
        btn('Lost', () => setStage('lost'))),
      tpls.length ? h('div', { class: 'form-row', style: { marginTop: '10px' } }, field('Template for messages', tplSel, 'Counts toward that template’s reply rate.')) : null);
  }

  async function touch(actionKey, templateId) {
    const before = Object.fromEntries(SNAP.map((k) => [k, lead[k]]));
    let template_id = templateId || null;
    if (actionKey === 'reply' && !template_id) {
      const lastOut = acts.find((a) => a.direction === 'out' && a.template_id);
      template_id = lastOut ? lastOut.template_id : null;
    }
    try {
      const rec = await logActivity({ flow_key: lead.flow_key, channel_key: lead.channel_key || 'warm', place_id: lead.place_id, action_key: actionKey, count: 1, lead_id: lead.id, template_id });
      const next = followUpAfter(actionKey, lead.channel_key);
      const patch = { next_follow_up: next };
      if (actionKey === 'client_won' || actionKey === 'call_booked') patch.next_follow_up = null;
      const [updated] = await q(sb.from('leads').update(patch).eq('id', lead.id).select('*'));
      lead = updated; acts.unshift(rec);
      paint(); onChange();
      toast(`${actLabel(actionKey)} · ${STAGE[lead.stage]}${lead.next_follow_up ? `, follow up ${relDay(lead.next_follow_up)}` : ''}`, {
        undo: async () => {
          await deleteActivity(rec.id);
          const [back] = await q(sb.from('leads').update(before).eq('id', lead.id).select('*'));
          lead = back; acts = acts.filter((a) => a.id !== rec.id);
          if (sh.el.open) paint();
          onChange();
        },
      });
    } catch (e) { toast(e.message || explain(e), { error: true }); }
  }

  async function setStage(stage) {
    const before = Object.fromEntries(SNAP.map((k) => [k, lead[k]]));
    const patch = { stage, next_follow_up: stage === 'not_now' ? addDaysSafe(60) : null };
    try {
      const [updated] = await q(sb.from('leads').update(patch).eq('id', lead.id).select('*'));
      lead = updated; paint(); onChange();
      toast(`${STAGE[stage]}${stage === 'not_now' ? ': a check-in is set for two months from now' : ''}`, {
        undo: async () => { const [back] = await q(sb.from('leads').update(before).eq('id', lead.id).select('*')); lead = back; if (sh.el.open) paint(); onChange(); },
      });
    } catch (e) { toast(e.message || explain(e), { error: true }); }
  }

  // ------------------------------------------------------------ details
  function detailsForm() {
    const inp = (k, props = {}) => {
      const el = h('input', { type: 'text', value: draft[k] ?? '', ...props });
      el.addEventListener('input', () => { draft[k] = el.value; if (k === 'country' || k === 'company') warnBox.replaceChildren(...warnings()); });
      return el;
    };
    const placeSel = h('div');
    const paintPlaces = () => {
      const opts = placesFor(draft.flow_key, draft.channel_key).map((p) => ({ value: p.id, label: p.name }));
      placeSel.replaceChildren(field('Place', select([{ value: '', label: 'None' }, ...opts], draft.place_id || '', (v) => { draft.place_id = v || null; })));
    };
    const chanBox = h('div');
    const paintChannels = () => chanBox.replaceChildren(field('Channel', select([{ value: '', label: 'Choose…' }, ...channelOptions(draft.flow_key)], draft.channel_key || '', (v) => { draft.channel_key = v; paintPlaces(); warnBox.replaceChildren(...warnings()); })));
    paintChannels(); paintPlaces();
    const warnBox = h('div');
    warnBox.replaceChildren(...warnings());
    const country = inp('country', { list: 'ld-countries', maxlength: 2, placeholder: 'US', autocapitalize: 'characters' });
    const save = h('button', { type: 'submit', class: 'btn-ld primary' }, lead ? 'Save details' : 'Add lead');
    const form = h('form', { class: 'form', onsubmit: async (e) => { e.preventDefault(); await saveDetails(save); } },
      h('div', { class: 'form-row' },
        field('Name', inp('name', { required: true, maxlength: 200, placeholder: 'Person or business' })),
        field('Handle or profile URL', inp('handle', { placeholder: '@name or https://…' }))),
      h('div', { class: 'form-row' },
        field('Flow', select(flowOptions(), draft.flow_key, (v) => { draft.flow_key = v; paintChannels(); paintPlaces(); })),
        chanBox, placeSel),
      h('div', { class: 'form-row' },
        field('Company', inp('company')), field('Role', inp('role')), field('Country', country, 'Two letters: US, GB, CA…')),
      h('div', { class: 'form-row' },
        field('Email', inp('email', { type: 'email', placeholder: 'Only an address they published' })),
        field('Value (optional)', inp('value', { type: 'number', min: 0, step: 'any', inputmode: 'decimal' })),
        field('Currency', inp('currency', { maxlength: 3, autocapitalize: 'characters' }))),
      h('div', { class: 'form-row' },
        field('Next follow-up', inp('next_follow_up', { type: 'date' })),
        field('Stage', select(STAGES.map((x) => ({ value: x.key, label: x.label })), draft.stage, (v) => { draft.stage = v; }), lead ? 'Corrections only: touches above move it for you.' : null)),
      field('Notes', (() => { const t = h('textarea', { rows: 3 }, draft.notes || ''); t.addEventListener('input', () => { draft.notes = t.value; }); return t; })()),
      warnBox,
      h('datalist', { id: 'ld-countries' }, COUNTRIES.map((c) => h('option', { value: c }))),
      h('div', { class: 'form-actions' }, save,
        lead ? h('button', { type: 'button', class: 'btn-ld danger', onclick: removeLead }, 'Delete lead') : null,
        lead && isUrl(lead.handle) ? extLink(lead.handle, 'Open profile', 'btn-ld') : null));
    return h('section', { class: lead ? 'panel flat' : null }, lead ? h('h2', { style: { fontSize: '15px', marginBottom: '10px' } }, 'Details') : null, form);
  }

  function warnings() {
    const out = [];
    const ctry = String(draft.country || '').trim().toUpperCase();
    if (draft.channel_key === 'cold_email' && ctry && ctry !== 'US' && !String(draft.company || '').trim()) {
      out.push(h('div', { class: 'warnline' }, 'Cold email to private individuals is for US addresses only. Outside the US, write only to business contacts (add the company), under that country’s rules on the Plan tab.'));
    }
    return out;
  }

  async function saveDetails(btn) {
    const row = {
      flow_key: draft.flow_key, channel_key: draft.channel_key || null, place_id: draft.place_id || null,
      name: String(draft.name || '').trim(), handle: String(draft.handle || '').trim(), email: String(draft.email || '').trim(),
      company: String(draft.company || '').trim(), role: String(draft.role || '').trim(), country: String(draft.country || '').trim().toUpperCase(),
      value: draft.value === '' || draft.value == null ? null : Number(draft.value), currency: String(draft.currency || 'USD').trim().toUpperCase() || 'USD',
      next_follow_up: draft.next_follow_up || null, notes: draft.notes || '', stage: draft.stage || 'new',
    };
    if (!row.name) return toast('Add a name first.', { error: true });
    btn.disabled = true;
    try {
      if (lead) {
        const [updated] = await q(sb.from('leads').update(row).eq('id', lead.id).select('*'));
        lead = updated; Object.assign(draft, updated);
        toast('Saved');
      } else {
        row.source_inbox_id = draft.source_inbox_id || null;
        const [created] = await q(sb.from('leads').insert(row).select('*'));
        lead = created; Object.assign(draft, created);
        toast(`Added ${created.name}`);
      }
      paint(); onChange();
    } catch (e) { toast(e.message || explain(e), { error: true }); }
    finally { btn.disabled = false; }
  }

  async function removeLead() {
    if (!(await confirmBox(`Delete ${lead.name}?`))) return;
    try {
      await q(sb.from('leads').delete().eq('id', lead.id));
      toast('Lead deleted. Its touches stay in the activity log.');
      sh.close();
    } catch (e) { toast(e.message || explain(e), { error: true }); }
  }

  // ------------------------------------------------------------ timeline
  function timelinePanel() {
    const items = acts.map((a) => ({ at: a.occurred_at, el: [h('span', null, `${actLabel(a.action_key)}${a.count > 1 ? ` ×${a.count}` : ''}`),
      a.template_id && refs.template.get(a.template_id) ? h('span', { class: 'muted' }, ` · ${refs.template.get(a.template_id).name}`) : null,
      a.note ? h('div', { class: 'muted' }, a.note) : null] }));
    const stamps = [['created_at', 'Lead added'], ['contacted_at', 'Reached Contacted'], ['replied_at', 'Reached Replied'], ['call_booked_at', 'Reached Call booked'], ['client_at', 'Became a client'], ['not_now_at', 'Marked Not now'], ['lost_at', 'Marked Lost']];
    for (const [k, label] of stamps) if (lead[k]) items.push({ at: lead[k], el: [h('span', { class: 'stamp' }, label)] });
    items.sort((a, b) => (a.at < b.at ? 1 : -1));
    return h('section', null,
      h('h2', { style: { fontSize: '15px', marginBottom: '6px' } }, 'Timeline'),
      h('div', { class: 'kv', style: { marginBottom: '8px' } },
        kv('Added', shortDate(dayOf(lead.created_at))), kv('Last touch', lead.last_touch_at ? relDay(dayOf(lead.last_touch_at)) : 'none yet'),
        kv('Value', lead.value != null ? money(lead.value, lead.currency) : 'not set'), kv('Place', placeName(lead.place_id) || 'none')),
      h('ul', { class: 'timeline' }, items.map((x) => h('li', null, h('time', { datetime: x.at }, longDate(dayOf(x.at))), h('div', null, x.el)))));
  }
}

function kv(k, v) { return h('div', null, h('span', null, k), v); }
function addDaysSafe(n) { const d = new Date(`${today()}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
