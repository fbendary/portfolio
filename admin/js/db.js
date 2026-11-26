// The Supabase connection, the fixed lists (refs) and the few write helpers every screen shares.
import { SUPABASE_URL, SUPABASE_ANON_KEY, REQUIRE_AUTH, OWNER_EMAIL } from '../config.js';

export const config = {
  url: String(SUPABASE_URL || '').trim().replace(/\/+$/, ''),
  key: String(SUPABASE_ANON_KEY || '').trim(),
  requireAuth: !!REQUIRE_AUTH,
  ownerEmail: String(OWNER_EMAIL || '').trim(),
};

export let sb = null;

export function connect() {
  if (!config.url || !config.key || !window.supabase) return null;
  sb = window.supabase.createClient(config.url, config.key, {
    auth: { persistSession: config.requireAuth, autoRefreshToken: config.requireAuth, detectSessionInUrl: config.requireAuth, storageKey: 'ld-auth' },
  });
  return sb;
}

export class DbError extends Error {
  constructor(err) { super(explain(err)); this.code = err && err.code; this.raw = err; }
}

export function explain(err) {
  const m = String((err && (err.message || err.error_description)) || err || 'Something went wrong');
  const code = err && err.code;
  if (/Failed to fetch|NetworkError|Load failed|fetch failed|ERR_|network/i.test(m)) {
    return 'Can’t reach Supabase. Check your connection. Free Supabase projects pause after a week without use: open the Supabase dashboard and restore the project.';
  }
  if (code === '42501' || /permission denied|row-level security/i.test(m)) {
    return config.requireAuth
      ? 'The database refused this. Sign out and sign in again with your own email.'
      : 'The database refused this. If you ran the locked policies, set REQUIRE_AUTH = true in admin/config.js and sign in.';
  }
  if (code === '42P01' || code === 'PGRST205' || /does not exist|schema cache/i.test(m)) {
    return 'A table is missing. Run the SQL files in supabase/migrations (0001, 0002, 0003) in the Supabase SQL editor.';
  }
  if (code === '23505') return 'That’s already here.';
  if (code === '23503') return 'Something this points to no longer exists. Reload and try again.';
  if (code === '23514') return `A value is out of range (${m}).`;
  return m;
}

// Await a query builder and throw a readable error.
export async function q(builder) {
  const { data, error } = await builder;
  if (error) throw new DbError(error);
  return data;
}

// Every row of a query, page by page (the API returns at most 1,000 at a time).
// `make` builds a fresh query; it must include an order so pages don't overlap.
export async function all(make, size = 1000) {
  const out = [];
  let total = null;
  for (let from = 0; from < 200000; from += size) {
    const { data, error, count } = await make({ count: from === 0 ? 'exact' : undefined }).range(from, from + size - 1);
    if (error) throw new DbError(error);
    if (from === 0 && typeof count === 'number') total = count;
    out.push(...data);
    if (!data.length || (total != null ? out.length >= total : data.length < size)) break;
  }
  return out;
}

// ---------------------------------------------------------------- the fixed lists

export const refs = {
  flows: [], actions: [], channels: [], flowChannels: [], places: [], searches: [], templates: [], metrics: [], settings: {},
  flow: new Map(), action: new Map(), channel: new Map(), fc: new Map(), place: new Map(), template: new Map(), metric: new Map(),
};

const fcKey = (f, c) => `${f}:${c}`;

export async function loadRefs() {
  const [flows, actions, channels, flowChannels, places, searches, templates, metrics, settings] = await Promise.all([
    q(sb.from('flows').select('*').order('sort')),
    q(sb.from('actions').select('*').order('sort')),
    q(sb.from('channels').select('*').order('sort')),
    all((o) => sb.from('flow_channels').select('*', o).order('flow_key').order('channel_key')),
    all((o) => sb.from('places').select('*', o).order('name').order('id')),
    all((o) => sb.from('saved_searches').select('*', o).order('sort').order('id')),
    all((o) => sb.from('templates').select('*', o).order('sort').order('name').order('id')),
    q(sb.from('metric_definitions').select('*').order('sort')),
    q(sb.from('settings').select('*')),
  ]);
  Object.assign(refs, { flows, actions, channels, flowChannels, places, searches, templates, metrics });
  refs.settings = Object.fromEntries(settings.map((r) => [r.key, r.value]));
  index();
}

export function index() {
  refs.flow = new Map(refs.flows.map((x) => [x.key, x]));
  refs.action = new Map(refs.actions.map((x) => [x.key, x]));
  refs.channel = new Map(refs.channels.map((x) => [x.key, x]));
  refs.fc = new Map(refs.flowChannels.map((x) => [fcKey(x.flow_key, x.channel_key), x]));
  refs.place = new Map(refs.places.map((x) => [x.id, x]));
  refs.template = new Map(refs.templates.map((x) => [x.id, x]));
  refs.metric = new Map(refs.metrics.map((x) => [x.key, x]));
}

export async function reload(name) {
  const loaders = {
    places: () => all((o) => sb.from('places').select('*', o).order('name').order('id')),
    searches: () => all((o) => sb.from('saved_searches').select('*', o).order('sort').order('id')),
    templates: () => all((o) => sb.from('templates').select('*', o).order('sort').order('name').order('id')),
    flowChannels: () => all((o) => sb.from('flow_channels').select('*', o).order('flow_key').order('channel_key')),
  };
  refs[name] = await loaders[name]();
  index();
}

export const getFc = (flow, channel) => refs.fc.get(fcKey(flow, channel)) || { flow_key: flow, channel_key: channel, enabled: false, phase: 'later', focus: 'test', weekly_target: null, daily_cap: null, where_hint: '' };
export const chLabel = (k) => (refs.channel.get(k) || {}).label || k || 'No channel';
export const flowName = (k) => (refs.flow.get(k) || {}).name || k || 'No flow';
export const actLabel = (k) => (refs.action.get(k) || {}).label || k;
export const placeName = (id) => (id && refs.place.get(id) ? refs.place.get(id).name : '');
export const prefs = () => ({ tz: 'UTC', hours_per_week: 40, lead_share: 0.7, link_warn: 0.1, currency: 'USD', cut_after_days: 14, ...(refs.settings.prefs || {}) });

// Channels a flow uses (enabled), best first: Now before Next before Later, leading before testing.
const PHASE = { now: 0, next: 1, later: 2 };
export function flowChannels(flow, { enabledOnly = true } = {}) {
  return refs.channels
    .map((c) => ({ c, fc: getFc(flow, c.key) }))
    .filter((x) => !enabledOnly || x.fc.enabled)
    .sort((a, b) => (PHASE[a.fc.phase] - PHASE[b.fc.phase]) || ((a.fc.focus === 'lead' ? 0 : 1) - (b.fc.focus === 'lead' ? 0 : 1)) || (a.c.sort - b.c.sort));
}

// Places that fit a flow and channel (any channel on the same platform).
export function placesFor(flow, channel) {
  const ch = refs.channel.get(channel);
  const platform = ch ? ch.platform : '';
  return refs.places.filter((p) => (!flow || p.flow_key === flow) && (p.channel_key === channel || (platform && (refs.channel.get(p.channel_key) || {}).platform === platform)));
}

export function templatesFor(flow, channel, { activeOnly = true } = {}) {
  return refs.templates.filter((t) => (!flow || t.flow_key === flow) && (!channel || !t.channel_key || t.channel_key === channel) && (!activeOnly || t.active));
}

export async function saveSetting(key, value) {
  await q(sb.from('settings').upsert({ key, value }, { onConflict: 'key' }));
  refs.settings[key] = value;
}

// ---------------------------------------------------------------- writes shared by screens

export async function logActivity(row) {
  const [rec] = await q(sb.from('activities').insert(row).select('*'));
  return rec;
}

export async function deleteActivity(id) {
  await q(sb.from('activities').delete().eq('id', id));
}
