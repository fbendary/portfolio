// Plan: Now, Next and Later per flow; the weekly rhythm with the actual 70/30 split; the one-time
// setup checklist; ground rules and cold email rules by country.
import { h, mount, today, addDays, weekStart, shortDate, fmt1, pct, toast, extLink } from '../ui.js';
import { refs, flowName, getFc, saveSetting, prefs, explain } from '../db.js';
import { activityDays, scope, PHASE } from './common.js';

export async function render(root, ctx) {
  const flows = scope(ctx.flow);
  const plan = refs.settings['plan.flows'] || {};
  const rhythm = refs.settings['plan.rhythm'] || { blocks: [] };
  const rules = refs.settings['plan.rules'] || [];
  const legal = refs.settings['plan.legal'] || { rows: [] };
  const checklist = refs.settings['plan.checklist'] || [];
  const splitBox = h('div', null, h('p', { class: 'muted' }, 'Working out the split…'));
  mount(root,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Plan'), h('p', null, ctx.flow === 'all' ? 'All four flows' : flowName(ctx.flow)))),
    h('div', { class: 'stack' },
      flows.map((f) => phasesPanel(f, plan[f] || {})),
      h('div', { class: 'grid2' },
        h('section', { class: 'panel' },
          h('div', { class: 'panel-head' }, h('div', null, h('h2', null, 'Weekly rhythm'), h('p', null, rhythm.summary || ''))),
          h('ul', { class: 'rhythm' }, (rhythm.blocks || []).map((b) => h('li', null, h('b', null, b.when), h('p', null, b.what), h('span', { class: ['badge', b.focus === 'lead' && 'is-lead'] }, `${b.minutes} min · ${b.focus === 'lead' ? 'leading' : 'testing'}`)))),
          rhythm.decide ? h('p', { class: 'note' }, rhythm.decide) : null),
        h('section', { class: 'panel' },
          h('div', { class: 'panel-head' }, h('div', null, h('h2', null, 'Leading vs testing, from what you logged'), h('p', null, `Target: ${pct(prefs().lead_share || 0.7)} of the hours on leading channels. Time is what you entered, or each action’s estimate.`))),
          splitBox)),
      checklistPanel(checklist),
      h('div', { class: 'grid2' },
        h('section', { class: 'panel' }, h('h2', null, 'Ground rules'), h('ol', { class: 'rules' }, rules.map((r) => h('li', null, r)))),
        h('section', { class: 'panel' },
          h('div', { class: 'panel-head' }, h('div', null, h('h2', null, 'Cold email rules by country'), h('p', null, `Checked ${legal.checked || ''}. ${legal.note || ''}`))),
          h('div', { class: 'rows' }, (legal.rows || []).map((x) => h('div', { class: 'row', style: { alignItems: 'flex-start' } },
            h('div', { class: 'grow' }, h('div', { class: 'title' }, x.place), h('div', { class: 'meta', style: { color: 'var(--ink)' } }, x.rule), h('div', { class: 'meta' }, extLink(x.url, `Source: ${x.source}`))))))))));
  await split();

  function phasesPanel(f, p) {
    const by = { now: [], next: [], later: [] };
    for (const c of refs.channels) {
      const fc = getFc(f, c.key);
      if (fc.enabled) by[fc.phase].push({ c, fc });
    }
    return h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('div', null, h('h2', null, flowName(f)), h('p', null, p.first || '')),
        ctx.flow === 'all' ? h('button', { type: 'button', class: 'btn-ld small', onclick: () => ctx.app.setFlow(f) }, 'Open') : h('a', { class: 'btn-ld small', href: `#/sources?flow=${f}` }, 'Change channels')),
      h('div', { class: 'phase-cols' }, Object.entries(PHASE).map(([k, label]) => h('div', null,
        h('h3', null, label),
        p[k] ? h('p', { class: 'small', style: { margin: '0 0 8px' } }, p[k]) : null,
        h('ul', null, by[k].length ? by[k].map(({ c, fc }) => h('li', null, h('span', null, c.label, fc.focus === 'lead' ? h('span', { class: 'badge is-lead', style: { marginLeft: '6px' } }, 'leading') : null), h('span', { class: 'small' }, fc.weekly_target ? `${fc.weekly_target}/wk` : ''))) : h('li', { class: 'small' }, 'Nothing here'))))),
      p.watch ? h('p', { class: 'note' }, `Watch: ${p.watch}`) : null);
  }

  async function split() {
    const t = today();
    const w0 = weekStart(t);
    const from = addDays(w0, -28);
    let rows;
    try { rows = await activityDays({ from, to: t, flow: ctx.flow, cols: 'day,flow_key,channel_key,action_key,template_id,place_id,direction,minutes' }); }
    catch (e) { mount(splitBox, h('p', { class: 'muted' }, e.message || explain(e))); return; }
    if (!ctx.alive()) return;
    const weeks = [0, 1, 2, 3, 4].map((i) => addDays(w0, -7 * i));
    const calc = (wk) => {
      const end = addDays(wk, 6);
      let lead = 0, test = 0;
      for (const r of rows) {
        if (r.day < wk || r.day > end) continue;
        const fc = getFc(r.flow_key, r.channel_key);
        if (fc.focus === 'lead') lead += r.minutes || 0; else test += r.minutes || 0;
      }
      return { lead, test, total: lead + test };
    };
    const cur = calc(w0);
    const bar = (x) => x.total ? h('div', { class: 'segbar', role: 'img', 'aria-label': `Leading ${pct(x.lead / x.total)}, testing ${pct(x.test / x.total)}` },
      x.lead ? h('i', { class: 'is-lead', style: { flex: `${x.lead} 1 0` } }, x.lead / x.total > 0.14 ? `Leading ${pct(x.lead / x.total)}` : '') : null,
      x.test ? h('i', { class: 'is-test', style: { flex: `${x.test} 1 0` } }, x.test / x.total > 0.14 ? `Testing ${pct(x.test / x.total)}` : '') : null)
      : h('div', { class: 'segbar' }, h('i', { class: 'none', style: { flex: '1' } }, 'Nothing logged yet'));
    const target = prefs().lead_share || 0.7;
    const hpw = prefs().hours_per_week || 40;
    const advice = !cur.total ? 'Log as you go and the split appears here.'
      : cur.lead / cur.total < target - 0.1 ? 'More than a third of the time is going to tests. Move hours back to the leading channels, or promote a test that’s working.'
        : cur.lead / cur.total > target + 0.15 ? 'Almost everything is on leading channels. Keep about 30% for testing, or the pipeline goes stale.'
          : 'On plan.';
    mount(splitBox,
      h('div', null, h('b', null, `This week (from ${shortDate(w0)})`), h('span', { class: 'small' }, ` · ${fmt1(cur.total / 60)} h logged of about ${hpw} h`)),
      bar(cur),
      h('div', { class: 'legend' }, h('span', null, h('i', { style: { background: 'var(--s1)' } }), `Leading · ${fmt1(cur.lead / 60)} h`), h('span', null, h('i', { style: { background: 'var(--s2)' } }), `Testing · ${fmt1(cur.test / 60)} h`)),
      h('p', { class: 'note' }, advice),
      h('div', { class: 'tbl-wrap', style: { marginTop: '10px' } }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, h('th', null, 'Week of'), h('th', { class: 'r' }, 'Leading'), h('th', { class: 'r' }, 'Testing'), h('th', { class: 'r' }, 'Leading share'))),
        h('tbody', null, weeks.map((wk) => { const x = calc(wk); return h('tr', null, h('td', null, shortDate(wk)), h('td', { class: 'r' }, `${fmt1(x.lead / 60)} h`), h('td', { class: 'r' }, `${fmt1(x.test / 60)} h`), h('td', { class: 'r' }, x.total ? pct(x.lead / x.total) : '–')); })))));
  }

  function checklistPanel(sections) {
    const done = { ...(refs.settings['checklist.done'] || {}) };
    const total = sections.reduce((a, s) => a + s.items.length, 0);
    const count = () => sections.reduce((a, s) => a + s.items.filter((i) => done[i.id]).length, 0);
    const head = h('p', null, '');
    const paintHead = () => { head.textContent = `${count()} of ${total} done. Saved for every device.`; };
    paintHead();
    return h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('div', null, h('h2', null, 'One-time setup'), head)),
      h('div', { class: 'grid3' }, sections.map((s) => h('div', null,
        h('h3', { style: { fontSize: '13.5px', marginBottom: '4px' } }, s.label),
        h('ul', { class: 'checklist' }, s.items.map((i) => {
          const li = h('li', { class: done[i.id] ? 'done' : null });
          const box = h('input', { type: 'checkbox', checked: !!done[i.id], 'aria-label': i.text });
          box.addEventListener('change', async () => {
            if (box.checked) done[i.id] = today(); else delete done[i.id];
            li.classList.toggle('done', box.checked); paintHead();
            try { await saveSetting('checklist.done', done); } catch (e) { toast(e.message || explain(e), { error: true }); }
          });
          li.append(box, h('span', null, i.text, i.url ? h('span', null, ' ', extLink(i.url, 'Guide')) : null));
          return li;
        }))))));
  }
}
