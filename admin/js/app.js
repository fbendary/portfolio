// Lead desk: boot, sign-in gate, header, flow switcher and hash router.
import { h, mount, seg, switchEl, toast, download, setTz, browserTz, today, lsGet, lsSet, errorBox } from './ui.js';
import { config, connect, sb, loadRefs, refs, prefs, saveSetting, explain, all } from './db.js';
import * as todayScreen from './screens/today.js';
import * as inboxScreen from './screens/inbox.js';
import * as leadsScreen from './screens/leads.js';
import * as activityScreen from './screens/activity.js';
import * as metricsScreen from './screens/metrics.js';
import * as sourcesScreen from './screens/sources.js';
import * as planScreen from './screens/plan.js';
import * as templatesScreen from './screens/templates.js';

const SCREENS = [
  { key: 'today', label: 'Today', mod: todayScreen },
  { key: 'inbox', label: 'Inbox', mod: inboxScreen },
  { key: 'leads', label: 'Leads', mod: leadsScreen },
  { key: 'activity', label: 'Activity', mod: activityScreen },
  { key: 'metrics', label: 'Metrics', mod: metricsScreen },
  { key: 'sources', label: 'Sources', mod: sourcesScreen },
  { key: 'plan', label: 'Plan', mod: planScreen },
  { key: 'templates', label: 'Templates', mod: templatesScreen },
];

const root = document.getElementById('app');

export const app = {
  flow: 'all', route: 'today', sub: '', params: new URLSearchParams(), counts: { inbox: 0, due: 0 },
  // Navigate: app.go('leads', id, { stage: 'replied' })
  go(route, sub = '', params = {}) {
    const p = new URLSearchParams(params);
    if (app.flow !== 'all') p.set('flow', app.flow);
    const qs = p.toString();
    location.hash = `#/${route}${sub ? `/${sub}` : ''}${qs ? `?${qs}` : ''}`;
  },
  // Change one part of the hash without re-rendering (for sub-tabs and open sheets).
  setHash(route, sub = '', params = {}, { replace = true } = {}) {
    const p = new URLSearchParams(params);
    if (app.flow !== 'all') p.set('flow', app.flow);
    const qs = p.toString();
    const next = `#/${route}${sub ? `/${sub}` : ''}${qs ? `?${qs}` : ''}`;
    if (next === location.hash) return;
    silent = true;
    if (replace) history.replaceState(null, '', next); else history.pushState(null, '', next);
    parseHash();
    silent = false;
  },
  setFlow(key) {
    if (app.flow === key) return;
    app.flow = key; lsSet('ld-flow', key);
    const p = new URLSearchParams(app.params); p.delete('flow');
    app.setHash(app.route, app.route === 'leads' ? '' : app.sub, Object.fromEntries(p));
    paintShell(); renderScreen(); refreshCounts();
    window.scrollTo(0, 0);
  },
  refresh: () => renderScreen(),
  refreshCounts: () => refreshCounts(),
};

let silent = false;
let shell = null;
let listening = false;

// ---------------------------------------------------------------- boot

boot();

async function boot() {
  if (!config.url || !config.key) return showSetup();
  if (!window.supabase) return showFatal('The Supabase library didn’t load from the CDN (cdn.jsdelivr.net). Check your connection or any content blocker, then reload.');
  connect();
  if (config.requireAuth) {
    if (!config.ownerEmail) return showFatal('REQUIRE_AUTH is on but OWNER_EMAIL is empty in admin/config.js.');
    const { data } = await sb.auth.getSession();
    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session && !shell) start();
      if (event === 'SIGNED_OUT') { shell = null; showLogin(); }
    });
    if (!data.session) return showLogin();
  }
  start();
}

async function start() {
  if (shell) return;
  mount(root, h('p', { class: 'ld-boot' }, 'Loading the lead desk…'));
  try {
    await loadRefs();
  } catch (e) {
    return showFatal(explain(e.raw || e));
  }
  if (!refs.flows.length) {
    return showFatal(config.requireAuth
      ? 'No flows came back. Check that you’re signed in with the owner’s email, and that 0003_seed.sql has run.'
      : 'No flows found. Run supabase/migrations/0003_seed.sql in the Supabase SQL editor. If you ran the locked policies, set REQUIRE_AUTH = true in admin/config.js.');
  }
  const p = prefs();
  if (!p.tz_set) {
    const tzNow = browserTz();
    try { await saveSetting('prefs', { ...p, tz: tzNow, tz_set: true }); } catch { /* read-only is fine */ }
  }
  setTz(prefs().tz);
  buildShell();
  if (!listening) {
    listening = true;
    window.addEventListener('hashchange', () => { if (!silent && shell) { parseHash(); paintShell(); renderScreen(); } });
  }
  parseHash();
  paintShell();
  renderScreen();
  refreshCounts();
}

function parseHash() {
  let raw = location.hash.replace(/^#\/?/, '');
  if (/^(access_token|error|type)=/.test(raw)) raw = 'today'; // a sign-in redirect, before the library tidies the URL
  const [path, qs = ''] = raw.split('?');
  const [route, ...rest] = path.split('/');
  app.route = SCREENS.some((x) => x.key === route) ? route : 'today';
  app.sub = rest.join('/');
  app.params = new URLSearchParams(qs);
  const f = app.params.get('flow') || lsGet('ld-flow', 'all');
  app.flow = f === 'all' || refs.flow.has(f) ? f : 'all';
}

// ---------------------------------------------------------------- shell

function buildShell() {
  const flowsEl = h('div', { class: 'ld-flows', role: 'group', 'aria-label': 'Flow' });
  const tabsEl = h('nav', { class: 'ld-tabs', 'aria-label': 'Screens' });
  const main = h('main', { class: 'ld-main ld-wrap', id: 'main' });
  const menu = buildMenu();
  const head = h('header', { class: 'ld-head' },
    h('div', { class: 'ld-wrap' },
      h('div', { class: 'ld-bar' }, h('a', { class: 'ld-brand', href: '#/today' }, 'Lead desk'), flowsEl, menu),
      tabsEl));
  mount(root, head, main);
  shell = { flowsEl, tabsEl, main };
}

function paintShell() {
  if (!shell) return;
  const opts = [{ key: 'all', name: 'All flows' }, ...refs.flows];
  mount(shell.flowsEl, opts.map((f) => h('button', {
    type: 'button', class: 'chip', 'aria-pressed': String(app.flow === f.key),
    onclick: () => app.setFlow(f.key),
  }, f.name)));
  mount(shell.tabsEl, SCREENS.map((x) => {
    const n = x.key === 'inbox' ? app.counts.inbox : x.key === 'today' ? app.counts.due : 0;
    const href = `#/${x.key}${app.flow !== 'all' ? `?flow=${app.flow}` : ''}`;
    return h('a', { href, 'aria-current': app.route === x.key ? 'page' : null }, x.label, n ? h('span', { class: 'count', 'aria-label': `${n} waiting` }, n) : null);
  }));
  // On a phone both strips scroll sideways: keep the current flow and screen in view.
  for (const [strip, sel] of [[shell.flowsEl, '[aria-pressed=true]'], [shell.tabsEl, '[aria-current=page]']]) {
    const el = strip.querySelector(sel);
    if (!el) continue;
    const left = el.offsetLeft - strip.offsetLeft;
    if (left < strip.scrollLeft || left + el.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = Math.max(0, left - 16);
  }
}

let renderToken = 0;
async function renderScreen() {
  if (!shell) return;
  const token = ++renderToken;
  const screen = SCREENS.find((x) => x.key === app.route) || SCREENS[0];
  const view = h('div', { class: 'screen' });
  mount(shell.main, view);
  document.title = `${screen.label} · Lead desk`;
  const ctx = { flow: app.flow, sub: app.sub, params: app.params, app, alive: () => token === renderToken };
  try {
    await screen.mod.render(view, ctx);
  } catch (e) {
    console.error(e);
    if (token === renderToken) mount(view, errorBox(e.message || explain(e)));
  }
}

async function refreshCounts() {
  try {
    let inbox = sb.from('inbox_items').select('id', { count: 'exact', head: true }).eq('status', 'new');
    let due = sb.from('leads').select('id', { count: 'exact', head: true }).lte('next_follow_up', today()).not('stage', 'in', '(client,lost)');
    if (app.flow !== 'all') { inbox = inbox.eq('flow_key', app.flow); due = due.eq('flow_key', app.flow); }
    const [a, b] = await Promise.all([inbox, due]);
    app.counts = { inbox: a.count || 0, due: b.count || 0 };
    paintShell();
  } catch { /* counts are a nicety */ }
}

// ---------------------------------------------------------------- menu

function buildMenu() {
  const wrap = h('div', { class: 'menu-wrap' });
  const btn = h('button', { type: 'button', class: 'btn-ld ghost icon', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-label': 'Menu' }, '⋯');
  let panel = null;
  const close = () => { if (panel) { panel.remove(); panel = null; btn.setAttribute('aria-expanded', 'false'); } };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panel) return close();
    const theme = lsGet('ld-theme', 'auto');
    panel = h('div', { class: 'menu', role: 'menu', onclick: (ev) => ev.stopPropagation() },
      h('div', { class: 'sec' }, h('span', null, 'Theme'), seg([{ value: 'auto', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], theme, (v) => {
        lsSet('ld-theme', v === 'auto' ? null : v);
        if (v === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v;
        window.dispatchEvent(new Event('ld-theme'));
      }, 'Theme')),
      h('div', { class: 'sec' },
        h('label', { class: 'check' }, switchEl(lsGet('pv-ignore') === '1', (on) => { lsSet('pv-ignore', on ? '1' : null); toast(on ? 'Your visits on this browser won’t be counted.' : 'Your visits on this browser count again.'); }, 'Don’t count my visits'), h('span', null, 'Don’t count my visits')),
        h('small', { class: 'small' }, 'For this browser, on this site’s public pages.')),
      h('div', { class: 'sec' },
        h('button', { type: 'button', class: 'btn-ld small', onclick: backup }, 'Download a backup (JSON)'),
        h('small', { class: 'small' }, 'Free Supabase projects have no automatic backups.')),
      h('div', { class: 'sec' },
        h('span', null, `Days are counted in ${prefs().tz}`),
        browserTz() !== prefs().tz ? h('button', { type: 'button', class: 'btn-ld small', onclick: async () => {
          try { await saveSetting('prefs', { ...prefs(), tz: browserTz(), tz_set: true }); setTz(browserTz()); close(); renderScreen(); toast(`Now counting days in ${browserTz()}`); }
          catch (e2) { toast(e2.message || explain(e2), { error: true }); }
        } }, `Use this device’s time zone (${browserTz()})`) : null,
        config.requireAuth ? h('button', { type: 'button', class: 'btn-ld small', onclick: async () => { await sb.auth.signOut(); } }, 'Sign out') : h('span', null, 'Open mode: no sign-in (see admin/README.md to lock it).')));
    wrap.append(panel);
    btn.setAttribute('aria-expanded', 'true');
  });
  document.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  wrap.append(btn);
  return wrap;
}

async function backup() {
  const tables = {
    flows: 'key', actions: 'key', channels: 'key', flow_channels: 'flow_key', places: 'id', saved_searches: 'id', templates: 'id',
    inbox_items: 'id', leads: 'id', activities: 'id', metric_definitions: 'key', metric_values: 'id', page_views: 'id', import_runs: 'id', settings: 'key',
  };
  toast('Preparing the backup…', { ms: 2500 });
  try {
    const out = { exported_at: new Date().toISOString(), tables: {} };
    for (const [t, key] of Object.entries(tables)) {
      out.tables[t] = await all((o) => {
        let b = sb.from(t).select('*', o).order(key);
        if (t === 'flow_channels') b = b.order('channel_key');
        return b;
      });
    }
    download(`lead-desk-backup-${today()}.json`, JSON.stringify(out, null, 1));
  } catch (e) {
    toast(e.message || explain(e), { error: true });
  }
}

// ---------------------------------------------------------------- gates

function showSetup() {
  mount(root, h('div', { class: 'setup' },
    h('h1', null, 'Connect the lead desk'),
    h('p', { class: 'muted' }, 'admin/config.js has no Supabase project yet. admin/README.md walks through it; in short:'),
    h('ol', null,
      h('li', null, 'Create a free project at supabase.com.'),
      h('li', null, 'In its SQL editor, run supabase/migrations/0001_schema.sql, 0002_policies_open.sql and 0003_seed.sql, in that order.'),
      h('li', null, 'Copy the project URL and the publishable (anon) key from Project Settings → API Keys into admin/config.js, and into the two lines at the top of the beacon in assets/site.js.'),
      h('li', null, 'Deploy, then open this page again.'))));
}

function showFatal(message) {
  shell = null;
  mount(root, h('div', { class: 'setup' }, h('h1', null, 'The lead desk can’t start'), errorBox(message),
    h('p', null, h('button', { type: 'button', class: 'btn-ld', onclick: () => location.reload() }, 'Try again'))));
}

function maskEmail(e) {
  const [user, domain] = e.split('@');
  return `${user.slice(0, 1)}${'•'.repeat(Math.max(2, user.length - 1))}@${domain || ''}`;
}

function showLogin() {
  const status = h('p', { class: 'muted', role: 'status' });
  const code = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', placeholder: '6-digit code', maxlength: '10' });
  const send = h('button', { type: 'button', class: 'btn-ld primary' }, 'Send me a sign-in link');
  send.addEventListener('click', async () => {
    send.disabled = true;
    status.textContent = 'Sending…';
    const redirect = `${location.origin}${location.pathname}`;
    const { error } = await sb.auth.signInWithOtp({ email: config.ownerEmail, options: { emailRedirectTo: redirect, shouldCreateUser: false } });
    send.disabled = false;
    status.textContent = error ? explain(error) : `Sent. Open the link in the email to ${maskEmail(config.ownerEmail)} on this device, or type the code from it below.`;
  });
  const verify = h('button', { type: 'button', class: 'btn-ld' }, 'Sign in with the code');
  verify.addEventListener('click', async () => {
    const token = code.value.replace(/\s/g, '');
    if (!token) return;
    const { error } = await sb.auth.verifyOtp({ email: config.ownerEmail, token, type: 'email' });
    if (error) status.textContent = explain(error);
  });
  mount(root, h('div', { class: 'login' },
    h('h1', null, 'Lead desk'),
    h('p', { class: 'muted' }, `Sign-in links go only to ${maskEmail(config.ownerEmail)}.`),
    send, status,
    h('div', { class: 'form-row' }, code, verify)));
}

export { SCREENS };
