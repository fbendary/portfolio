-- Lead desk, part 1 of 3: tables, triggers and views.
-- Paste into Supabase → SQL Editor → New query and run. Then run 0002 and 0003.
--
-- Keys (flows.key, channels.key, actions.key, metric_definitions.key) are stable identifiers
-- that other rows point at. Labels can change freely; never rename a key that has rows.

begin;

-- ---------------------------------------------------------------- fixed lists

create table public.flows (
  key        text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  name       text not null,
  buyer      text not null default '',   -- who pays
  audience   text not null default '',   -- who I'm looking for
  offer      text not null default '',
  win        text not null default '',   -- what counts as a win
  markets    text not null default '',
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);

-- What can be logged. direction: out = what I put out, in = what came back,
-- call = a call booked, win = a paying client.
create table public.actions (
  key            text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  label          text not null,
  direction      text not null check (direction in ('out', 'in', 'call', 'win')),
  moves_to_stage text check (moves_to_stage in ('contacted', 'replied', 'call_booked', 'client')),
  is_first_touch boolean not null default false,  -- counts in reply-rate denominators (follow-ups don't)
  minutes        numeric(6,1) not null default 0 check (minutes >= 0),  -- estimated time per unit
  sort           int not null default 0
);

create table public.channels (
  key            text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  label          text not null,
  group_key      text not null check (group_key in ('outreach', 'communities', 'platforms', 'content', 'inbound', 'paid')),
  lane           text not null check (lane in ('volume', 'trust', 'inbound')),
  platform       text not null default '',        -- channels on one platform share places (reddit, linkedin…)
  actions        text[] not null default '{}',    -- action keys that can be logged here
  primary_action text references public.actions(key) on update cascade,
  follow_up_days int check (follow_up_days >= 0), -- default days to the next follow-up
  daily_cap      int check (daily_cap > 0),       -- default daily cap (volume lanes)
  notes          text not null default '',
  sort           int not null default 0
);

-- Which channels each flow uses, and how.
create table public.flow_channels (
  flow_key      text not null references public.flows(key) on update cascade on delete cascade,
  channel_key   text not null references public.channels(key) on update cascade on delete cascade,
  enabled       boolean not null default false,
  phase         text not null default 'later' check (phase in ('now', 'next', 'later')),
  focus         text not null default 'test' check (focus in ('lead', 'test')),  -- lead: a leading channel (the 70%)
  weekly_target int check (weekly_target >= 0),  -- output actions a week
  daily_cap     int check (daily_cap > 0),       -- overrides the channel's default cap for this flow
  where_hint    text not null default '',        -- for example a subreddit or group name
  notes         text not null default '',
  primary key (flow_key, channel_key)
);

-- Specific communities: a subreddit, a Facebook group, a LinkedIn hashtag, an Upwork category.
create table public.places (
  id          uuid primary key default gen_random_uuid(),
  flow_key    text not null references public.flows(key) on update cascade on delete cascade,
  channel_key text not null references public.channels(key) on update cascade,
  name        text not null check (char_length(name) between 1 and 200),
  url         text not null default '',
  rules       text not null default '',   -- self-promotion rules, in your words
  members     int check (members >= 0),   -- entered by hand
  status      text not null default 'to_join' check (status in ('to_join', 'joined', 'active', 'banned', 'avoid')),
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (flow_key, channel_key, name)
);

create table public.saved_searches (
  id          uuid primary key default gen_random_uuid(),
  flow_key    text not null references public.flows(key) on update cascade on delete cascade,
  channel_key text not null references public.channels(key) on update cascade,
  label       text not null,
  query       text not null default '',
  url         text not null check (url ~ '^https://'),
  last_run_at timestamptz,
  notes       text not null default '',
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  unique (flow_key, label)
);

create table public.templates (
  id          uuid primary key default gen_random_uuid(),
  flow_key    text not null references public.flows(key) on update cascade on delete cascade,
  channel_key text references public.channels(key) on update cascade,
  name        text not null,
  body        text not null default '',
  active      boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (flow_key, name)
);

-- ---------------------------------------------------------------- work

-- Threads or posts worth acting on.
create table public.inbox_items (
  id              uuid primary key default gen_random_uuid(),
  flow_key        text references public.flows(key) on update cascade on delete set null,
  channel_key     text references public.channels(key) on update cascade,
  place_id        uuid references public.places(id) on delete set null,
  saved_search_id uuid references public.saved_searches(id) on delete set null,
  url             text not null unique check (url ~ '^https?://' and char_length(url) <= 2000),
  title           text not null default '',
  snippet         text not null default '',
  found_at        timestamptz not null default now(),
  source          text not null default 'manual',  -- manual, f5bot, reddit_api, …
  score           numeric,
  status          text not null default 'new' check (status in ('new', 'engaged', 'skipped', 'lead')),
  lead_id         uuid,  -- foreign key added below
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.leads (
  id              uuid primary key default gen_random_uuid(),
  flow_key        text not null references public.flows(key) on update cascade,
  channel_key     text references public.channels(key) on update cascade,
  place_id        uuid references public.places(id) on delete set null,
  name            text not null check (char_length(name) between 1 and 200),
  handle          text not null default '',  -- @handle or profile URL
  email           text not null default '',
  company         text not null default '',
  role            text not null default '',
  country         text not null default '',  -- two-letter code, for example US or GB
  stage           text not null default 'new'
                  check (stage in ('new', 'contacted', 'replied', 'call_booked', 'client', 'not_now', 'lost')),
  furthest_stage  text not null default 'new'
                  check (furthest_stage in ('new', 'contacted', 'replied', 'call_booked', 'client')),
  contacted_at    timestamptz,  -- each stamp is set the first time the lead reaches that stage
  replied_at      timestamptz,
  call_booked_at  timestamptz,
  client_at       timestamptz,
  not_now_at      timestamptz,
  lost_at         timestamptz,
  value           numeric(12,2) check (value >= 0),  -- optional deal value
  currency        text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  next_follow_up  date,
  last_touch_at   timestamptz,
  source_inbox_id uuid references public.inbox_items(id) on delete set null,
  notes           text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.inbox_items
  add constraint inbox_items_lead_id_fkey foreign key (lead_id) references public.leads(id) on delete set null;

-- One row per action, or one row with a count for batch logging ("12 Facebook comments").
create table public.activities (
  id            uuid primary key default gen_random_uuid(),
  flow_key      text not null references public.flows(key) on update cascade,
  channel_key   text not null references public.channels(key) on update cascade,
  place_id      uuid references public.places(id) on delete set null,
  action_key    text not null references public.actions(key) on update cascade,
  direction     text not null check (direction in ('out', 'in', 'call', 'win')),  -- copied from the action
  count         int not null default 1 check (count between 1 and 10000),
  links         int not null default 0 check (links >= 0 and links <= count),     -- how many included a link
  minutes       numeric(7,1) check (minutes >= 0),  -- actual time, if entered; otherwise the action's estimate
  lead_id       uuid references public.leads(id) on delete set null,
  inbox_item_id uuid references public.inbox_items(id) on delete set null,
  template_id   uuid references public.templates(id) on delete set null,
  occurred_at   timestamptz not null default now(),
  note          text not null default '',
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- metrics

create table public.metric_definitions (
  key       text primary key check (key ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  platform  text not null,
  label     text not null,
  unit      text not null default '',
  cadence   text not null default 'weekly' check (cadence in ('daily', 'weekly', 'monthly')),
  source    text not null default 'manual' check (source in ('manual', 'auto')),
  importer  text,                          -- csv, reddit, activities, page_views
  aggregate text not null default 'sum' check (aggregate in ('sum', 'last', 'list')),
  config    jsonb not null default '{}',   -- how an automatic metric is computed
  sort      int not null default 0
);

-- One row per metric per period (and per source, so manual and imported numbers can sit side by side).
create table public.metric_values (
  id           uuid primary key default gen_random_uuid(),
  metric_key   text not null references public.metric_definitions(key) on update cascade,
  period_start date not null,                     -- the Monday, for weekly metrics
  value        numeric not null,
  source       text not null default 'manual',    -- manual, csv, reddit_api, …
  flow_key     text references public.flows(key) on update cascade,
  note         text not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint metric_values_one_per_period unique nulls not distinct (metric_key, period_start, source, flow_key)
);

-- Portfolio page views from the cookie-free beacon in assets/site.js.
create table public.page_views (
  id           bigint generated always as identity primary key,
  path         text not null check (char_length(path) between 1 and 512),
  host         text check (char_length(host) <= 255),
  entry        boolean not null default true,  -- first page of a visit (referrer is not this site)
  referrer     text check (char_length(referrer) <= 1024),
  utm_source   text check (char_length(utm_source) <= 100),
  utm_medium   text check (char_length(utm_medium) <= 100),
  utm_campaign text check (char_length(utm_campaign) <= 100),
  utm_content  text check (char_length(utm_content) <= 100),
  country      text check (char_length(country) <= 2),
  viewed_at    timestamptz not null default now()
);

-- The log for automation: every importer run, manual or scheduled.
create table public.import_runs (
  id          uuid primary key default gen_random_uuid(),
  importer    text not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'running' check (status in ('running', 'ok', 'error', 'skipped')),
  rows        int not null default 0,
  error       text,
  meta        jsonb not null default '{}'
);

-- Checklists, preferences and plan content.
create table public.settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- indexes

create index activities_occurred_at_idx on public.activities (occurred_at desc);
create index activities_lead_idx on public.activities (lead_id) where lead_id is not null;
create index activities_template_idx on public.activities (template_id) where template_id is not null;
create index activities_flow_idx on public.activities (flow_key, occurred_at desc);
create index leads_flow_stage_idx on public.leads (flow_key, stage);
create index leads_follow_up_idx on public.leads (next_follow_up) where next_follow_up is not null;
create index inbox_items_status_idx on public.inbox_items (status, found_at desc);
create index places_flow_channel_idx on public.places (flow_key, channel_key);
create index metric_values_metric_idx on public.metric_values (metric_key, period_start);
create index page_views_viewed_at_idx on public.page_views (viewed_at desc);
create index import_runs_started_idx on public.import_runs (importer, started_at desc);

-- ---------------------------------------------------------------- triggers

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger places_updated before update on public.places
  for each row execute function public.touch_updated_at();
create trigger templates_updated before update on public.templates
  for each row execute function public.touch_updated_at();
create trigger inbox_items_updated before update on public.inbox_items
  for each row execute function public.touch_updated_at();
create trigger metric_values_updated before update on public.metric_values
  for each row execute function public.touch_updated_at();
create trigger settings_updated before update on public.settings
  for each row execute function public.touch_updated_at();

-- Funnel order. Not now and Lost sit outside it and keep the furthest stage reached.
create function public.stage_rank(stage text) returns int
language sql immutable set search_path = '' as $$
  select case stage
    when 'new' then 0 when 'contacted' then 1 when 'replied' then 2
    when 'call_booked' then 3 when 'client' then 4 else -1 end
$$;

-- Stamp the first time a lead reaches each stage. Jumping ahead (an enquiry that starts at
-- Replied) stamps the stages it skipped too, so funnel counts stay consistent.
create function public.leads_stamp_stages() returns trigger
language plpgsql set search_path = '' as $$
declare
  ts timestamptz := now();
begin
  if new.stage in ('contacted', 'replied', 'call_booked', 'client') and new.contacted_at is null then new.contacted_at := ts; end if;
  if new.stage in ('replied', 'call_booked', 'client') and new.replied_at is null then new.replied_at := ts; end if;
  if new.stage in ('call_booked', 'client') and new.call_booked_at is null then new.call_booked_at := ts; end if;
  if new.stage = 'client' and new.client_at is null then new.client_at := ts; end if;
  if new.stage = 'not_now' and new.not_now_at is null then new.not_now_at := ts; end if;
  if new.stage = 'lost' and new.lost_at is null then new.lost_at := ts; end if;
  new.furthest_stage := case
    when new.client_at is not null then 'client'
    when new.call_booked_at is not null then 'call_booked'
    when new.replied_at is not null then 'replied'
    when new.contacted_at is not null then 'contacted'
    else 'new' end;
  if tg_op = 'UPDATE' then new.updated_at := ts; end if;
  return new;
end $$;

create trigger leads_stamp before insert or update on public.leads
  for each row execute function public.leads_stamp_stages();

-- A lead made from an inbox item marks the item.
create function public.leads_mark_inbox() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.source_inbox_id is not null then
    update public.inbox_items set status = 'lead', lead_id = new.id where id = new.source_inbox_id;
  end if;
  return null;
end $$;

create trigger leads_inbox after insert on public.leads
  for each row execute function public.leads_mark_inbox();

-- Every activity takes its direction from its action.
create function public.activities_set_direction() returns trigger
language plpgsql set search_path = '' as $$
begin
  select a.direction into new.direction from public.actions a where a.key = new.action_key;
  return new;
end $$;

create trigger activities_direction before insert or update of action_key on public.activities
  for each row execute function public.activities_set_direction();

-- A touch on a lead moves it forward (never back), and an activity on an inbox item marks it engaged.
create function public.activities_apply() returns trigger
language plpgsql set search_path = '' as $$
declare
  target text;
  current_stage text;
begin
  if new.inbox_item_id is not null then
    update public.inbox_items set status = 'engaged' where id = new.inbox_item_id and status = 'new';
  end if;
  if new.lead_id is null then return null; end if;
  select a.moves_to_stage into target from public.actions a where a.key = new.action_key;
  select l.stage into current_stage from public.leads l where l.id = new.lead_id;
  update public.leads l
     set last_touch_at = greatest(coalesce(l.last_touch_at, new.occurred_at), new.occurred_at),
         stage = case
           when target is null then l.stage
           when l.stage in ('not_now', 'lost') and public.stage_rank(target) >= 2 then target  -- they came back
           when l.stage not in ('not_now', 'lost') and public.stage_rank(target) > public.stage_rank(l.stage) then target
           else l.stage end
   where l.id = new.lead_id;
  return null;
end $$;

create trigger activities_apply after insert on public.activities
  for each row execute function public.activities_apply();

-- ---------------------------------------------------------------- views

-- The time zone the dashboard counts days in (settings → prefs → tz), UTC until set.
create function public.app_tz() returns text
language sql stable set search_path = '' as $$
  select coalesce(
    (select s.value ->> 'tz' from public.settings s
      where s.key = 'prefs'
        and exists (select 1 from pg_catalog.pg_timezone_names z where z.name = s.value ->> 'tz')),
    'UTC')
$$;

-- Activity summed per local day: what the charts and rates read, so they never page through raw rows.
create view public.activity_days with (security_invoker = true) as
select (a.occurred_at at time zone (select public.app_tz()))::date as day,
       a.flow_key, a.channel_key, a.action_key, a.direction, a.template_id, a.place_id,
       bool_or(x.is_first_touch) as first_touch,
       sum(a.count)::int as n,
       sum(a.links)::int as links,
       round(sum(coalesce(a.minutes, a.count * x.minutes)))::int as minutes
  from public.activities a
  join public.actions x on x.key = a.action_key
 group by 1, 2, 3, 4, 5, 6, 7;

-- Page views per local day, with the referrer reduced to its host.
create view public.page_view_days with (security_invoker = true) as
select (p.viewed_at at time zone (select public.app_tz()))::date as day,
       p.path, p.host, p.entry,
       lower(substring(p.referrer from '^[a-z]+://([^/:?#]+)')) as referrer_host,
       p.utm_source, p.utm_medium, p.utm_campaign, p.country,
       count(*)::int as n
  from public.page_views p
 group by 1, 2, 3, 4, 5, 6, 7, 8, 9;

-- Importers use the service role, which bypasses RLS but still needs table rights.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;

commit;
