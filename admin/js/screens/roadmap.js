// Roadmap: what's built, switched off, waiting on you, agreed, proposed and ruled out.
// The content is settings → roadmap (supabase/migrations/0007_roadmap.sql), kept current by updating that row.
import { h, mount, longDate, emptyState } from '../ui.js';
import { refs } from '../db.js';

const STATUS = {
  live: { label: 'Live', cls: 'badge is-lead' },
  ready: { label: 'Built, off', cls: 'badge' },
  you: { label: 'Your move', cls: 'badge dot' },
  planned: { label: 'Agreed', cls: 'badge' },
  proposed: { label: 'Proposed', cls: 'badge' },
  ruled_out: { label: 'Ruled out', cls: 'badge' },
};

export async function render(root) {
  const r = refs.settings.roadmap;
  if (!r || !Array.isArray(r.sections)) {
    mount(root, emptyState('No roadmap yet', ['Run supabase/migrations/0007_roadmap.sql in the Supabase SQL editor.']));
    return;
  }
  const count = (s) => r.sections.find((x) => x.status === s)?.items.length || 0;
  mount(root,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Roadmap'),
      h('p', null, `What’s built, what’s waiting and what’s only an idea. Updated ${longDate(r.updated)}.`))),
    h('div', { class: 'stats', style: { marginBottom: '14px' } },
      ['live', 'ready', 'you', 'planned', 'proposed'].map((s) => h('div', { class: 'stat' }, h('div', { class: 'l' }, STATUS[s].label), h('div', { class: 'v' }, String(count(s)))))),
    h('div', { class: 'stack' }, r.sections.map((sec) => h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('h2', null, sec.title), h('span', { class: STATUS[sec.status]?.cls || 'badge' }, STATUS[sec.status]?.label || sec.status)),
      h('div', { class: 'rows' }, sec.items.map((it) => h('div', { class: 'row', style: { alignItems: 'flex-start' } },
        h('div', { class: 'grow' }, h('div', { class: 'title' }, it.title), h('div', { class: 'meta', style: { color: 'var(--ink)' } }, it.text)),
        it.ref ? h('span', { class: 'small', style: { whiteSpace: 'nowrap' } }, it.ref) : null)))))));
}
