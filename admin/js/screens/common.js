// Shared bits for the screens: stages, scope, the per-day activity query, follow-up dates.
import { h, today, addDays } from '../ui.js';
import { sb, all, refs, flowName } from '../db.js';

export const STAGES = [
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'replied', label: 'Replied' },
  { key: 'call_booked', label: 'Call booked' },
  { key: 'client', label: 'Client' },
  { key: 'not_now', label: 'Not now' },
  { key: 'lost', label: 'Lost' },
];
export const STAGE = Object.fromEntries(STAGES.map((x) => [x.key, x.label]));
export const LANE = { volume: 'Volume', trust: 'Trust', inbound: 'Inbound' };
export const GROUP = { outreach: 'Direct outreach', communities: 'Communities', platforms: 'Platforms', content: 'Content', inbound: 'Inbound', paid: 'Paid' };
export const PHASE = { now: 'Now', next: 'Next', later: 'Later' };

// Flow keys a screen covers: one flow, or all of them.
export const scope = (flow) => (flow === 'all' ? refs.flows.map((f) => f.key) : [flow]);

// "Carna · " in the All view, nothing inside a flow.
export function flowTag(flowKey, flow) {
  return flow === 'all' ? h('span', { class: 'tag-flow' }, `${flowName(flowKey)} · `) : null;
}

// Rows of the activity_days view for a day range, in a stable order so paging can't skip rows.
export function activityDays({ from, to, flow, cols = 'day,flow_key,channel_key,action_key,direction,template_id,place_id,first_touch,n,links,minutes', extra } = {}) {
  return all((o) => {
    let b = sb.from('activity_days').select(cols, o);
    if (from) b = b.gte('day', from);
    if (to) b = b.lte('day', to);
    if (flow && flow !== 'all') b = b.eq('flow_key', flow);
    if (extra) b = extra(b);
    return b.order('day').order('flow_key').order('channel_key').order('action_key').order('template_id').order('place_id');
  });
}

export const sum = (rows, pick = (r) => r.n) => rows.reduce((a, r) => a + (pick(r) || 0), 0);

export function groupSum(rows, key, pick = (r) => r.n) {
  const m = new Map();
  for (const r of rows) { const k = typeof key === 'function' ? key(r) : r[key]; m.set(k, (m.get(k) || 0) + (pick(r) || 0)); }
  return m;
}

// The next follow-up date after a touch.
export function followUpAfter(actionKey, channelKey) {
  const a = refs.action.get(actionKey);
  const c = refs.channel.get(channelKey);
  if (!a) return null;
  if (a.direction === 'out') return addDays(today(), c && c.follow_up_days != null ? Math.max(1, c.follow_up_days) : 3);
  if (actionKey === 'reply' || actionKey === 'enquiry') return today();
  return null;
}

// The action a "first message" touch logs on a lead: the channel's own one-to-one action
// (connection note, email, proposal, intro ask), otherwise a direct message.
const ONE_TO_ONE = ['email_sent', 'connect_note', 'dm_sent', 'proposal_sent', 'intro_ask'];
export function sendAction(channelKey) {
  const c = refs.channel.get(channelKey);
  return c && ONE_TO_ONE.includes(c.primary_action) ? c.primary_action : 'dm_sent';
}

export function trackedLink(channelKey, flowKey) {
  const p = new URLSearchParams({ utm_source: channelKey, utm_campaign: flowKey });
  return `${location.origin}/?${p}`;
}

// Flow picker for forms: the current flow, or a choice in the All view.
export function flowOptions() { return refs.flows.map((f) => ({ value: f.key, label: f.name })); }

export function channelOptions(flow, { all: includeAll = true } = {}) {
  const on = [], off = [];
  for (const c of refs.channels) {
    const fc = refs.fc.get(`${flow}:${c.key}`);
    (fc && fc.enabled ? on : off).push({ value: c.key, label: c.label });
  }
  return includeAll && off.length ? [{ label: 'On for this flow', options: on }, { label: 'Off for this flow', options: off }] : on;
}
