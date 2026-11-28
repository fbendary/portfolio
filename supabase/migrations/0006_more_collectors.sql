-- Lead desk: Hacker News, Stack Exchange and Bluesky collectors feeding the review queue.
-- Adds a Bluesky channel, and each collector's phrases (or Stack Exchange sites) per flow in
-- settings → importers. Edit the phrases there; keys are flow keys. Safe to run again.

begin;

insert into public.channels (key, label, group_key, lane, platform, actions, primary_action, follow_up_days, notes, sort) values
  ('bluesky', 'Bluesky', 'content', 'trust', 'bluesky', '{post_published,comment,dm_sent,reply,enquiry,call_booked,client_won}', 'comment', 3,
   'Replies to people asking for help; posts of your own. The collector brings matching posts into the Queue.', 26)
on conflict (key) do nothing;

insert into public.flow_channels (flow_key, channel_key, enabled, phase, focus, where_hint)
select f.key, 'bluesky', true, 'now', 'test', 'Posts matching the collector''s phrases' from public.flows f
on conflict do nothing;

update public.settings set value = value
  || jsonb_build_object('hn', coalesce(value -> 'hn', jsonb_build_object('enabled', true, 'queries', $q${
       "freelance": ["internal tool", "spreadsheet", "Google Sheets", "Airtable", "Apps Script", "admin panel", "no-code"],
       "skillx": ["Copilot rollout", "AI adoption", "AI training", "ChatGPT at work"],
       "careerdb": ["career change", "switch careers", "job search"]
     }$q$::jsonb)))
  || jsonb_build_object('stackexchange', coalesce(value -> 'stackexchange', jsonb_build_object('enabled', true, 'queries', $q${
       "careerdb": ["workplace"],
       "freelance": ["softwarerecs", "webapps:google-sheets"]
     }$q$::jsonb)))
  || jsonb_build_object('bluesky', coalesce(value -> 'bluesky', jsonb_build_object('enabled', true, 'queries', $q${
       "careerdb": ["career change", "no idea what career", "job search", "laid off"],
       "skillx": ["Copilot rollout", "AI adoption", "AI training for employees"],
       "freelance": ["spreadsheet hell", "internal tool", "Airtable"],
       "carna": ["no time to work out", "meal prep", "busy mom healthy"]
     }$q$::jsonb)))
 where key = 'importers';

commit;
