-- Lead desk, part 2 of 3: the OPEN policy set (use this now).
-- Anyone with the anon (publishable) key can read and write every table. That key is public by
-- design: it sits in admin/config.js and in the page-view beacon in assets/site.js. So while this
-- set is on, anyone who finds the key can read and change your leads. Turn on the locked set
-- (supabase/migrations/later/0004_policies_locked.sql) before you store details you'd mind leaking.
--
-- Safe to run again: it also undoes the locked set, so it's the way back if you lock yourself out.

begin;
set local client_min_messages = warning;  -- hide "policy does not exist, skipping" notices

do $$
declare
  t text;
begin
  foreach t in array array[
    'flows', 'actions', 'channels', 'flow_channels', 'places', 'saved_searches', 'templates',
    'inbox_items', 'leads', 'activities', 'metric_definitions', 'metric_values', 'import_runs', 'settings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner only" on public.%I', t);
    execute format('drop policy if exists "open: anon and signed in" on public.%I', t);
    execute format('create policy "open: anon and signed in" on public.%I for all to anon, authenticated using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end $$;

-- Page views: the beacon inserts (only these columns, and only "now"); the dashboard reads.
-- No one but the service role updates or deletes them.
alter table public.page_views enable row level security;
drop policy if exists "owner only" on public.page_views;
drop policy if exists "open: read page views" on public.page_views;
drop policy if exists "beacon: insert page views" on public.page_views;
create policy "open: read page views" on public.page_views
  for select to anon, authenticated using (true);
create policy "beacon: insert page views" on public.page_views
  for insert to anon, authenticated
  with check (viewed_at > now() - interval '5 minutes' and viewed_at < now() + interval '5 minutes');
revoke all on public.page_views from anon, authenticated;
grant select on public.page_views to anon, authenticated;
grant insert (path, host, entry, referrer, utm_source, utm_medium, utm_campaign, utm_content)
  on public.page_views to anon, authenticated;

grant select on public.activity_days, public.page_view_days to anon, authenticated;

commit;
