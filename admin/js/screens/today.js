// Today: quick log chips, follow-ups due, daily caps, this week's targets, new inbox items.
import { h, mount, today, addDays, weekStart, relDay, longDate, toast, sheet, fmt, pct, extLink } from '../ui.js';
import { sb, q, refs, getFc, chLabel, flowName, actLabel, logActivity, deleteActivity, explain, prefs } from '../db.js';
import { activityDays, scope, flowTag, followUpAfter, STAGE, sum } from './common.js';
import { openLead } from './leadsheet.js';
import { logForm } from './logform.js';
import { inboxActions } from './inbox.js';

export async function render(root, ctx) {
  const t = today(), ws = weekStart(t);
  const from = addDays(t, -13) < ws ? addDays(t, -13) : ws;
  mount(root, h('p', { class: 'muted' }, 'Loading today…'));
  const flowFilter = (b) => (ctx.flow === 'all' ? b : b.eq('flow_key', ctx.flow));
  const [rows, todayAll, due, inbox, anyActivity] = await Promise.all([
    activityDays({ from, flow: ctx.flow, cols: 'day,flow_key,channel_key,action_key,direction,template_id,place_id,n,links' }),
    activityDays({ from: t, to: t, cols: 'day,flow_key,channel_key,action_key,direction,template_id,place_id,n' }),
    q(flowFilter(sb.from('leads').select('id,name,company,flow_key,channel_key,stage,next_follow_up').lte('next_follow_up', addDays(t, 7)).not('stage', 'in', '(client,lost)').order('next_follow_up').limit(60))),
    q(flowFilter(sb.from('inbox_items').select('*').eq('status', 'new').neq('source', 'reddit_api').order('found_at', { ascending: false }).limit(5))),
    q(sb.from('activities').select('id').limit(1)),
  ]);
  if (!ctx.alive()) return;
  const data = { rows, todayAll, due, inbox, fresh: !anyActivity.length };
  paint();

  function paint() {
    const dueNow = data.due.filter((l) => l.next_follow_up <= t);
    const soon = data.due.length - dueNow.length;
    const todayRows = data.rows.filter((r) => r.day === t);
    const outToday = sum(todayRows.filter((r) => r.direction === 'out'));
    const weekRows = data.rows.filter((r) => r.day >= ws);
    mount(root,
      h('div', { class: 'page-head' },
        h('div', null, h('h1', null, longDate(t)),
          h('p', null, `${fmt(outToday)} out today · ${fmt(sum(weekRows.filter((r) => r.direction === 'out')))} out and ${fmt(sum(weekRows.filter((r) => r.direction !== 'out')))} back this week${ctx.flow === 'all' ? ' across all flows' : ` for ${flowName(ctx.flow)}`}`))),
      data.fresh ? startHere() : null,
      h('div', { class: 'grid2' },
        h('div', { class: 'stack' },
          quickLog(),
          followUps(dueNow, soon),
          inboxPanel()),
        h('div', { class: 'stack' },
          caps(),
          targets(weekRows),
          linkCheck(weekRows))));
  }

  // ---------------------------------------------------------------- quick log
  function quickLog() {
    const flows = scope(ctx.flow);
    const use = new Map();
    for (const r of data.rows) if (r.direction === 'out' && r.day >= addDays(t, -13)) {
      const k = `${r.flow_key}|${r.channel_key}|${r.action_key}`; use.set(k, (use.get(k) || 0) + r.n);
    }
    const cand = new Map();
    for (const f of flows) for (const c of refs.channels) {
      const fc = getFc(f, c.key);
      if (!fc.enabled || fc.phase !== 'now' || !c.primary_action) continue;
      const a = refs.action.get(c.primary_action);
      if (!a || a.direction !== 'out') continue;
      cand.set(`${f}|${c.key}|${a.key}`, { f, c: c.key, a: a.key, lead: fc.focus === 'lead', target: fc.weekly_target || 0 });
    }
    for (const k of use.keys()) if (!cand.has(k)) { const [f, c, a] = k.split('|'); if (flows.includes(f)) cand.set(k, { f, c, a, lead: false, target: 0 }); }
    const chips = [...cand.entries()].map(([k, v]) => ({ ...v, k, used: use.get(k) || 0 }))
      .sort((a, b) => (b.used - a.used) || (Number(b.lead) - Number(a.lead)) || (b.target - a.target) || (refs.channel.get(a.c).sort - refs.channel.get(b.c).sort))
      .slice(0, ctx.flow === 'all' ? 15 : 11);
    const todayCount = (x) => sum(data.rows.filter((r) => r.day === t && r.flow_key === x.f && r.channel_key === x.c && r.action_key === x.a));
    return h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('div', null, h('h2', null, 'Quick log'), h('p', null, 'One tap per action. Undo from the message that pops up.'))),
      chips.length ? h('div', { class: 'qlog' },
        chips.map((x) => h('button', { type: 'button', class: 'qchip', onclick: () => quick(x), 'aria-label': `Log one ${actLabel(x.a)} on ${chLabel(x.c)}${ctx.flow === 'all' ? ` for ${flowName(x.f)}` : ''}` },
          h('b', null, chLabel(x.c)),
          h('small', null, `${ctx.flow === 'all' ? `${flowName(x.f)} · ` : ''}${actLabel(x.a)}`),
          h('span', { class: 'n' }, fmt(todayCount(x))))),
        h('button', { type: 'button', class: 'qchip more', onclick: openLogger }, '+ Log several, or something else'))
        : h('div', { class: 'empty' }, h('b', null, 'No channels in Now yet'), 'Turn channels on and put them in Now under Sources; their chips appear here.'));
  }

  async function quick(x) {
    try {
      const rec = await logActivity({ flow_key: x.f, channel_key: x.c, action_key: x.a, count: 1 });
      const row = { day: t, flow_key: x.f, channel_key: x.c, action_key: x.a, direction: 'out', n: 1, links: 0, _id: rec.id };
      data.rows.push(row); data.todayAll.push({ ...row }); data.fresh = false;
      paint();
      toast(`Logged ${actLabel(x.a)} · ${chLabel(x.c)}`, {
        undo: async () => {
          await deleteActivity(rec.id);
          data.rows = data.rows.filter((r) => r._id !== rec.id);
          data.todayAll = data.todayAll.filter((r) => r._id !== rec.id);
          if (ctx.alive()) paint();
        },
      });
    } catch (e) { toast(e.message || explain(e), { error: true }); }
  }

  function openLogger() {
    const sh = sheet({ title: 'Log activity', body: logForm({ flow: ctx.flow, onLogged: () => { sh.close(); ctx.app.refresh(); } }) });
  }

  // ---------------------------------------------------------------- follow-ups
  function followUps(dueNow, soon) {
    return h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('div', null, h('h2', null, `Follow-ups due${dueNow.length ? ` (${dueNow.length})` : ''}`), h('p', null, soon ? `${soon} more in the next 7 days` : 'Leads whose next follow-up is today or overdue')),
        h('a', { class: 'btn-ld small', href: `#/leads${ctx.flow !== 'all' ? `?flow=${ctx.flow}` : ''}` }, 'All leads')),
      dueNow.length ? h('div', { class: 'rows' }, dueNow.map((l) => h('div', { class: 'row rw' },
        h('div', { class: 'grow' },
          h('div', { class: 'title' }, l.name, l.company ? h('span', { class: 'muted' }, ` · ${l.company}`) : null),
          h('div', { class: 'meta' }, flowTag(l.flow_key, ctx.flow), `${chLabel(l.channel_key)} · ${STAGE[l.stage]} · `,
            h('span', { class: l.next_follow_up < t ? 'badge dot' : 'badge' }, l.next_follow_up < t ? `due ${relDay(l.next_follow_up)}` : 'due today'))),
        h('div', { class: 'acts' },
          h('button', { type: 'button', class: 'btn-ld small primary', onclick: () => followedUp(l) }, 'Followed up'),
          h('button', { type: 'button', class: 'btn-ld small', onclick: () => openLead(l.id, { onChange: () => ctx.alive() && ctx.app.refresh(), flow: ctx.flow }) }, 'Open')))))
        : h('div', { class: 'empty' }, h('b', null, 'Nothing due'), 'Every touch on a lead sets its next follow-up from the channel’s default. Add leads from the Inbox or the Leads screen.'));
  }

  async function followedUp(l) {
    try {
      const before = l.next_follow_up;
      const rec = await logActivity({ flow_key: l.flow_key, channel_key: l.channel_key || 'warm', action_key: 'follow_up', count: 1, lead_id: l.id });
      const next = followUpAfter('follow_up', l.channel_key);
      await q(sb.from('leads').update({ next_follow_up: next }).eq('id', l.id));
      l.next_follow_up = next;
      data.rows.push({ day: t, flow_key: l.flow_key, channel_key: l.channel_key || 'warm', action_key: 'follow_up', direction: 'out', n: 1, links: 0, _id: rec.id });
      paint(); ctx.app.refreshCounts();
      toast(`Followed up with ${l.name}; next ${relDay(next)}`, {
        undo: async () => {
          await deleteActivity(rec.id);
          await q(sb.from('leads').update({ next_follow_up: before }).eq('id', l.id));
          l.next_follow_up = before; data.rows = data.rows.filter((r) => r._id !== rec.id);
          if (ctx.alive()) paint();
          ctx.app.refreshCounts();
        },
      });
    } catch (e) { toast(e.message || explain(e), { error: true }); }
  }

  // ---------------------------------------------------------------- caps
  function caps() {
    const flows = scope(ctx.flow);
    const list = [];
    for (const c of refs.channels.filter((x) => x.lane === 'volume')) {
      const fcs = flows.map((f) => getFc(f, c.key)).filter((fc) => fc.enabled && fc.phase === 'now');
      const allToday = sum(data.todayAll.filter((r) => r.channel_key === c.key && r.direction === 'out'));
      if (!fcs.length && !allToday) continue;
      if (ctx.flow === 'all') {
        list.push({ label: c.label, n: allToday, cap: c.daily_cap, sub: 'all flows' });
      } else {
        const fc = getFc(ctx.flow, c.key);
        const mine = sum(data.todayAll.filter((r) => r.channel_key === c.key && r.direction === 'out' && r.flow_key === ctx.flow));
        if (fc.daily_cap) list.push({ label: c.label, n: mine, cap: fc.daily_cap, sub: `this flow · ${fmt(allToday)} of ${fmt(c.daily_cap)} across all flows` });
        else list.push({ label: c.label, n: allToday, cap: c.daily_cap, sub: allToday !== mine ? `across all flows (${fmt(mine)} for this flow)` : 'across all flows' });
      }
    }
    return h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('div', null, h('h2', null, 'Daily caps'), h('p', null, 'Volume lanes today, including follow-ups. Caps are per account.'))),
      list.length ? h('div', { class: 'meters' }, list.map(meterRow)) : h('p', { class: 'muted' }, 'No volume lanes in Now for this view.'));
  }

  // ---------------------------------------------------------------- weekly targets
  function targets(weekRows) {
    const flows = scope(ctx.flow);
    const list = [];
    for (const f of flows) for (const c of refs.channels) {
      const fc = getFc(f, c.key);
      if (!fc.enabled || !fc.weekly_target || fc.phase !== 'now') continue;
      const n = sum(weekRows.filter((r) => r.flow_key === f && r.channel_key === c.key && r.direction === 'out'));
      list.push({ label: `${ctx.flow === 'all' ? `${flowName(f)} · ` : ''}${c.label}`, n, cap: fc.weekly_target, target: true, lead: fc.focus === 'lead' });
    }
    list.sort((a, b) => (Number(b.lead) - Number(a.lead)) || (a.n / a.cap - b.n / b.cap));
    const daysLeft = 7 - ((new Date(`${t}T12:00:00Z`).getUTCDay() + 6) % 7);
    return h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('div', null, h('h2', null, 'This week’s targets'), h('p', null, `Output since Monday, for channels in Now · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left`)),
        h('a', { class: 'btn-ld small', href: `#/sources${ctx.flow !== 'all' ? `?flow=${ctx.flow}` : ''}` }, 'Edit targets')),
      list.length ? h('div', { class: 'meters' }, list.map(meterRow)) : h('p', { class: 'muted' }, 'No weekly targets set. Add them under Sources.'));
  }

  function meterRow(x) {
    const ratio = x.cap ? x.n / x.cap : 0;
    const over = !x.target && x.cap && x.n > x.cap;
    return h('div', { class: 'meter-row' },
      h('span', null, x.label, x.lead ? h('span', { class: 'badge is-lead', style: { marginLeft: '6px' } }, 'leading') : null),
      h('span', { class: 'v' }, h('b', null, fmt(x.n)), x.cap ? ` / ${fmt(x.cap)}` : ''),
      h('div', { class: ['meter', over && 'over'], role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': x.cap || 0, 'aria-valuenow': x.n, 'aria-label': x.label },
        h('i', { style: { width: `${Math.min(100, Math.round(ratio * 100))}%` } })),
      over ? h('div', { class: 'flag' }, `Over the cap by ${fmt(x.n - x.cap)}. Stop for today on this channel.`) : x.sub ? h('div', { class: 'small', style: { gridColumn: '1/-1' } }, x.sub) : null);
  }

  // ---------------------------------------------------------------- links per comment
  function linkCheck(weekRows) {
    const warn = prefs().link_warn || 0.1;
    const byCh = new Map();
    for (const r of weekRows) {
      const c = refs.channel.get(r.channel_key);
      if (!c || c.lane !== 'trust' || r.direction !== 'out' || !['comment', 'post_published'].includes(r.action_key)) continue;
      const x = byCh.get(c.key) || { n: 0, links: 0 };
      x.n += r.n; x.links += r.links || 0; byCh.set(c.key, x);
    }
    const lines = [...byCh.entries()].filter(([, x]) => x.n >= 5 && x.links / x.n > warn)
      .map(([k, x]) => h('div', { class: 'warnline' }, `${chLabel(k)}: links in ${fmt(x.links)} of ${fmt(x.n)} this week (${pct(x.links / x.n)}). Keep it under ${pct(warn)}: help first, link rarely.`));
    const total = [...byCh.values()].reduce((a, x) => ({ n: a.n + x.n, links: a.links + x.links }), { n: 0, links: 0 });
    return h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('div', null, h('h2', null, 'Trust lanes'), h('p', null, 'Helpful comments and posts this week, and how many carried a link.'))),
      h('div', { class: 'meter-row' }, h('span', null, 'Comments and posts'), h('span', { class: 'v' }, h('b', null, fmt(total.n)), total.n ? ` · ${fmt(total.links)} with a link` : '')),
      ...lines);
  }

  // ---------------------------------------------------------------- inbox
  function inboxPanel() {
    const n = ctx.app.counts.inbox;
    return h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('div', null, h('h2', null, `New in the inbox${n ? ` (${n})` : ''}`), h('p', null, 'Threads worth acting on')),
        h('a', { class: 'btn-ld small', href: `#/inbox${ctx.flow !== 'all' ? `?flow=${ctx.flow}` : ''}` }, 'Open inbox')),
      data.inbox.length ? h('div', { class: 'rows' }, data.inbox.map((it) => h('div', { class: 'row rw' },
        h('div', { class: 'grow' }, h('div', { class: 'title' }, extLink(it.url, it.title || it.url)), h('div', { class: 'meta' }, flowTag(it.flow_key, ctx.flow), chLabel(it.channel_key), ` · found ${relDay(it.found_at.slice(0, 10))}`)),
        h('div', { class: 'acts' }, inboxActions(it, ctx, (st) => { if (st !== 'new') data.inbox = data.inbox.filter((x) => x.id !== it.id); ctx.app.refreshCounts(); if (ctx.alive()) paint(); })))))
        : h('div', { class: 'empty' }, h('b', null, 'Inbox is clear'), 'Run a saved search under Sources and paste good threads into the Inbox.'));
  }

  function startHere() {
    return h('section', { class: 'panel', style: { marginBottom: '14px' } },
      h('h2', null, 'Start here'),
      h('ol', { class: 'rules' },
        h('li', null, 'Sources: check which channels each flow uses, and their weekly targets.'),
        h('li', null, 'Plan: work through the one-time setup checklist (profiles, bios, F5Bot alerts).'),
        h('li', null, 'Run a saved search (Sources), find a thread where you can genuinely help, and paste its link into the Inbox.'),
        h('li', null, 'Tap a chip below each time you act. Real numbers only: nothing here is made up.')));
  }
}
