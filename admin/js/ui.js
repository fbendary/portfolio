// Small DOM, date and feedback helpers. Text always goes in through textContent, never innerHTML.

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  setProps(el, props);
  append(el, kids);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function s(tag, props, ...kids) {
  const el = document.createElementNS(SVG_NS, tag);
  setProps(el, props, true);
  append(el, kids);
  return el;
}

function setProps(el, props, isSvg) {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (!isSvg && (k === 'value' || k === 'checked' || k === 'selected' || k === 'indeterminate')) el[k] = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
}

function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false || k === true) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

export function clear(el) { while (el.firstChild) el.firstChild.remove(); return el; }
export function mount(el, ...kids) { clear(el); append(el, kids); return el; }

// ---------------------------------------------------------------- numbers

const nf = new Intl.NumberFormat('en-US');
const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const cf = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
export const fmt = (n) => (n == null || Number.isNaN(n) ? '–' : Math.abs(n) >= 10000 ? cf.format(n) : nf.format(Math.round(n * 10) / 10));
export const fmt1 = (n) => (n == null || Number.isNaN(n) ? '–' : nf1.format(n));
export const pct = (x) => (x == null || !Number.isFinite(x) ? '–' : `${Math.round(x * 1000) / 10}%`.replace('.0%', '%'));
export const ratio = (a, b) => (b > 0 ? a / b : null);
export function money(v, cur = 'USD') {
  if (v == null || v === '') return '';
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(v); }
  catch { return `${nf.format(v)} ${cur}`; }
}
// Change against the previous period, as a phrase: "▲ 12% on the previous 30 days".
// `span` names the comparison period ("the previous 30 days", "last week").
export function delta(cur, prev, { lowerIsBetter = false, span = 'the previous period' } = {}) {
  if (prev == null) return { text: '', cls: '' };
  if (prev === 0) {
    if (!cur) return { text: `None in ${span} either`, cls: '' };
    return { text: `Up from none in ${span}`, cls: lowerIsBetter ? 'down' : 'up' };
  }
  const d = (cur - prev) / prev;
  if (Math.abs(d) < 0.005) return { text: `Same as ${span}`, cls: '' };
  const up = d > 0;
  return { text: `${up ? '▲' : '▼'} ${pct(Math.abs(d))} on ${span}`, cls: up !== lowerIsBetter ? 'up' : 'down' };
}

// ---------------------------------------------------------------- dates in the dashboard's time zone

let TZ = 'UTC';
export function setTz(tz) { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); TZ = tz; } catch { TZ = 'UTC'; } }
export const tz = () => TZ;
export const browserTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };

const dayFmt = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
// A timestamp's calendar day (YYYY-MM-DD) in the dashboard's time zone.
export function dayOf(ts) { return dayFmt().format(ts instanceof Date ? ts : new Date(ts)); }
export const today = () => dayOf(new Date());
export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
export function daysBetween(a, b) { // b - a, in days
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}
export function weekStart(day) { // the Monday on or before the day
  const [y, m, d] = day.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}
function tzOffsetMin(utcMs) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - utcMs) / 60000);
}
// The instant a local wall-clock time happens in the dashboard's time zone.
export function zoned(day, time = '00:00') {
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - tzOffsetMin(guess) * 60000;
  const off2 = tzOffsetMin(t);
  t = guess - off2 * 60000;
  return new Date(t);
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export function shortDate(day) { const [, m, d] = day.split('-').map(Number); return `${MON[m - 1]} ${d}`; }
export function longDate(day) {
  const [y, m, d] = day.split('-').map(Number);
  const dow = DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dow} ${MON[m - 1]} ${d}${y !== +today().slice(0, 4) ? `, ${y}` : ''}`;
}
export function relDay(day) {
  if (!day) return '';
  const n = daysBetween(today(), day);
  if (n === 0) return 'today';
  if (n === -1) return 'yesterday';
  if (n === 1) return 'tomorrow';
  if (n < 0) return `${-n} days ago`;
  return `in ${n} days`;
}
export function timeOf(ts) {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(ts));
}
export function ago(ts) {
  if (!ts) return 'never';
  return relDay(dayOf(ts));
}

// ---------------------------------------------------------------- feedback

let toastBox;
export function toast(message, { undo, error = false, ms = 6500 } = {}) {
  if (!toastBox) { toastBox = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(toastBox); }
  const el = h('div', { class: ['toast', error && 'err'] }, h('span', null, message));
  let timer;
  const close = () => { clearTimeout(timer); el.remove(); };
  if (undo) {
    el.append(h('button', { type: 'button', onclick: async () => { close(); try { await undo(); toast('Undone'); } catch (e) { toast(String(e.message || e), { error: true }); } } }, 'Undo'));
  }
  el.append(h('button', { type: 'button', 'aria-label': 'Dismiss', onclick: close }, '×'));
  toastBox.append(el);
  timer = setTimeout(close, error ? 9000 : ms);
  return close;
}

// A modal sheet: a side panel on wide screens, a bottom sheet on phones.
export function sheet({ title, body, foot, onClose } = {}) {
  const dlg = h('dialog', { class: 'sheet', 'aria-label': title || 'Details' });
  const close = () => { if (dlg.open) dlg.close(); };
  const titleEl = h('h2', null, title || '');
  const bodyEl = h('div', { class: 'sheet-body' });
  const footEl = h('div', { class: 'sheet-foot' });
  dlg.append(h('div', { class: 'sheet-head' }, titleEl, h('button', { type: 'button', class: 'btn-ld ghost icon', 'aria-label': 'Close', onclick: close }, '✕')), bodyEl);
  if (body) append(bodyEl, [body]);
  if (foot) { append(footEl, [foot]); dlg.append(footEl); }
  dlg.addEventListener('close', () => { dlg.remove(); onClose && onClose(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  document.body.append(dlg);
  dlg.showModal();
  return {
    el: dlg, body: bodyEl, close,
    setTitle: (t) => { titleEl.textContent = t; },
    setFoot: (...kids) => { clear(footEl); append(footEl, kids); if (!footEl.isConnected) dlg.append(footEl); },
  };
}

export function confirmBox(question, yes = 'Delete') {
  return new Promise((resolve) => {
    let answered = false;
    const sh = sheet({
      title: question,
      body: h('p', { class: 'muted' }, 'This can’t be undone.'),
      foot: [
        h('button', { type: 'button', class: 'btn-ld', onclick: () => sh.close() }, 'Cancel'),
        h('button', { type: 'button', class: 'btn-ld primary', onclick: () => { answered = true; sh.close(); } }, yes),
      ],
      onClose: () => resolve(answered),
    });
  });
}

// ---------------------------------------------------------------- controls

export function seg(options, value, onChange, label) {
  const box = h('div', { class: 'seg', role: 'group', 'aria-label': label || null });
  for (const o of options) {
    const opt = typeof o === 'string' ? { value: o, label: o } : o;
    box.append(h('button', {
      type: 'button', 'aria-pressed': String(opt.value === value),
      onclick: () => {
        for (const b of box.children) b.setAttribute('aria-pressed', 'false');
        box.querySelector(`[data-v="${CSS.escape(String(opt.value))}"]`).setAttribute('aria-pressed', 'true');
        onChange(opt.value);
      },
      dataset: { v: String(opt.value) },
    }, opt.label));
  }
  return box;
}

// <select> from [{value,label}] or [{label, options:[…]}] groups.
export function select(options, value, onChange, props = {}) {
  const el = h('select', props);
  const add = (parent, o) => parent.append(h('option', { value: o.value ?? '' , selected: String(o.value ?? '') === String(value ?? '') }, o.label));
  for (const o of options) {
    if (o.options) { const g = h('optgroup', { label: o.label }); o.options.forEach((x) => add(g, x)); el.append(g); }
    else add(el, o);
  }
  if (onChange) el.addEventListener('change', () => onChange(el.value));
  return el;
}

let fieldSeq = 0;
// A labelled control. The control gets its own accessible name (a wrapping label would otherwise fold a
// select's current option into it) and the hint is linked as its description.
export function field(label, input, hint) {
  const control = input instanceof Element && /^(INPUT|SELECT|TEXTAREA)$/.test(input.tagName) ? input : null;
  let hintEl = null;
  if (hint) { hintEl = h('small', { id: `fh${++fieldSeq}` }, hint); }
  if (control) {
    if (!control.hasAttribute('aria-label')) control.setAttribute('aria-label', label);
    if (hintEl) control.setAttribute('aria-describedby', hintEl.id);
  }
  return h('label', { class: 'field' }, h('span', null, label), input, hintEl);
}

export function switchEl(checked, onChange, label) {
  const input = h('input', { type: 'checkbox', checked, role: 'switch', 'aria-label': label || null });
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'switch' }, input, label ? h('span', { class: 'sr' }, label) : null);
}

export function emptyState(title, steps = [], extra) {
  return h('div', { class: 'empty' }, h('b', null, title), steps.length ? h('ol', null, steps.map((x) => h('li', null, x))) : null, extra || null);
}

export function errorBox(message) { return h('div', { class: 'errline', role: 'alert' }, h('span', null, message)); }

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
    document.body.append(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}

export function download(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function debounce(fn, ms = 450) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export function extLink(href, text, cls = 'out') {
  return h('a', { href, target: '_blank', rel: 'noopener noreferrer', class: cls }, text);
}

export const isUrl = (v) => /^https?:\/\//i.test(String(v || '').trim());
export const lsGet = (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } };
export const lsSet = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* storage off */ } };
