-- Lead desk: the LOCKED policy set. Run this later, when you turn on the lock.
-- After it, only your own signed-in user can read or write anything. The anon key can still
-- insert page views (that's all the public beacon does) and nothing else.
--
-- Before you run it (admin/README.md, "Turn on the lock", has the full steps):
--   1. Supabase → Authentication → Users → Add user → Create new user, with your email.
--   2. Put that email on the owner_email line below.
-- Then run the whole file, set REQUIRE_AUTH = true and OWNER_EMAIL in admin/config.js, and deploy.
--
-- To undo: run 0002_policies_open.sql again.

begin;
set local client_min_messages = warning;  -- hide "policy does not exist, skipping" notices

create schema if not exists private;  -- not exposed through the API

create table if not exists private.owner (
  id        uuid primary key references auth.users(id) on delete cascade,
  email     text not null,
  locked_at timestamptz not null default now()
);

do $$
declare
  owner_email text := 'you@example.com';  -- ← your email (the same as OWNER_EMAIL in admin/config.js)
  owner_id uuid;
begin
  if owner_email = 'you@example.com' then
    raise exception 'Put your email on the owner_email line first. Nothing was changed.';
  end if;
  select u.id into owner_id from auth.users u where lower(u.email) = lower(owner_email);
  if owner_id is null then
    raise exception 'No user with the email %. Create it first: Authentication → Users → Add user. Nothing was changed.', owner_email;
  end if;
  delete from private.owner;
  insert into private.owner (id, email) values (owner_id, owner_email);
end $$;

-- True only for the owner's session. Security definer so policies can read private.owner.
create or replace function private.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.owner o where o.id = (select auth.uid()))
$$;
revoke all on function private.is_owner() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_owner() to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'flows', 'actions', 'channels', 'flow_channels', 'places', 'saved_searches', 'templates',
    'inbox_items', 'leads', 'activities', 'metric_definitions', 'metric_values', 'import_runs', 'settings'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "open: anon and signed in" on public.%I', t);
    execute format('drop policy if exists "owner only" on public.%I', t);
    execute format('create policy "owner only" on public.%I for all to authenticated using ((select private.is_owner())) with check ((select private.is_owner()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Page views: the beacon (anon) can only insert; only the owner can read or clear them.
alter table public.page_views enable row level security;
drop policy if exists "open: read page views" on public.page_views;
drop policy if exists "owner only" on public.page_views;
drop policy if exists "beacon: insert page views" on public.page_views;
create policy "owner only" on public.page_views
  for all to authenticated using ((select private.is_owner())) with check ((select private.is_owner()));
create policy "beacon: insert page views" on public.page_views
  for insert to anon
  with check (viewed_at > now() - interval '5 minutes' and viewed_at < now() + interval '5 minutes');
revoke all on public.page_views from anon, authenticated;
grant insert (path, host, entry, referrer, utm_source, utm_medium, utm_campaign, utm_content)
  on public.page_views to anon;
grant select, insert, delete on public.page_views to authenticated;

revoke select on public.activity_days, public.page_view_days from anon;
grant select on public.activity_days, public.page_view_days to authenticated;

commit;
