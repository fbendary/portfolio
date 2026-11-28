// Prospects: people collected from LinkedIn by Claude in Chrome (inbox_items, kind person).
//   New        pick the ones you like, skip the rest
//   Picked     tag who gets a custom message (your gist → Claude's note) or use a template
//   Ready      Copy & open profile, send the request yourself, Mark sent (creates the lead, logs it)
//   Sent       what went out, with a link to each lead
import { h, mount, seg, select, toast, copyText, extLink, relDay, fmt, emptyState, errorBox, switchEl, debounce } from '../ui.js';
import { sb, q, all, refs, logActivity, explain, templatesFor } from '../db.js';
import { followUpAfter } from './common.js';

const STEPS = [{ value: 'new', label: 'New' }, { value: 'picked', label: 'Picked' }, { value: 'ready', label: 'Ready to send' }, { value: 'sent', label: 'Sent' }, { value: 'skipped', label: 'Skipped' }];
const QUEUE = { new: null, picked: 'shortlist', ready: 'approved', sent: 'posted', skipped: 'pass' };
const COLS = 'id,flow_key,channel_key,url,title,snippet,found_at,source,kind,author,queue,status,company,role,country,details,custom,gist,draft,lead_id';
const NOTE_MAX = 300, NOTE_FREE = 200;
const sid = (id) => id.slice(0, 8);

export async function render(root, ctx) {
  let step = STEPS.some((x) => x.value === ctx.sub) ? ctx.sub : 'new';
  const body = h('div'), counts = h('p', { class: 'muted' });
  mount(root,
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, 'Prospects'), counts),
      h('a', { class: 'btn-ld', href: '#/collect' }, 'Collect more')),
    h('div', { class: 'toolbar', style: { marginBottom: '14px' } }, seg(STEPS, step, (v) => { step = v; ctx.app.setHash('prospects', v === 'new' ? '' : v); load(); }, 'Step')),
    body);
  await load();

  function base(o) { let b = sb.from('inbox_items').select(COLS, o).eq('kind', 'person'); if (ctx.flow !== 'all') b = b.eq('flow_key', ctx.flow); return b; }
  async function setItem(it, patch) { await q(sb.from('inbox_items').update(patch).eq('id', it.id)); Object.assign(it, patch); }

  async function load() {
    body.classList.add('loading');
    try {
      const n = async (st) => { let b = sb.from('inbox_items').select('id', { count: 'exact', head: true }).eq('kind', 'person'); if (ctx.flow !== 'all') b = b.eq('flow_key', ctx.flow); b = QUEUE[st] === null ? b.is('queue', null) : b.eq('queue', QUEUE[st]); return (await b).count || 0; };
      const [a, b, c, d] = await Promise.all(['new', 'picked', 'ready', 'sent'].map(n));
      counts.textContent = `${fmt(a)} new · ${fmt(b)} picked · ${fmt(c)} ready to send · ${fmt(d)} sent. Collected from LinkedIn with Claude in Chrome.`;
      const list = await all((o) => { const b2 = base(o); return (QUEUE[step] === null ? b2.is('queue', null) : b2.eq('queue', QUEUE[step])).order('found_at', { ascending: false }).order('id'); });
      if (!ctx.alive()) return;
      mount(body, view(list));
    } catch (e) { mount(body, errorBox(e.message || explain(e))); }
    finally { body.classList.remove('loading'); }
  }

  function who(it) {
    const d = it.details || {};
    return [h('div', { class: 'title' }, extLink(it.url, it.title || it.url), it.custom ? h('span', { class: 'badge is-lead', style: { marginLeft: '6px' } }, 'custom') : null),
      h('div', { class: 'meta' }, [it.role, it.company && (d.company_url ? null : it.company)].filter(Boolean).join(' at '), d.company_url ? [' at ', extLink(d.company_url, it.company)] : null),
      h('div', { class: 'meta' }, [d.company_size && `${d.company_size} employees`, d.industry, it.country, `found ${relDay(it.found_at.slice(0, 10))}`].filter(Boolean).join(' · ')),
      d.signal ? h('div', { class: 'meta', style: { color: 'var(--ink)' } }, d.signal) : null];
  }

  function view(list) {
    if (!list.length) {
      const empty = { new: ['Copy the LinkedIn prompt on Collect into Claude in Chrome; it adds people here.'], picked: ['Pick people under New.'], ready: ['Approve notes under Picked.'], sent: [], skipped: [] };
      return emptyState('Nobody here', empty[step]);
    }
    if (step === 'new') {
      return h('section', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('div', null, h('h2', null, `${list.length} to look at`), h('p', null, 'Pick the ones worth a connection request; skip the rest.')),
          h('button', { type: 'button', class: 'btn-ld small', onclick: async () => { await q(sb.from('inbox_items').update({ queue: 'pass' }).in('id', list.map((x) => x.id)).is('queue', null)); toast(`Skipped ${list.length}`); load(); } }, 'Skip all')),
        h('div', { class: 'rows' }, list.map((it) => {
          const acts = h('div', { class: 'acts' },
            h('button', { type: 'button', class: 'btn-ld small primary', onclick: async () => { await setItem(it, { queue: 'shortlist' }); acts.replaceChildren(h('span', { class: 'badge is-lead' }, 'picked')); } }, 'Pick'),
            h('button', { type: 'button', class: 'btn-ld small ghost', onclick: async () => { await setItem(it, { queue: 'pass' }); acts.replaceChildren(h('span', { class: 'badge' }, 'skipped')); } }, 'Skip'));
          return h('div', { class: 'row rw', style: { alignItems: 'flex-start' } }, h('div', { class: 'grow' }, who(it)), acts);
        })));
    }
    if (step === 'picked') return pickedView(list);
    if (step === 'ready') return readyView(list);
    return h('section', { class: 'panel' }, h('div', { class: 'rows' }, list.map((it) => h('div', { class: 'row', style: { display: 'block' } }, who(it),
      it.draft ? h('div', { class: 'meta clamp2', style: { marginTop: '4px' } }, `Note: ${it.draft}`) : null,
      step === 'sent' && it.lead_id ? h('a', { class: 'btn-ld small', href: `#/leads/${it.lead_id}`, style: { marginTop: '6px' } }, 'Open lead') : step === 'skipped' ? h('button', { type: 'button', class: 'btn-ld small ghost', style: { marginTop: '6px' }, onclick: async () => { await setItem(it, { queue: null }); load(); } }, 'Back to new') : null))));
  }

  function pickedView(list) {
    const tpls = (flow) => templatesFor(flow, 'li_connect');
    const paste = h('textarea', { rows: 4, placeholder: 'Paste Claude’s notes here: “### id” then the note' });
    const copyPrompt = async () => {
      const ready = list.filter((x) => x.custom && x.gist.trim() && !x.draft.trim());
      if (!ready.length) return toast('Tag someone Custom and write a gist first (people with a note already are left out).', { error: true });
      const ok = await copyText(notePrompt(ready));
      toast(ok ? `Copied ${ready.length}. Paste into Claude chat, then paste its notes below. (The 3-hourly Claude run also drafts these.)` : 'Couldn’t copy', { error: !ok });
    };
    const applyNotes = async () => {
      const byShort = new Map(list.map((x) => [sid(x.id), x]));
      let n = 0;
      for (const part of paste.value.split(/^\s*#{2,4}\s*/m)) {
        const m = part.match(/^`?([0-9a-f]{8})`?[^\n]*\n([\s\S]*)$/i);
        const it = m && byShort.get(m[1].toLowerCase());
        if (it && m[2].trim()) { await setItem(it, { draft: m[2].trim() }); n++; }
      }
      toast(n ? `${n} note${n === 1 ? '' : 's'} added` : 'No notes found. Each should start with “### id”.', { error: !n });
      if (n) { paste.value = ''; load(); }
    };
    return h('div', { class: 'stack' },
      h('section', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('div', null, h('h2', null, 'Notes'), h('p', null, `Tag who gets a custom note and write its gist; Claude writes the note (the 3-hourly run does it, or copy the prompt for Claude chat now). Everyone else can use a template. Keep notes under ${NOTE_FREE} characters if you're on a free LinkedIn account.`)),
          h('button', { type: 'button', class: 'btn-ld primary', onclick: copyPrompt }, 'Copy note prompt')),
        h('div', { class: 'form' }, paste, h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn-ld primary', onclick: applyNotes }, 'Add notes')))),
      h('section', { class: 'panel' }, h('div', { class: 'rows' }, list.map((it) => {
        const saveSoon = debounce((patch) => setItem(it, patch).catch((e) => toast(e.message, { error: true })), 600);
        const count = h('span', { class: 'small' });
        const draft = h('textarea', { rows: 3, placeholder: 'The connection note' }); draft.value = it.draft;
        const paintCount = () => { const n = draft.value.length; count.textContent = `${n} / ${NOTE_MAX}${n > NOTE_FREE ? ' · over the free-account limit' : ''}`; count.style.color = n > NOTE_MAX ? 'var(--bad)' : ''; };
        draft.addEventListener('input', () => { paintCount(); saveSoon({ draft: draft.value }); }); paintCount();
        const gist = h('textarea', { rows: 2, placeholder: 'Your gist: why them, what to say' }); gist.value = it.gist;
        gist.addEventListener('input', () => saveSoon({ gist: gist.value }));
        const first = String(it.title || '').split(/\s+/)[0] || '';
        const opts = tpls(it.flow_key);
        const tplSel = select([{ value: '', label: opts.length ? 'Use a template…' : 'No connection-note templates' }, ...opts.map((t) => ({ value: t.id, label: t.name }))], '', (v) => {
          const t = refs.template.get(v); if (!t) return;
          draft.value = t.body.replace(/\{first name\}/gi, first).replace(/\{company\}/gi, it.company || '{company}'); paintCount(); saveSoon({ draft: draft.value });
        }, { 'aria-label': 'Template', style: { width: 'auto' } });
        const customBox = h('div', { hidden: !it.custom }, gist);
        const row = h('div', { class: 'row', style: { display: 'block' } }, who(it),
          h('div', { class: 'form', style: { marginTop: '8px' } },
            h('div', { class: 'toolbar' }, h('label', { class: 'check small' }, switchEl(it.custom, async (on) => { await setItem(it, { custom: on }); customBox.hidden = !on; }, 'Custom message'), 'Custom message'), tplSel),
            customBox, draft, count,
            h('div', { class: 'form-actions' },
              h('button', { type: 'button', class: 'btn-ld small primary', onclick: async () => {
                if (!draft.value.trim()) return toast('Write the note first, or pick a template.', { error: true });
                if (draft.value.length > NOTE_MAX) return toast(`LinkedIn notes are at most ${NOTE_MAX} characters.`, { error: true });
                await setItem(it, { draft: draft.value, gist: gist.value, queue: 'approved' }); row.remove(); toast('Ready to send'); } }, 'Approve'),
              h('button', { type: 'button', class: 'btn-ld small ghost', onclick: async () => { await setItem(it, { queue: 'pass' }); row.remove(); } }, 'Skip'))));
        return row;
      }))));
  }

  function readyView(list) {
    return h('section', { class: 'panel' },
      h('div', { class: 'panel-head' }, h('div', null, h('h2', null, 'Send'), h('p', null, 'Copy & open copies the note and opens the profile: Connect → Add a note → paste → Send. Then Mark sent, which adds the lead and logs the request. Pace it: LinkedIn limits invitations a week.'))),
      h('div', { class: 'rows' }, list.map((it) => {
        const row = h('div', { class: 'row', style: { display: 'block' } }, who(it),
          h('div', { class: 'tpl-body open' }, it.draft),
          h('div', { class: 'form-actions', style: { marginTop: '8px' } },
            h('button', { type: 'button', class: 'btn-ld small primary', onclick: async () => { await copyText(it.draft); window.open(it.url, '_blank', 'noopener,noreferrer'); toast('Copied. Connect → Add a note → paste → Send, then Mark sent.'); } }, 'Copy & open profile'),
            h('button', { type: 'button', class: 'btn-ld small', onclick: async () => { await markSent(it); row.remove(); } }, 'Mark sent'),
            h('button', { type: 'button', class: 'btn-ld small ghost', onclick: async () => { await setItem(it, { queue: 'shortlist' }); row.remove(); } }, 'Back to picked')));
        return row;
      })));
  }

  async function markSent(it) {
    try {
      const flow = it.flow_key || 'skillx';
      const tpl = templatesFor(flow, 'li_connect').find((t) => it.draft.startsWith(t.body.slice(0, 25)));
      const [lead] = await q(sb.from('leads').insert({
        flow_key: flow, channel_key: 'li_connect', name: it.title || 'Unknown', handle: it.url, company: it.company || '', role: it.role || '',
        country: countryCode(it.country), source_inbox_id: it.id, notes: [it.details?.signal, it.custom ? `Custom note: ${it.gist}` : ''].filter(Boolean).join('\n'),
      }).select('id'));
      await logActivity({ flow_key: flow, channel_key: 'li_connect', action_key: 'connect_note', count: 1, lead_id: lead.id, inbox_item_id: it.id, template_id: tpl ? tpl.id : null, note: it.custom ? 'Custom note' : '' });
      await q(sb.from('leads').update({ next_follow_up: followUpAfter('connect_note', 'li_connect') }).eq('id', lead.id));
      await setItem(it, { queue: 'posted', lead_id: lead.id });
      toast(`${it.title}: lead added, request logged`);
      ctx.app.refreshCounts();
    } catch (e) { toast(e.message || explain(e), { error: true }); }
  }
}

const CODES = { 'united states': 'US', usa: 'US', us: 'US', 'united kingdom': 'GB', uk: 'GB', england: 'GB', scotland: 'GB', wales: 'GB', canada: 'CA', australia: 'AU', 'new zealand': 'NZ', ireland: 'IE' };
function countryCode(s) { const k = String(s || '').trim().toLowerCase(); return CODES[k] || (/^[a-z]{2}$/i.test(k) ? k.toUpperCase() : ''); }

function notePrompt(items) {
  return `Write LinkedIn connection-request notes for me, one per person, from my gist. I run SkillX: short, role-based AI courses that take teams past "AI only helps with emails" into their real work. These are HR, People and L&D leads at small and medium companies.

Rules:
- Under 200 characters each (LinkedIn's limit on free accounts). Count them.
- Personal and specific to them, from my gist; plain and warm; no pitch, no links, no "I'd love to pick your brain".
- No emojis. Sound like a person, not an AI.

Answer in exactly this format for each person, nothing else:
### id
the note

People:
${items.map((x) => `### ${sid(x.id)}
${x.title}, ${x.role} at ${x.company} (${x.details?.company_size || '?'} people, ${x.details?.industry || '?'}, ${x.country || '?'})
${x.details?.signal ? `Signal: ${x.details.signal}\n` : ''}My gist: ${x.gist.trim()}`).join('\n\n')}`;
}
