{
  const top = document.querySelector('.top');
  const onScroll = () => { if (top) top.classList.toggle('scrolled', window.scrollY > 8); };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const y = document.getElementById('year');
  if (y) y.textContent = String(new Date().getFullYear());
}

/* Page views for the lead desk (admin/README.md). Cookie-free: nothing is stored on the visitor's
   device and no personal data is sent. Put the same Supabase URL and anon key as admin/config.js
   in the two lines below; while they're empty the beacon does nothing. Never runs on /admin. */
{
  const SUPABASE_URL = 'https://zpdhxinhwnqafmzdjney.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_l4CJuGIIfmLm2EF5le98AQ_5ouUVn2l';
  try {
    const l = location;
    const off = !SUPABASE_URL || !SUPABASE_ANON_KEY || !/^https?:$/.test(l.protocol)
      || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(l.hostname) || /^\/admin(\/|$)/.test(l.pathname)
      || navigator.webdriver || localStorage.getItem('pv-ignore') === '1';
    if (!off) {
      const q = new URLSearchParams(l.search);
      const cut = (v, n = 100) => (v ? String(v).slice(0, n) : null);
      let referrer = null, entry = true;
      if (document.referrer) {
        const r = new URL(document.referrer);
        entry = r.host !== l.host;
        if (entry) referrer = cut(r.origin + r.pathname, 1024);
      }
      const headers = { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
      if (SUPABASE_ANON_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
      const send = () => fetch(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/page_views`, {
        method: 'POST', headers,
        body: JSON.stringify({
          path: cut(l.pathname, 512) || '/', host: cut(l.host, 255), entry, referrer,
          utm_source: cut(q.get('utm_source')), utm_medium: cut(q.get('utm_medium')),
          utm_campaign: cut(q.get('utm_campaign')), utm_content: cut(q.get('utm_content')),
        }),
      }).catch(() => {});
      if (document.prerendering) document.addEventListener('prerenderingchange', send, { once: true });
      else send();
    }
  } catch (e) { /* never break the page */ }
}
