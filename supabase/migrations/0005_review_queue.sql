-- Lead desk: the review queue for collected threads and comments.
-- Collected items (source reddit_api, f5bot…) move through: untriaged → shortlist (picked in triage,
-- with a reason and an angle) → approved (a final comment is ready) → posted. "pass" = looked at, not worth it.
-- Safe to run again.

begin;

alter table public.inbox_items add column if not exists kind text not null default 'post' check (kind in ('post', 'comment'));
alter table public.inbox_items add column if not exists author text not null default '';
alter table public.inbox_items add column if not exists queue text check (queue in ('shortlist', 'pass', 'approved', 'posted'));
alter table public.inbox_items add column if not exists reason text not null default '';   -- why triage picked it
alter table public.inbox_items add column if not exists angle text not null default '';    -- what to say, in a line
alter table public.inbox_items add column if not exists gist text not null default '';     -- your idea for the reply
alter table public.inbox_items add column if not exists draft text not null default '';    -- the comment to post
alter table public.inbox_items add column if not exists exported_at timestamptz;          -- sent to Claude in Chrome

create index if not exists inbox_items_queue_idx on public.inbox_items (queue, found_at desc);
create index if not exists inbox_items_source_idx on public.inbox_items (source, found_at desc);

commit;
