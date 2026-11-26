// The batch logger: channel, place, action, count, optional template, for any day.
import { h, field, select, toast, today, zoned, lsGet, lsSet } from '../ui.js';
import { refs, actLabel, placesFor, templatesFor, logActivity, deleteActivity, explain, sb, q, reload } from '../db.js';
import { flowOptions, channelOptions } from './common.js';

// onLogged(row) after a save; `initial` presets fields; `edit` is an existing row to change.
export function logForm({ flow, initial = {}, edit = null, onLogged = () => {}, onSaved = () => {}, compact = false } = {}) {
  const remembered = (() => { try { return JSON.parse(lsGet('ld-log', '{}')); } catch { return {}; } })();
  const st = {
    flow_key: edit?.flow_key || initial.flow_key || (flow !== 'all' ? flow : remembered.flow_key) || refs.flows[0].key,
    channel_key: edit?.channel_key || initial.channel_key || '',
    action_key: edit?.action_key || initial.action_key || '',
    place_id: edit?.place_id || initial.place_id || '',
    template_id: edit?.template_id || initial.template_id || '',
    count: edit?.count || initial.count || 1,
    links: edit?.links || 0,
    minutes: edit?.minutes ?? '',
    day: edit ? null : today(),
    note: edit?.note || '',
  };
  if (!st.channel_key) {
    const r = remembered[st.flow_key] || {};
    st.channel_key = r.channel_key || firstChannel(st.flow_key);
    st.action_key = r.action_key || '';
    st.place_id = r.place_id || '';
  }
  const form = h('form', { class: 'form' });
  const box = h('div', { class: 'form' });
  form.append(box);
  paint();
  return form;

  function firstChannel(f) {
    const on = refs.flowChannels.filter((x) => x.flow_key === f && x.enabled && x.phase === 'now');
    return (on[0] || refs.flowChannels.find((x) => x.flow_key === f && x.enabled) || { channel_key: refs.channels[0].key }).channel_key;
  }

  function paint() {
    const ch = refs.channel.get(st.channel_key);
    const actions = ch ? ch.actions : [];
    if (!actions.includes(st.action_key)) st.action_key = (ch && ch.primary_action) || actions[0] || '';
    const places = placesFor(st.flow_key, st.channel_key);
    if (st.place_id && !places.some((p) => p.id === st.place_id)) st.place_id = '';
    const tpls = templatesFor(st.flow_key, st.channel_key, { activeOnly: !edit });
    if (st.template_id && !tpls.some((t) => t.id === st.template_id)) st.template_id = '';
    const act = refs.action.get(st.action_key);
    const trust = ch && ch.lane === 'trust' && act && act.direction === 'out';

    const num = (k, props) => {
      const el = h('input', { type: 'number', value: st[k], inputmode: 'numeric', ...props });
      el.addEventListener('input', () => { st[k] = el.value; });
      return el;
    };
    const note = h('input', { type: 'text', value: st.note, placeholder: 'Optional' });
    note.addEventListener('input', () => { st.note = note.value; });
    const dayInp = h('input', { type: 'date', value: st.day || '', max: today() });
    dayInp.addEventListener('input', () => { st.day = dayInp.value; });

    const newPlace = h('input', { type: 'text', placeholder: 'Add a place, e.g. r/findapath', 'aria-label': 'New place' });
    const addPlace = h('button', { type: 'button', class: 'btn-ld small' }, 'Add');
    addPlace.addEventListener('click', async () => {
      const name = newPlace.value.trim();
      if (!name) return;
      try {
        const [p] = await q(sb.from('places').insert({ flow_key: st.flow_key, channel_key: st.channel_key, name, status: 'active' }).select('*'));
        await reload('places');
        st.place_id = p.id; paint();
        toast(`Added ${name} to Places`);
      } catch (e) { toast(e.message || explain(e), { error: true }); }
    });

    const submit = h('button', { type: 'submit', class: 'btn-ld primary' }, edit ? 'Save' : 'Log it');
    box.replaceChildren(
      h('div', { class: 'form-row' },
        flow === 'all' || edit ? field('Flow', select(flowOptions(), st.flow_key, (v) => { st.flow_key = v; const r = remembered[v] || {}; st.channel_key = r.channel_key || firstChannel(v); paint(); })) : null,
        field('Channel', select(channelOptions(st.flow_key), st.channel_key, (v) => { st.channel_key = v; paint(); })),
        field('Action', select(actions.map((a) => ({ value: a, label: actLabel(a) })), st.action_key, (v) => { st.action_key = v; paint(); })),
        field('How many', num('count', { min: 1, max: 10000, required: true, style: { maxWidth: '120px' } }))),
      h('div', { class: 'form-row' },
        field('Place', select([{ value: '', label: places.length ? 'None' : 'No places yet' }, ...places.map((p) => ({ value: p.id, label: p.name }))], st.place_id, (v) => { st.place_id = v; })),
        trust ? field('With a link', num('links', { min: 0, max: 10000 }), 'How many of these included a link.') : null,
        field(act && act.direction === 'in' ? 'Template they replied to' : 'Template', select([{ value: '', label: tpls.length ? 'None' : 'No templates for this channel' }, ...tpls.map((t) => ({ value: t.id, label: t.name }))], st.template_id, (v) => { st.template_id = v; }))),
      compact ? null : h('div', { class: 'form-row' },
        edit ? null : field('Day', dayInp),
        field('Minutes spent', num('minutes', { min: 0, step: 'any', placeholder: act ? `about ${Math.round((act.minutes || 0) * (Number(st.count) || 1))}` : '' }), 'Optional; used for the 70/30 split.'),
        field('Note', note)),
      compact ? null : h('details', null, h('summary', { class: 'small' }, 'Add a place'), h('div', { class: 'form-row', style: { marginTop: '8px' } }, newPlace, addPlace)),
      h('div', { class: 'form-actions' }, submit));

    form.onsubmit = async (e) => {
      e.preventDefault();
      const count = Math.max(1, Math.round(Number(st.count) || 1));
      const links = Math.min(count, Math.max(0, Math.round(Number(st.links) || 0)));
      const row = {
        flow_key: st.flow_key, channel_key: st.channel_key, action_key: st.action_key, count, links: trust ? links : 0,
        place_id: st.place_id || null, template_id: st.template_id || null,
        minutes: st.minutes === '' || st.minutes == null ? null : Number(st.minutes), note: st.note.trim(),
      };
      if (!row.action_key) return toast('Pick an action.', { error: true });
      submit.disabled = true;
      try {
        if (edit) {
          const [rec] = await q(sb.from('activities').update(row).eq('id', edit.id).select('*'));
          onSaved(rec);
          toast('Saved');
        } else {
          if (st.day && st.day !== today()) row.occurred_at = zoned(st.day, '12:00').toISOString();
          const rec = await logActivity(row);
          remembered.flow_key = st.flow_key;
          remembered[st.flow_key] = { channel_key: st.channel_key, action_key: st.action_key, place_id: st.place_id };
          lsSet('ld-log', JSON.stringify(remembered));
          st.count = 1; st.links = 0; st.minutes = ''; st.note = '';
          paint();
          onLogged(rec);
          toast(`Logged ${count} × ${actLabel(row.action_key)}`, { undo: async () => { await deleteActivity(rec.id); onLogged(null); } });
        }
      } catch (err) { toast(err.message || explain(err), { error: true }); }
      finally { submit.disabled = false; }
    };
  }
}
