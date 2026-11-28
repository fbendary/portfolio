-- Lead desk: collection with Claude in Chrome. LinkedIn prospects (people, for SkillX) and Facebook
-- posts (for Carna) arrive as inbox_items; Facebook groups arrive as places.
--   kind 'person': a prospect; queue null = new, shortlist = picked, approved = note ready,
--   posted = connection request sent (a lead is created), pass = skipped.
-- settings → collect holds each prompt's criteria, editable on the Collect page. Safe to run again.

begin;

alter table public.inbox_items drop constraint if exists inbox_items_kind_check;
alter table public.inbox_items add constraint inbox_items_kind_check check (kind in ('post', 'comment', 'person'));
alter table public.inbox_items add column if not exists company text not null default '';
alter table public.inbox_items add column if not exists role text not null default '';
alter table public.inbox_items add column if not exists country text not null default '';
alter table public.inbox_items add column if not exists details jsonb not null default '{}';  -- company size, industry, links, signal
alter table public.inbox_items add column if not exists custom boolean not null default false; -- gets a custom message

create index if not exists inbox_items_kind_idx on public.inbox_items (kind, queue, found_at desc);

insert into public.settings (key, value) values ('collect', $json${
  "linkedin": {
    "flow": "skillx",
    "titles": ["Head of People", "HR Director", "HR Manager", "Head of HR", "People Operations Manager", "L&D Manager", "Head of Learning and Development", "Learning and Development Manager", "Chief People Officer", "VP People"],
    "countries": ["United States", "United Kingdom", "Canada", "Australia", "New Zealand", "Ireland"],
    "sizes": ["11-50", "51-200"],
    "exclude": "software, IT services, internet, computer and network security, information technology, SaaS or any tech company; recruiting, staffing and HR consultancies; agencies selling training",
    "cap": 40
  },
  "facebook_groups": {
    "flow": "carna",
    "terms": ["busy moms", "working moms", "soccer moms", "sports parents", "youth sports parents", "busy professionals health", "healthy habits", "weight loss support", "meal prep", "healthy eating", "fitness over 40", "walking group", "sleep problems", "stress and burnout", "plant based"],
    "cap": 60
  },
  "facebook_posts": {
    "flow": "carna",
    "terms": ["no time to exercise", "always tired", "how do you stay healthy", "need motivation", "meal ideas busy", "can't sleep", "lose weight busy schedule", "burnt out"],
    "days": 3,
    "cap": 50
  }
}$json$)
on conflict (key) do nothing;

commit;
