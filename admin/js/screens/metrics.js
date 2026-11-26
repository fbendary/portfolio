// Metrics: what I put out (Output), what came back (Response), platform numbers (Audience), the
// portfolio site (Site), the weekly entry form and the CSV import. One period switch scopes them all.
import { h, mount, seg, select, field, toast, today, addDays, weekStart, daysBetween, shortDate, dayOf, fmt, fmt1, pct, ratio, delta, sheet, confirmBox, errorBox, emptyState, lsGet, lsSet, debounce, switchEl } from '../ui.js';
import { sb, q, all, refs, chLabel, flowName, placeName, flowChannels, explain, saveSetting } from '../db.js';
import { activityDays, sum, groupSum } from './common.js';
import { columns, lines, spark, table, SERIES, OTHER } from '../charts.js';
import { parseCsv, toNumber, toDay } from '../parse.js';

const TABS = [
  { value: 'output', label: 'Output' }, { value: 'response', label: 'Response' }, { value: 'audience', label: 'Audience' },
  { value: 'site', label: 'Site' }, { value: 'entry', label: 'Enter numbers' }, { value: 'csv', label: 'Import CSV' },
];
const PERIODS = [{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: 'all', label: 'All' }];

export async function render(root, ctx) {
  let tab = TABS.some((x) => x.value === ctx.sub) ? ctx.sub : 'output';
  let period = PERIODS.some((x) => x.value === ctx.params.get('p')) ? ctx.params.get('p') : lsGet('ld-period', '30');
  const body = h('div');
  const periodSeg = seg(PERIODS, period, (v) => { period = v; lsSet('ld-period', v); sync(); load(); }, 'Period');
  mount(root,
    h('div', { class: 'page-head' },
      h('div', null, h('h1', null, 'Metrics'), h('p', null, ctx.flow === 'all' ? 'All flows' : flowName(ctx.flow))),
      h('div', { class: 'toolbar' }, periodSeg)),
    h('div', { class: 'toolbar', style: { marginBottom: '14px' } }, seg(TABS, tab, (v) => { tab = v; sync(); load(); }, 'Metrics view')),
    body);
  await load();

  function sync() { ctx.app.setHash('metrics', tab === 'output' ? '' : tab, period === lsGet('ld-period', '30') ? {} : { p: period }); }

  async function load() {
    body.classList.add('loading');
    try {
      const r = range(period);
      const views = { output, response, audience, site, entry, csv };
      const el = await views[tab](r);
      if (!ctx.alive()) return;
      mount(body, el);
    } catch (e) {
      console.error(e);
      mount(body, errorBox(e.message || explain(e)));
    } finally { body.classList.remove('loading'); }
  }

  // ------------------------------------------------------------ periods and buckets
  function range(p) {
    const t = today();
    if (p === 'all') return { from: null, to: t, prevFrom: null, prevTo: null, days: null, label: 'all time' };
    const n = Number(p);
    const from = addDays(t, -(n - 1));
    return { from, to: t, prevFrom: addDays(from, -n), prevTo: addDays(from, -1), days: n, label: `the previous ${n} days` };
  }
  function buckets(r, firstDay) {
    const start = r.from || firstDay || addDays(r.to, -83);
    const span = daysBetween(start, r.to) + 1;
    const kind = span <= 14 ? 'day' : span <= 7 * 30 ? 'week' : 'month';
    const of = (d) => (kind === 'day' ? d : kind === 'week' ? weekStart(d) : `${d.slice(0, 7)}-01`);
    const list = [];
    if (kind === 'month') {
      let [y, m] = start.split('-').map(Number);
      const [ey, em] = r.to.split('-').map(Number);
      while (y < ey || (y === ey && m <= em)) { list.push(`${y}-${String(m).padStart(2, '0')}-01`); m++; if (m > 12) { m = 1; y++; } }
    } else {
      for (let d = of(start); d <= r.to; d = addDays(d, kind === 'day' ? 1 : 7)) list.push(d);
    }
    const label = (b) => (kind === 'month' ? new Date(`${b}T12:00:00Z`).toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }) : shortDate(b));
    const title = (b) => (kind === 'day' ? shortDate(b) : kind === 'week' ? `Week of ${shortDate(b)}` : label(b));
    return { kind, list, of, label, title };
  }
  function inCur(r) { return (x) => (!r.from || x.day >= r.from) && x.day <= r.to; }
  function inPrev(r) { return (x) => !!r.prevFrom && x.day >= r.prevFrom && x.day <= r.prevTo; }

  function stat(label, cur, prev, r, opts = {}) {
    const d = delta(cur, prev, { ...opts, span: r.label });
    return h('div', { class: 'stat' }, h('div', { class: 'l' }, label), h('div', { class: 'v' }, opts.text || fmt(cur)),
      h('div', { class: ['d', d.cls] }, r.prevFrom ? d.text || '–' : opts.note || ''));
  }

  function chartPanel(title, sub, chartEl, tableEl, note) {
    const box = h('div');
    let mode = 'chart';
    const paint = () => mount(box, mode === 'chart' ? chartEl : tableEl);
    paint();
    return h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('div', null, h('h2', null, title), sub ? h('p', null, sub) : null),
        seg([{ value: 'chart', label: 'Chart' }, { value: 'table', label: 'Table' }], mode, (v) => { mode = v; paint(); }, `${title} view`)),
      box, note ? h('p', { class: 'note' }, note) : null);
  }

  // Stable colours: each flow's channel order from Sources, first six get a hue, the rest are Other.
  function channelColors() {
    const order = [];
    if (ctx.flow === 'all') {
      const score = new Map();
      for (const fc of refs.flowChannels) if (fc.enabled) score.set(fc.channel_key, (score.get(fc.channel_key) || 0) + (fc.phase === 'now' ? 10 : fc.phase === 'next' ? 3 : 1) + (fc.focus === 'lead' ? 5 : 0));
      order.push(...[...score.entries()].sort((a, b) => b[1] - a[1] || refs.channel.get(a[0]).sort - refs.channel.get(b[0]).sort).map((x) => x[0]));
    } else order.push(...flowChannels(ctx.flow).map((x) => x.c.key));
    return new Map(order.slice(0, 6).map((k, i) => [k, SERIES[i]]));
  }

  // ------------------------------------------------------------ output
  async function output(r) {
    const rows = await activityDays({ from: r.prevFrom || r.from, to: r.to, flow: ctx.flow });
    const out = rows.filter((x) => x.direction === 'out');
    const cur = out.filter(inCur(r)), prev = out.filter(inPrev(r));
    const first = (list) => sum(list.filter((x) => x.first_touch));
    const hours = (list) => sum(list, (x) => x.minutes) / 60;
    if (!rows.length) return emptyState('Nothing logged in this period', ['Log from Today’s chips or the Activity screen; output shows up here by channel and week.']);
    const firstDay = rows.length ? rows[0].day : null;
    const b = buckets(r, firstDay);
    const colors = channelColors();
    const byCh = groupSum(cur, 'channel_key');
    const series = [...colors.entries()].filter(([k]) => byCh.get(k)).map(([k, color]) => ({ key: k, label: chLabel(k), color, values: b.list.map((bk) => sum(cur.filter((x) => x.channel_key === k && b.of(x.day) === bk))) }));
    const otherKeys = [...byCh.keys()].filter((k) => !colors.has(k));
    if (otherKeys.length) series.push({ key: 'other', label: `Other (${otherKeys.length})`, color: OTHER, values: b.list.map((bk) => sum(cur.filter((x) => otherKeys.includes(x.channel_key) && b.of(x.day) === bk))) });
    const chRows = [...byCh.entries()].sort((a, b2) => b2[1] - a[1]);
    const tbl = table(['Channel', ...b.list.map(b.label), 'Total'],
      chRows.map(([k]) => [h('span', null, h('i', { class: 'swatch', style: { background: colors.get(k) || OTHER } }), chLabel(k)), ...b.list.map((bk) => fmt(sum(cur.filter((x) => x.channel_key === k && b.of(x.day) === bk)))), fmt(byCh.get(k))]),
      { foot: ['Total', ...b.list.map((bk) => fmt(sum(cur.filter((x) => b.of(x.day) === bk)))), fmt(sum(cur))] });
    const byAction = [...groupSum(cur, 'action_key').entries()].sort((a, b2) => b2[1] - a[1]);
    return h('div', { class: 'stack' },
      h('div', { class: 'stats' },
        stat('Output', sum(cur), r.prevFrom ? sum(prev) : null, r),
        stat('First touches', first(cur), r.prevFrom ? first(prev) : null, r),
        stat('Time, estimated', hours(cur), r.prevFrom ? hours(prev) : null, r, { text: `${fmt1(hours(cur))} h` }),
        stat('Channels used', byCh.size, r.prevFrom ? groupSum(prev, 'channel_key').size : null, r)),
      chartPanel('Output by channel', `Everything you put out, by ${b.kind}`, columns({ labels: b.list, series, xLabel: b.label, tipTitle: b.title }), tbl,
        'Colours follow each flow’s channel order under Sources; channels past the first six are grouped as Other. The table has every channel.'),
      h('section', { class: 'panel' }, h('h2', null, 'By action'),
        table(['Action', 'This period', r.prevFrom ? 'Previous' : null].filter(Boolean),
          byAction.map(([k, n]) => [refs.action.get(k)?.label || k, fmt(n), r.prevFrom ? fmt(sum(prev.filter((x) => x.action_key === k))) : null].filter((x) => x !== null)))));
  }

  // ------------------------------------------------------------ response
  async function response(r) {
    const [rows, leads] = await Promise.all([
      activityDays({ from: r.prevFrom || r.from, to: r.to, flow: ctx.flow }),
      all((o) => {
        let b = sb.from('leads').select('id,flow_key,channel_key,place_id,created_at,furthest_stage,contacted_at,replied_at,call_booked_at,client_at', o);
        if (r.prevFrom || r.from) b = b.gte('created_at', new Date(`${addDays(r.prevFrom || r.from, -1)}T00:00:00Z`).toISOString());
        if (ctx.flow !== 'all') b = b.eq('flow_key', ctx.flow);
        return b.order('created_at').order('id');
      }),
    ]);
    const L = leads.map((l) => ({ ...l, day: dayOf(l.created_at) }));
    const cur = rows.filter(inCur(r)), prev = rows.filter(inPrev(r));
    const lc = L.filter(inCur(r)), lp = L.filter(inPrev(r));
    const m = (list, leadList) => ({
      first: sum(list.filter((x) => x.direction === 'out' && x.first_touch)),
      replies: sum(list.filter((x) => x.action_key === 'reply')),
      enquiries: sum(list.filter((x) => x.action_key === 'enquiry')),
      calls: sum(list.filter((x) => x.direction === 'call')),
      clients: sum(list.filter((x) => x.direction === 'win')),
      leads: leadList.length,
    });
    const a = m(cur, lc), p = m(prev, lp);
    if (!rows.length && !L.length) return emptyState('Nothing to measure yet', ['Replies, enquiries, calls and clients come from touches on leads and from the Activity log.']);
    const rates = (x) => ({ reply: ratio(x.replies, x.first), lead: ratio(x.leads, x.first), close: ratio(x.clients, x.leads) });
    const ra = rates(a), rp = rates(p);
    const rateTile = (label, v, pv, help) => h('div', { class: 'stat' }, h('div', { class: 'l' }, label), h('div', { class: 'v' }, pct(v)),
      h('div', { class: 'd' }, r.prevFrom && pv != null && v != null ? `${v === pv ? 'Same as' : v > pv ? '▲ from' : '▼ from'} ${pct(pv)} in ${r.label}` : help));

    // by channel
    const chKeys = new Set([...cur.map((x) => x.channel_key), ...lc.map((l) => l.channel_key).filter(Boolean)]);
    const chTable = [...chKeys].map((k) => {
      const x = m(cur.filter((y) => y.channel_key === k), lc.filter((l) => l.channel_key === k));
      return { k, ...x, ...rates(x) };
    }).sort((x, y) => y.first - x.first || y.replies - x.replies);

    // by template
    const tplIds = new Set(cur.filter((x) => x.template_id).map((x) => x.template_id));
    const tplRows = [...tplIds].map((id) => {
      const sends = sum(cur.filter((x) => x.template_id === id && x.direction === 'out'));
      const replies = sum(cur.filter((x) => x.template_id === id && x.action_key === 'reply'));
      const t = refs.template.get(id);
      return { id, name: t ? t.name : 'Deleted template', ch: t ? chLabel(t.channel_key) : '', flow: t ? flowName(t.flow_key) : '', sends, replies, rate: ratio(replies, sends) };
    }).sort((x, y) => y.sends - x.sends);

    // by place
    const plIds = new Set([...cur.filter((x) => x.place_id).map((x) => x.place_id), ...lc.filter((l) => l.place_id).map((l) => l.place_id)]);
    const plRows = [...plIds].map((id) => {
      const list = cur.filter((x) => x.place_id === id);
      return { id, out: sum(list.filter((x) => x.direction === 'out')), back: sum(list.filter((x) => x.direction === 'in')), leads: lc.filter((l) => l.place_id === id).length };
    }).sort((x, y) => y.back - x.back || y.leads - x.leads || y.out - x.out);

    // cohort funnel for leads added this period
    const steps = [['Leads added', lc.length], ['Reached contacted', lc.filter((l) => l.contacted_at).length], ['Reached replied', lc.filter((l) => l.replied_at).length], ['Call booked', lc.filter((l) => l.call_booked_at).length], ['Became clients', lc.filter((l) => l.client_at).length]];
    const top = Math.max(1, steps[0][1]);
    const funnel = h('div', { class: 'meters' }, steps.map(([label, n], i) => h('div', { class: 'meter-row' }, h('span', null, label),
      h('span', { class: 'v' }, h('b', null, fmt(n)), i > 0 && steps[i - 1][1] ? ` · ${pct(n / steps[i - 1][1])}` : ''),
      h('div', { class: 'meter' }, h('i', { style: { width: `${Math.round((n / top) * 100)}%` } })))));

    return h('div', { class: 'stack' },
      h('div', { class: 'stats' },
        stat('Replies', a.replies, r.prevFrom ? p.replies : null, r),
        stat('Enquiries', a.enquiries, r.prevFrom ? p.enquiries : null, r),
        stat('Calls booked', a.calls, r.prevFrom ? p.calls : null, r),
        stat('Clients', a.clients, r.prevFrom ? p.clients : null, r),
        stat('New leads', a.leads, r.prevFrom ? p.leads : null, r)),
      h('div', { class: 'stats' },
        rateTile('Reply rate', ra.reply, rp.reply, 'Replies ÷ first touches'),
        rateTile('Lead rate', ra.lead, rp.lead, 'New leads ÷ first touches'),
        rateTile('Close rate', ra.close, rp.close, 'Clients ÷ new leads')),
      h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('div', null, h('h2', null, 'By channel'), h('p', null, 'First touches leave out follow-ups. A channel with output and no replies after two weeks is a candidate to cut.'))),
        chTable.length ? table(['Channel', 'First touches', 'Replies', 'Reply rate', 'Enquiries', 'New leads', 'Lead rate', 'Calls', 'Clients', 'Close rate'],
          chTable.map((x) => [chLabel(x.k), fmt(x.first), fmt(x.replies), pct(x.reply), fmt(x.enquiries), fmt(x.leads), pct(x.lead), fmt(x.calls), fmt(x.clients), pct(x.close)]),
          { foot: ['Total', fmt(a.first), fmt(a.replies), pct(ra.reply), fmt(a.enquiries), fmt(a.leads), pct(ra.lead), fmt(a.calls), fmt(a.clients), pct(ra.close)] }) : h('p', { class: 'muted' }, 'No channel data in this period.')),
      h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('div', null, h('h2', null, 'By template'), h('p', null, 'Sends and the replies attributed to them (a reply on a lead counts for the last template you sent it).'))),
        tplRows.length ? table(['Template', 'Channel', ctx.flow === 'all' ? 'Flow' : null, 'Sends', 'Replies', 'Reply rate'].filter(Boolean),
          tplRows.map((x) => [x.name, x.ch, ctx.flow === 'all' ? x.flow : null, fmt(x.sends), fmt(x.replies), pct(x.rate)].filter((v) => v !== null)), { numericFrom: ctx.flow === 'all' ? 3 : 2 })
          : h('p', { class: 'muted' }, 'No template used in this period. Pick one when you log a send, or on a lead’s touches.')),
      plRows.length ? h('section', { class: 'panel' }, h('h2', null, 'By place'),
        table(['Place', 'Out', 'Came back', 'New leads'], plRows.map((x) => [placeName(x.id) || 'Deleted place', fmt(x.out), fmt(x.back), fmt(x.leads)]))) : null,
      h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('div', null, h('h2', null, 'Leads added this period: how far they got'), h('p', null, 'Not now and Lost count at the furthest stage they reached.'))), funnel));
  }

  // ------------------------------------------------------------ audience
  async function audience(r) {
    const since = addDays(r.to, -7 * 26);
    const histFrom = r.prevFrom && r.prevFrom < since ? r.prevFrom : (r.from ? since : null);
    const [values, fbRows, pv] = await Promise.all([
      all((o) => sb.from('metric_values').select('*', o).order('period_start').order('id')),
      activityDays({ from: histFrom, to: r.to, flow: ctx.flow, cols: 'day,flow_key,channel_key,action_key,template_id,place_id,n', extra: (b) => b.in('channel_key', ['fb_group_comment', 'fb_group_post']) }),
      all((o) => { let b = sb.from('page_view_days').select('day,entry,utm_source,utm_campaign,referrer_host,n', o); if (histFrom) b = b.gte('day', histFrom); return b.order('day').order('referrer_host').order('utm_source').order('utm_campaign').order('entry'); }),
    ]);
    const vals = ctx.flow === 'all' ? values : values.filter((v) => !v.flow_key || v.flow_key === ctx.flow);
    const weekly = (list, pick) => { const mm = new Map(); for (const x of list) { const w = weekStart(x.day); mm.set(w, (mm.get(w) || 0) + pick(x)); } return mm; };
    const series = (def) => {
      // → Map(source → [{ week, value }]) sorted by week
      const out = new Map();
      if (def.source === 'auto' && def.importer === 'activities') {
        const c = def.config || {};
        const mm = weekly(fbRows.filter((x) => x.channel_key === c.channel && (!c.action || x.action_key === c.action)), (x) => x.n);
        out.set('activities', [...mm.entries()].sort().map(([week, value]) => ({ week, value })));
      } else if (def.source === 'auto' && def.importer === 'page_views') {
        const c = def.config || {};
        const list = pv.filter((x) => (!c.entry || x.entry) && (!c.utm || x.utm_source));
        const mm = weekly(list, (x) => x.n);
        out.set('page_views', [...mm.entries()].sort().map(([week, value]) => ({ week, value })));
      } else {
        for (const v of vals.filter((x) => x.metric_key === def.key)) {
          if (!out.has(v.source)) out.set(v.source, []);
          out.get(v.source).push({ week: v.period_start, value: Number(v.value) });
        }
      }
      return out;
    };
    const summarize = (def, pts) => {
      const cur = pts.filter((x) => (!r.from || x.week >= weekStart(r.from)) && x.week <= r.to);
      const prev = r.prevFrom ? pts.filter((x) => x.week >= weekStart(r.prevFrom) && x.week < weekStart(r.from)) : [];
      if (def.aggregate === 'last') return { cur: cur.length ? cur[cur.length - 1].value : null, prev: prev.length ? prev[prev.length - 1].value : null };
      return { cur: cur.length ? cur.reduce((a, x) => a + x.value, 0) : null, prev: prev.length ? prev.reduce((a, x) => a + x.value, 0) : null };
    };
    const weeksAxis = []; for (let w = weekStart(addDays(r.to, -7 * 11)); w <= r.to; w = addDays(w, 7)) weeksAxis.push(w);
    const platforms = [...new Set(refs.metrics.map((d) => d.platform))];
    return h('div', { class: 'stack' },
      h('p', { class: 'muted', style: { margin: 0 } }, `Totals for the period (or the latest value, for counts like followers)${r.prevFrom ? `, compared with ${r.label}` : ''}. Click a tile for its history.`),
      platforms.map((plat) => h('section', { class: 'panel' }, h('h2', null, plat),
        h('div', { class: 'metric-grid' }, refs.metrics.filter((d) => d.platform === plat).map((def) => {
          if (def.aggregate === 'list') return referrersTile(def, pv.filter((x) => x.entry && (!r.from || x.day >= r.from)));
          const bySrc = series(def);
          const srcs = [...bySrc.keys()];
          const main = srcs.includes('manual') ? 'manual' : srcs[0];
          const pts = main ? bySrc.get(main) : [];
          const sm = summarize(def, pts);
          const d = delta(sm.cur ?? 0, sm.prev, { span: r.label });
          const others = srcs.filter((x) => x !== main).map((src) => `${src}: ${fmt(summarize(def, bySrc.get(src)).cur)}`);
          return h('button', { type: 'button', class: 'metric', style: { textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }, onclick: () => showHistory(def, bySrc) },
            h('div', { class: 'l' }, h('span', null, def.label), h('span', { class: 'badge' }, def.source === 'auto' ? 'automatic' : main ? main : 'manual')),
            h('div', { class: 'v' }, sm.cur == null ? '–' : fmt(sm.cur)),
            h('div', { class: ['d', d.cls === 'up' ? 'up' : d.cls === 'down' ? 'down' : ''] }, sm.cur == null ? (def.source === 'auto' ? 'Nothing recorded yet' : 'Not entered yet: Enter numbers') : r.prevFrom && sm.prev != null ? d.text : def.aggregate === 'last' ? 'Latest value' : 'Total'),
            spark(weeksAxis.map((w) => { const x = pts.find((p) => p.week === w); return x ? x.value : null; }), { label: `${def.label}, last 12 weeks` }),
            others.length ? h('div', { class: 'd' }, `Also ${others.join(' · ')}`) : null);
        })))));

    function referrersTile(def, list) {
      const by = [...groupSum(list, (x) => x.referrer_host || 'Direct or unknown').entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      return h('div', { class: 'metric' }, h('div', { class: 'l' }, h('span', null, def.label), h('span', { class: 'badge' }, 'automatic')),
        by.length ? h('div', null, by.map(([k, n]) => h('div', { class: 'd', style: { display: 'flex', justifyContent: 'space-between', gap: '8px' } }, h('span', null, k), h('b', { class: 'num' }, fmt(n)))))
          : h('div', { class: 'd' }, 'No visits recorded in this period.'));
    }

    function showHistory(def, bySrc) {
      const srcs = [...bySrc.keys()];
      const weeks = [...new Set(srcs.flatMap((s2) => bySrc.get(s2).map((x) => x.week)))].sort();
      const sh = sheet({ title: `${def.platform}: ${def.label}` });
      if (!weeks.length) { sh.body.append(emptyState('No values yet', [def.source === 'auto' ? 'This one fills in by itself as you log activity or as visits come in.' : 'Add one under Metrics → Enter numbers, or import a CSV.'])); return; }
      sh.body.append(lines({ labels: weeks, series: srcs.map((src, i) => ({ label: src, color: SERIES[i], values: weeks.map((w) => bySrc.get(src).find((x) => x.week === w)?.value ?? null) })), xLabel: shortDate, tipTitle: (w) => `Week of ${shortDate(w)}` }));
      if (def.source !== 'auto') {
        const rowsList = vals.filter((v) => v.metric_key === def.key).sort((a, b) => (a.period_start < b.period_start ? 1 : -1));
        sh.body.append(table(['Week', 'Value', 'Source', ''], rowsList.map((v) => [shortDate(v.period_start), fmt(Number(v.value)), v.source,
          h('button', { type: 'button', class: 'btn-ld small ghost', onclick: async () => { if (!(await confirmBox('Delete this value?'))) return; await q(sb.from('metric_values').delete().eq('id', v.id)); sh.close(); load(); } }, 'Delete')]), { numericFrom: 1 }));
      }
    }
  }

  // ------------------------------------------------------------ site
  async function site(r) {
    const rows = await all((o) => {
      let b = sb.from('page_view_days').select('*', o);
      if (r.prevFrom || r.from) b = b.gte('day', r.prevFrom || r.from);
      return b.order('day').order('path').order('host').order('referrer_host').order('utm_source').order('utm_medium').order('utm_campaign').order('entry');
    });
    const cur = rows.filter(inCur(r)), prev = rows.filter(inPrev(r));
    const visits = (l) => sum(l.filter((x) => x.entry));
    const tracked = (l) => sum(l.filter((x) => x.entry && x.utm_source && (ctx.flow === 'all' || x.utm_campaign === ctx.flow)));
    if (!rows.length) {
      return emptyState('No page views yet', [
        'Put the Supabase URL and anon key at the top of the beacon in assets/site.js, then deploy.',
        'Visit a public page from another browser (your own browser may be set to “Don’t count my visits”).',
        'Tracked links look like ?utm_source=<channel key>&utm_campaign=<flow key>; copy one per channel under Sources.']);
    }
    const b = buckets(r, rows[0]?.day);
    const chart = columns({ labels: b.list, series: [{ label: 'Visits', color: 'var(--acc)', values: b.list.map((bk) => visits(cur.filter((x) => b.of(x.day) === bk))) }], xLabel: b.label, tipTitle: b.title });
    const tbl = table([b.kind === 'day' ? 'Day' : b.kind === 'week' ? 'Week of' : 'Month', 'Visits', 'Page views'],
      b.list.map((bk) => [b.label(bk), fmt(visits(cur.filter((x) => b.of(x.day) === bk))), fmt(sum(cur.filter((x) => b.of(x.day) === bk)))]));
    const entries = cur.filter((x) => x.entry);
    const refRows = [...groupSum(entries, (x) => x.referrer_host || 'Direct or unknown').entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 12);
    const utm = [...groupSum(entries.filter((x) => x.utm_source && (ctx.flow === 'all' || x.utm_campaign === ctx.flow)), (x) => `${x.utm_source}|${x.utm_campaign || ''}|${x.utm_medium || ''}`).entries()].sort((a, b2) => b2[1] - a[1]);
    const pages = [...groupSum(cur, 'path').entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 12);
    const hosts = [...groupSum(cur, (x) => x.host || 'unknown').entries()].sort((a, b2) => b2[1] - a[1]);
    const tv = visits(cur);
    return h('div', { class: 'stack' },
      h('div', { class: 'stats' },
        stat('Visits', visits(cur), r.prevFrom ? visits(prev) : null, r),
        stat('Page views', sum(cur), r.prevFrom ? sum(prev) : null, r),
        stat(ctx.flow === 'all' ? 'Visits from tracked links' : `Tracked visits for ${flowName(ctx.flow)}`, tracked(cur), r.prevFrom ? tracked(prev) : null, r),
        h('div', { class: 'stat' }, h('div', { class: 'l' }, 'Top referrer'), h('div', { class: 'v', style: { fontSize: '18px' } }, refRows[0] ? refRows[0][0] : '–'), h('div', { class: 'd' }, refRows[0] ? `${fmt(refRows[0][1])} visit${refRows[0][1] === 1 ? '' : 's'} · ${pct(refRows[0][1] / Math.max(1, tv))}` : ''))),
      chartPanel('Visits', 'A visit is a first page view whose referrer isn’t this site. No cookies, no personal data.', chart, tbl),
      h('div', { class: 'grid2' },
        h('section', { class: 'panel' }, h('h2', null, 'Top referrers'), refRows.length ? table(['Referrer', 'Visits', 'Share'], refRows.map(([k, n]) => [k, fmt(n), pct(n / Math.max(1, tv))])) : h('p', { class: 'muted' }, 'None yet.')),
        h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('div', null, h('h2', null, 'Tracked links'), h('p', null, '?utm_source=<channel key>&utm_campaign=<flow key>'))),
          utm.length ? table(['Source', 'Campaign', 'Visits'], utm.map(([k, n]) => { const [src, camp, med] = k.split('|'); return [refs.channel.has(src) ? chLabel(src) : src, `${refs.flow.has(camp) ? flowName(camp) : camp || '–'}${med ? ` · ${med}` : ''}`, fmt(n)]; }), { numericFrom: 2 })
            : h('p', { class: 'muted' }, 'No visits from tracked links yet. Copy a tracked link per channel under Sources and use it in bios, posts and signatures.'))),
      h('div', { class: 'grid2' },
        h('section', { class: 'panel' }, h('h2', null, 'Top pages'), table(['Page', 'Views'], pages.map(([k, n]) => [k, fmt(n)]))),
        h('section', { class: 'panel' }, h('h2', null, 'Hosts'), table(['Host', 'Views'], hosts.map(([k, n]) => [k, fmt(n)])), h('p', { class: 'note' }, 'Preview deployments show up as their own host.'))));
  }

  // ------------------------------------------------------------ weekly entry
  async function entry() {
    const manual = refs.metrics.filter((d) => d.source === 'manual');
    const values = await all((o) => sb.from('metric_values').select('*', o).in('metric_key', manual.map((d) => d.key)).order('period_start').order('id'));
    const thisWeek = weekStart(today());
    let week = thisWeek;
    const box = h('div');
    const weeks = Array.from({ length: 9 }, (_, i) => addDays(thisWeek, -7 * i));
    const wrap = h('div', { class: 'stack' },
      h('section', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('div', null, h('h2', null, 'Enter this week’s numbers'), h('p', null, 'Copy them from LinkedIn, Upwork and Reddit once a week. Leave a box empty to skip it.')),
          select(weeks.map((w, i) => ({ value: w, label: i === 0 ? `This week (from ${shortDate(w)})` : i === 1 ? `Last week (from ${shortDate(w)})` : `Week of ${shortDate(w)}` })), week, (v) => { week = v; paint(); }, { 'aria-label': 'Week', style: { width: 'auto' } })),
        box));
    paint();
    return wrap;

    function paint() {
      const inputs = new Map();
      const groups = [...new Set(manual.map((d) => d.platform))];
      const form = h('form', { class: 'form', onsubmit: async (e) => { e.preventDefault(); await save(inputs, btn); } });
      for (const plat of groups) {
        form.append(h('h3', { style: { fontSize: '13.5px', marginTop: '6px' } }, plat));
        for (const d of manual.filter((x) => x.platform === plat)) {
          const mine = values.filter((v) => v.metric_key === d.key && v.source === 'manual');
          const atWeek = mine.find((v) => v.period_start === week);
          const lastBefore = [...mine].filter((v) => v.period_start < week).pop();
          const inp = h('input', { type: 'number', step: 'any', inputmode: 'decimal', value: atWeek ? atWeek.value : '', placeholder: lastBefore ? `last: ${fmt(Number(lastBefore.value))}` : '', 'aria-label': `${plat} ${d.label}` });
          inputs.set(d.key, { inp, existing: atWeek });
          form.append(h('div', { class: 'form-row', style: { alignItems: 'center' } },
            h('div', null, h('div', null, d.label), h('div', { class: 'small' }, `${d.aggregate === 'last' ? 'The number on that day' : 'The week’s total'}${lastBefore ? ` · last ${fmt(Number(lastBefore.value))} (week of ${shortDate(lastBefore.period_start)})` : ' · never entered'}`)),
            inp));
        }
      }
      const btn = h('button', { type: 'submit', class: 'btn-ld primary' }, 'Save numbers');
      form.append(h('div', { class: 'form-actions' }, btn));
      mount(box, form);
    }

    async function save(inputs, btn) {
      const ups = [], dels = [];
      for (const [key, { inp, existing }] of inputs) {
        const v = inp.value.trim();
        if (v === '') { if (existing) dels.push(existing.id); continue; }
        const n = Number(v);
        if (!Number.isFinite(n)) return toast(`Not a number: ${v}`, { error: true });
        ups.push({ metric_key: key, period_start: week, value: n, source: 'manual', flow_key: null });
      }
      btn.disabled = true;
      try {
        if (ups.length) await q(sb.from('metric_values').upsert(ups, { onConflict: 'metric_key,period_start,source,flow_key' }));
        if (dels.length) await q(sb.from('metric_values').delete().in('id', dels));
        toast(`Saved ${ups.length} number${ups.length === 1 ? '' : 's'} for the week of ${shortDate(week)}`);
        load();
      } catch (e) { toast(e.message || explain(e), { error: true }); }
      finally { btn.disabled = false; }
    }
  }

  // ------------------------------------------------------------ CSV import
  async function csv() {
    const st = { platform: 'LinkedIn', text: '', parsed: null, dateCol: '', map: {}, dayFirst: false };
    const box = h('div');
    const ta = h('textarea', { rows: 6, placeholder: 'Paste the CSV here, or choose a file' });
    ta.addEventListener('input', debounce(() => { st.text = ta.value; parse(); }, 250));
    const file = h('input', { type: 'file', accept: '.csv,text/csv,text/plain' });
    file.addEventListener('change', async () => { const f = file.files[0]; if (!f) return; ta.value = await f.text(); st.text = ta.value; parse(); });
    const runs = await q(sb.from('import_runs').select('*').order('started_at', { ascending: false }).limit(8));
    const plats = [...new Set(refs.metrics.filter((d) => d.source === 'manual').map((d) => d.platform))];
    const wrap = h('div', { class: 'stack' },
      h('section', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('div', null, h('h2', null, 'Import a CSV'), h('p', null, 'Exports from LinkedIn, Upwork and others. Pick the date column, map the number columns to metrics, check the preview, import. Weekly metrics are summed into weeks (or the last value is kept, for counts like followers).'))),
        h('div', { class: 'form' },
          h('div', { class: 'form-row' }, field('Platform', select(plats.map((p) => ({ value: p, label: p })), st.platform, (v) => { st.platform = v; guess(); paintMap(); })), field('File', file)),
          ta, box)),
      h('section', { class: 'panel' }, h('h2', null, 'Recent import runs'),
        runs.length ? table(['Importer', 'Started', 'Status', 'Rows', 'Error'], runs.map((x) => [x.importer, `${shortDate(x.started_at.slice(0, 10))}`, x.status, fmt(x.rows), x.error || '']), { numericFrom: 3 })
          : h('p', { class: 'muted' }, 'None yet. Every import, by hand or scheduled, is logged here.')),
      importersPanel());
    return wrap;

    function importersPanel() {
      const ABOUT = {
        reddit: 'Karma, and new posts from your saved Reddit searches into the Inbox. Needs Reddit API access, which Reddit now approves case by case.',
        f5bot: 'Forwarded F5Bot alert emails into the Inbox. Pasting alerts in the Inbox works without it.',
        csv: 'CSV files posted by an automation. This page’s import works without it.',
      };
      const cur = () => refs.settings.importers || {};
      return h('section', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('div', null, h('h2', null, 'Importers'), h('p', null, 'Edge Functions in supabase/functions/importers, off until you deploy one and switch it on here. Its README has the steps and each source’s terms.'))),
        h('div', { class: 'rows' }, Object.entries(ABOUT).map(([k, text]) => h('div', { class: 'row' },
          h('div', { class: 'grow' }, h('div', { class: 'title' }, k), h('div', { class: 'meta' }, text)),
          switchEl(cur()[k]?.enabled === true, async (on) => {
            try { await saveSetting('importers', { ...cur(), [k]: { ...(cur()[k] || {}), enabled: on } }); toast(`${k} importer ${on ? 'on' : 'off'}`); }
            catch (e) { toast(e.message || explain(e), { error: true }); }
          }, `${k} importer`)))));
    }

    function parse() {
      st.parsed = st.text.trim() ? parseCsv(st.text) : null;
      if (st.parsed) {
        st.dateCol = st.parsed.header.find((c) => /date|week|day|period/i.test(c)) || st.parsed.header[0] || '';
        guess();
      }
      paintMap();
    }
    function guess() {
      if (!st.parsed) return;
      const defs = refs.metrics.filter((d) => d.platform === st.platform && d.source === 'manual');
      const rules = [
        [/impression/i, 'linkedin.post_impressions'], [/search appearance/i, 'linkedin.search_appearances'], [/profile view/i, st.platform === 'Upwork' ? 'upwork.profile_views' : 'linkedin.profile_views'],
        [/^(total )?followers?$/i, 'linkedin.followers'], [/connections?/i, 'linkedin.connections'], [/proposals? sent|^proposals?$/i, 'upwork.proposals_sent'],
        [/viewed/i, 'upwork.proposals_viewed'], [/invite/i, 'upwork.invites'], [/connects/i, 'upwork.connects_balance'], [/karma/i, 'reddit.karma'], [/views?/i, 'reddit.views'],
      ];
      st.map = {};
      for (const c of st.parsed.header) {
        if (c === st.dateCol) continue;
        const hit = rules.find(([re, key]) => re.test(c) && defs.some((d) => d.key === key));
        st.map[c] = hit ? hit[1] : '';
      }
    }
    function preview() {
      if (!st.parsed || !st.dateCol) return { values: [], bad: 0 };
      const di = st.parsed.header.indexOf(st.dateCol);
      const acc = new Map();
      let bad = 0;
      for (const row of st.parsed.rows) {
        const day = toDay(row[di], st.dayFirst);
        if (!day) { bad++; continue; }
        const wk = weekStart(day);
        st.parsed.header.forEach((c, i) => {
          const key = st.map[c];
          if (!key) return;
          const n = toNumber(row[i]);
          if (n == null) return;
          const def = refs.metric.get(key);
          const k = `${key}|${wk}`;
          const prevV = acc.get(k);
          if (def.aggregate === 'last') { if (!prevV || day >= prevV.day) acc.set(k, { metric_key: key, period_start: wk, value: n, day }); }
          else acc.set(k, { metric_key: key, period_start: wk, value: (prevV ? prevV.value : 0) + n, day });
        });
      }
      return { values: [...acc.values()].map(({ day, ...v }) => ({ ...v, source: 'csv', flow_key: null })), bad };
    }
    function paintMap() {
      if (!st.parsed) { mount(box); return; }
      const defs = refs.metrics.filter((d) => d.platform === st.platform && d.source === 'manual');
      const pv = preview();
      const weeks = [...new Set(pv.values.map((v) => v.period_start))].sort();
      const dayFirst = h('input', { type: 'checkbox', checked: st.dayFirst });
      dayFirst.addEventListener('change', () => { st.dayFirst = dayFirst.checked; paintMap(); });
      const btn = h('button', { type: 'button', class: 'btn-ld primary', disabled: !pv.values.length }, `Import ${pv.values.length} value${pv.values.length === 1 ? '' : 's'}`);
      btn.addEventListener('click', () => doImport(pv.values, btn));
      mount(box,
        h('div', { class: 'form-row' },
          field('Date column', select(st.parsed.header.map((c) => ({ value: c, label: c })), st.dateCol, (v) => { st.dateCol = v; guess(); paintMap(); })),
          h('label', { class: 'check small', style: { alignSelf: 'end', paddingBottom: '10px' } }, dayFirst, 'Dates are day first (24/11/2026)')),
        h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'Column'), h('th', null, 'Sample'), h('th', null, 'Metric'))),
          h('tbody', null, st.parsed.header.filter((c) => c !== st.dateCol).map((c) => h('tr', null, h('td', null, c), h('td', null, (st.parsed.rows[0] || [])[st.parsed.header.indexOf(c)] || ''),
            h('td', null, select([{ value: '', label: 'Skip' }, ...defs.map((d) => ({ value: d.key, label: d.label }))], st.map[c] || '', (v) => { st.map[c] = v; paintMap(); }, { 'aria-label': `Metric for ${c}` }))))))),
        h('p', { class: 'small' }, `${st.parsed.rows.length} rows${pv.bad ? `, ${pv.bad} without a readable date` : ''} → ${pv.values.length} weekly values${weeks.length ? `, weeks of ${shortDate(weeks[0])} to ${shortDate(weeks[weeks.length - 1])}` : ''}. Values already imported for a week are replaced.`),
        h('div', { class: 'form-actions' }, btn));
    }
    async function doImport(values, btn) {
      btn.disabled = true;
      let runId = null;
      try {
        const [run] = await q(sb.from('import_runs').insert({ importer: 'csv', status: 'running', meta: { platform: st.platform, columns: st.map } }).select('id'));
        runId = run.id;
        for (let i = 0; i < values.length; i += 500) await q(sb.from('metric_values').upsert(values.slice(i, i + 500), { onConflict: 'metric_key,period_start,source,flow_key' }));
        await q(sb.from('import_runs').update({ status: 'ok', finished_at: new Date().toISOString(), rows: values.length }).eq('id', runId));
        toast(`Imported ${values.length} values`);
        load();
      } catch (e) {
        if (runId) await sb.from('import_runs').update({ status: 'error', finished_at: new Date().toISOString(), error: e.message }).eq('id', runId);
        toast(e.message || explain(e), { error: true });
        btn.disabled = false;
      }
    }
  }
}
