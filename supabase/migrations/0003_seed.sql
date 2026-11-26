-- Lead desk, part 3 of 3: the fixed lists. No leads, activity or metric values: those are yours to log.
-- Safe to run again: existing rows are kept as they are (plan content in settings is refreshed).

begin;

-- ---------------------------------------------------------------- flows

insert into public.flows (key, name, buyer, audience, offer, win, markets, sort) values
  ('carna', 'Carna', 'The person',
   'Busy professionals and sports parents, curious about or struggling with their health',
   'Wellness coaching and tools: a two-month coaching engagement, then check-ins, with a free questionnaire and recipe finder',
   'A paying client', 'English-speaking countries', 1),
  ('careerdb', 'CareerDB', 'The person',
   'People who struggle to find a job because they have no clear career identity',
   'A job-search tool that lays out several career options and helps them apply for each',
   'A paying client', 'English-speaking countries', 2),
  ('skillx', 'SkillX', 'The employer',
   'HR, L&D, People Ops and operations leads at companies of about 20 to 200 people whose staff say AI gives them nothing beyond writing emails',
   'AI upskilling courses that take teams past writing emails into their real work',
   'A paying client (a company)', 'English-speaking countries', 3),
  ('freelance', 'Freelancing', 'Small businesses',
   'Small businesses that need an internal tool: dashboards, trackers, spreadsheet replacements, automations',
   'Small custom builds, with CareerDB, SkillX and Carna as the showcase',
   'A paying client', 'English-speaking countries, less tied to one', 4)
on conflict (key) do nothing;

-- ---------------------------------------------------------------- actions
-- minutes: a rough time per unit, used only for the 70/30 hours split when no time is entered.

insert into public.actions (key, label, direction, moves_to_stage, is_first_touch, minutes, sort) values
  ('email_sent',     'Email sent',                    'out',  'contacted',   true,  6,  1),
  ('connect_note',   'Connection note sent',          'out',  'contacted',   true,  3,  2),
  ('dm_sent',        'Message sent',                  'out',  'contacted',   true,  5,  3),
  ('proposal_sent',  'Proposal sent',                 'out',  'contacted',   true,  20, 4),
  ('comment',        'Comment or answer',             'out',  'contacted',   true,  6,  5),
  ('post_published', 'Post published',                'out',  null,          true,  45, 6),
  ('follow_up',      'Follow-up sent',                'out',  'contacted',   false, 2,  7),
  ('intro_ask',      'Asked for an intro or referral','out',  'contacted',   true,  4,  8),
  ('event',          'Event attended or held',        'out',  null,          true,  90, 9),
  ('ad_run',         'Ad running',                    'out',  null,          false, 15, 10),
  ('accepted',       'Connection accepted',           'in',   null,          false, 0,  11),
  ('reply',          'Reply received',                'in',   'replied',     false, 5,  12),
  ('enquiry',        'Enquiry or invite',             'in',   'replied',     false, 10, 13),
  ('call_booked',    'Call booked',                   'call', 'call_booked', false, 30, 14),
  ('client_won',     'Client won',                    'win',  'client',      false, 0,  15)
on conflict (key) do nothing;

-- ---------------------------------------------------------------- channels
-- Lanes: volume (daily caps, reply rate per template), trust (helpful engagement; watch links per
-- comment), inbound (enquiries that come to you).

insert into public.channels (key, label, group_key, lane, platform, actions, primary_action, follow_up_days, daily_cap, notes, sort) values
  ('cold_email', 'Cold email', 'outreach', 'volume', 'email',
   '{email_sent,follow_up,reply,call_booked,client_won}', 'email_sent', 4, 40,
   'About 30 to 50 a day per warmed-up inbox; 10 to 20 while it warms up. Follow up once or twice, then stop.', 1),
  ('li_connect', 'LinkedIn connection notes', 'outreach', 'volume', 'linkedin',
   '{connect_note,accepted,reply,call_booked,client_won}', 'connect_note', 4, 20,
   'LinkedIn limits invitations a week, so 20 a weekday is a safe ceiling. Free accounts can add a note to only a few invitations a month; keep notes under 200 characters.', 2),
  ('li_dm', 'LinkedIn DMs', 'outreach', 'volume', 'linkedin',
   '{dm_sent,follow_up,reply,call_booked,client_won}', 'dm_sent', 4, 25,
   'First-degree connections, after a real exchange. One follow-up.', 3),
  ('fb_dm', 'Facebook DMs', 'outreach', 'volume', 'facebook',
   '{dm_sent,follow_up,reply,call_booked,client_won}', 'dm_sent', 3, 15,
   'Only people who asked or replied in a group. Bursts of messages to strangers get accounts restricted.', 4),
  ('upwork', 'Upwork proposals', 'platforms', 'volume', 'upwork',
   '{proposal_sent,follow_up,reply,enquiry,call_booked,client_won}', 'proposal_sent', 3, 5,
   'Each proposal costs Connects: fewer, better ones on jobs with few proposals and verified payment.', 5),
  ('li_comment', 'LinkedIn comments', 'communities', 'trust', 'linkedin',
   '{comment,reply,enquiry,call_booked,client_won}', 'comment', 3, null,
   'Thoughtful comments on your buyers’ posts, for a week before you connect.', 6),
  ('reddit_comment', 'Reddit comments', 'communities', 'trust', 'reddit',
   '{comment,dm_sent,reply,enquiry,call_booked,client_won}', 'comment', 2, null,
   'Answer the question in full. Links in well under one comment in ten; many subreddits ban self-promotion outright. Message only people who ask.', 7),
  ('reddit_post', 'Reddit posts', 'communities', 'trust', 'reddit',
   '{post_published,reply,enquiry,call_booked,client_won}', 'post_published', 2, null,
   'Only where the rules allow, and only something useful on its own.', 8),
  ('fb_group_comment', 'Facebook group comments', 'communities', 'trust', 'facebook',
   '{comment,reply,enquiry,call_booked,client_won}', 'comment', 2, null,
   'Helpful replies in groups. Read each group’s rules; ask the admins before any promotion.', 9),
  ('fb_group_post', 'Facebook group posts', 'communities', 'trust', 'facebook',
   '{post_published,reply,enquiry,call_booked,client_won}', 'post_published', 2, null,
   'Promo days and promo threads only, unless the group says otherwise.', 10),
  ('forums', 'Forums and Quora', 'communities', 'trust', 'forums',
   '{comment,post_published,reply,enquiry}', 'comment', null, null,
   'Long answers to common questions keep bringing people in.', 11),
  ('chat_groups', 'Discord and Slack communities', 'communities', 'trust', 'chat',
   '{comment,post_published,dm_sent,reply,enquiry,call_booked,client_won}', 'comment', 3, null,
   'Show up weekly and answer well. Never message members out of the blue.', 12),
  ('local_clubs', 'Local clubs, schools and PTAs', 'communities', 'trust', 'local',
   '{email_sent,dm_sent,follow_up,event,reply,call_booked,client_won}', 'email_sent', 5, null,
   'Write to the club secretary or PTA chair with one specific, useful offer.', 13),
  ('events', 'Local events and meetups', 'communities', 'trust', 'local',
   '{event,enquiry,call_booked,client_won}', 'event', 2, null,
   'Talks, walks, meetups and fairs. Follow up with everyone you met within a day.', 14),
  ('li_post', 'LinkedIn posts', 'content', 'trust', 'linkedin',
   '{post_published,reply,enquiry,call_booked,client_won}', 'post_published', null, null,
   'One idea per post, in plain words.', 15),
  ('x', 'X (Twitter)', 'content', 'trust', 'x',
   '{post_published,comment,dm_sent,reply,enquiry,call_booked,client_won}', 'post_published', 3, null, '', 16),
  ('instagram', 'Instagram', 'content', 'trust', 'instagram',
   '{post_published,comment,dm_sent,reply,enquiry,call_booked,client_won}', 'post_published', 3, null, '', 17),
  ('newsletter', 'Newsletter', 'content', 'trust', 'newsletter',
   '{post_published,reply,enquiry,call_booked,client_won}', 'post_published', null, null,
   'Newsletters fall under CAN-SPAM too: postal address and an unsubscribe link in every issue.', 18),
  ('product_hunt', 'Product Hunt', 'platforms', 'trust', 'producthunt',
   '{post_published,comment,enquiry,call_booked,client_won}', 'comment', null, null, '', 19),
  ('indie_hackers', 'Indie Hackers', 'platforms', 'trust', 'indiehackers',
   '{post_published,comment,reply,enquiry,call_booked,client_won}', 'comment', 3, null, '', 20),
  ('warm', 'Warm network (people I know)', 'inbound', 'inbound', 'people',
   '{dm_sent,intro_ask,follow_up,reply,enquiry,call_booked,client_won}', 'dm_sent', 7, null,
   'Ask for introductions, not purchases.', 21),
  ('referrals', 'Referrals', 'inbound', 'inbound', 'people',
   '{intro_ask,enquiry,call_booked,client_won}', 'intro_ask', 7, null,
   'Ask happy clients at the right moment, with a message they can forward.', 22),
  ('partners', 'Partners', 'inbound', 'inbound', 'people',
   '{email_sent,dm_sent,follow_up,reply,enquiry,call_booked,client_won}', 'email_sent', 5, null,
   'Businesses that see your buyers first and don’t do what you do.', 23),
  ('site', 'Portfolio site', 'inbound', 'inbound', 'site',
   '{enquiry,reply,call_booked,client_won}', 'enquiry', 1, null,
   'Enquiries from the site. Reply within the hour if you can.', 24),
  ('paid_ads', 'Paid ads', 'paid', 'inbound', 'ads',
   '{ad_run,enquiry,call_booked,client_won}', 'ad_run', 1, null,
   'Only once a free channel has shown what works, and with a budget.', 25)
on conflict (key) do nothing;

-- ---------------------------------------------------------------- channels per flow
-- Every flow gets a row for every channel (off by default), then the defaults below switch on the
-- channels from each flow’s “where they are”. Plenty sit in Now, so many can be tested at once.

insert into public.flow_channels (flow_key, channel_key)
select f.key, c.key from public.flows f cross join public.channels c
on conflict do nothing;

with defaults (flow_key, channel_key, phase, focus, weekly_target, where_hint) as (values
  -- Carna: Facebook groups first, then health subreddits, LinkedIn, local clubs.
  ('carna', 'fb_group_comment', 'now',   'lead', 30,   'Local parent groups, school and club parent groups, health and running groups'),
  ('carna', 'fb_group_post',    'now',   'lead', 1,    'Promo days and promo threads, per each group’s rules'),
  ('carna', 'reddit_comment',   'now',   'lead', 15,   'r/workingmoms, r/Mommit, r/loseit, r/beginnerfitness, r/EatCheapAndHealthy, r/sleep'),
  ('carna', 'li_comment',       'now',   'test', 6,    'Working parents, HR and wellbeing leads'),
  ('carna', 'li_connect',       'now',   'test', 15,   'Busy professionals and working parents'),
  ('carna', 'warm',             'now',   'test', 5,    'Friends, family, colleagues and other parents'),
  ('carna', 'local_clubs',      'now',   'test', 3,    'Youth sports clubs, schools and PTAs near you'),
  ('carna', 'site',             'now',   'test', null, 'The questionnaire and the contact page'),
  ('carna', 'li_dm',            'next',  'test', 5,    'Connections after a real exchange'),
  ('carna', 'fb_dm',            'next',  'test', 5,    'Only people who asked for more in a group'),
  ('carna', 'li_post',          'next',  'test', 1,    ''),
  ('carna', 'reddit_post',      'next',  'test', 1,    'Only where the rules allow'),
  ('carna', 'instagram',        'next',  'test', 3,    ''),
  ('carna', 'events',           'next',  'test', 1,    'A walk during practice, or a free talk for parents'),
  ('carna', 'partners',         'next',  'test', 2,    'Studios, physios, dietitians, cafés'),
  ('carna', 'referrals',        'next',  'test', null, 'Clients from week six on'),
  ('carna', 'newsletter',       'later', 'test', 1,    ''),
  ('carna', 'forums',           'later', 'test', 3,    'Quora: healthy eating, sleep, beginner exercise'),
  ('carna', 'chat_groups',      'later', 'test', 3,    'Parent and neighbourhood groups'),
  ('carna', 'x',                'later', 'test', 3,    ''),
  ('carna', 'cold_email',       'later', 'test', 10,   'Clubs, partners and workplaces; private individuals in the US only'),
  ('carna', 'paid_ads',         'later', 'test', null, ''),
  -- CareerDB: career-advice subreddits, LinkedIn #opentowork, career-change groups.
  ('careerdb', 'reddit_comment',   'now',   'lead', 35,   'r/findapath, r/careerguidance, r/jobs, r/careeradvice, r/resumes'),
  ('careerdb', 'li_comment',       'now',   'lead', 20,   '#opentowork and career-change posts'),
  ('careerdb', 'fb_group_comment', 'now',   'test', 8,    'Career-change and job-seeker groups'),
  ('careerdb', 'li_connect',       'now',   'test', 10,   'People posting about a career change'),
  ('careerdb', 'li_post',          'now',   'test', 1,    'What you learn from people’s searches'),
  ('careerdb', 'forums',           'now',   'test', 3,    'Quora career-change questions'),
  ('careerdb', 'warm',             'now',   'test', 3,    'People you know who are job hunting'),
  ('careerdb', 'site',             'now',   'test', null, ''),
  ('careerdb', 'reddit_post',      'next',  'test', 1,    'Only where the rules allow, for example a free guide'),
  ('careerdb', 'li_dm',            'next',  'test', 5,    'Connections who engaged with you'),
  ('careerdb', 'fb_dm',            'next',  'test', 3,    'Only people who asked for more'),
  ('careerdb', 'chat_groups',      'next',  'test', 3,    'Career and job-search Discords'),
  ('careerdb', 'product_hunt',     'next',  'test', 1,    'A launch, once CareerDB is ready for one'),
  ('careerdb', 'x',                'next',  'test', 3,    ''),
  ('careerdb', 'referrals',        'next',  'test', null, ''),
  ('careerdb', 'newsletter',       'later', 'test', 1,    ''),
  ('careerdb', 'partners',         'later', 'test', 2,    'Career coaches, bootcamps, university career services'),
  ('careerdb', 'paid_ads',         'later', 'test', null, ''),
  -- SkillX: LinkedIn is the main channel; HR subreddits for research and wording; cold email last.
  ('skillx', 'li_connect',     'now',   'lead', 25,   'HR, L&D, People Ops and operations leads at 20–200 person companies'),
  ('skillx', 'li_comment',     'now',   'lead', 15,   'Posts on AI adoption and Copilot ROI'),
  ('skillx', 'li_dm',          'now',   'lead', 10,   'Connections who engaged with you'),
  ('skillx', 'li_post',        'now',   'test', 1,    'What you learn from the research'),
  ('skillx', 'reddit_comment', 'now',   'test', 5,    'r/humanresources, r/managers, r/ChatGPTPro: research and wording, not selling'),
  ('skillx', 'warm',           'now',   'test', 5,    'People you know in HR, L&D and operations'),
  ('skillx', 'site',           'now',   'test', null, ''),
  ('skillx', 'partners',       'next',  'test', 2,    'HR consultancies, L&D providers, fractional people leaders'),
  ('skillx', 'chat_groups',    'next',  'test', 3,    'HR and L&D Slack communities'),
  ('skillx', 'events',         'next',  'test', 1,    'HR meetups and webinars'),
  ('skillx', 'referrals',      'next',  'test', null, ''),
  ('skillx', 'x',              'next',  'test', 3,    ''),
  ('skillx', 'newsletter',     'next',  'test', 1,    ''),
  ('skillx', 'forums',         'later', 'test', 3,    ''),
  ('skillx', 'cold_email',     'later', 'test', 25,   'Companies of 20 to 200 people, business addresses only'),
  ('skillx', 'paid_ads',       'later', 'test', null, ''),
  -- Freelancing: Upwork, small-business subreddits, people you know, LinkedIn, the portfolio site.
  ('freelance', 'upwork',         'now',   'lead', 12,   'Internal tools, dashboards, automations'),
  ('freelance', 'reddit_comment', 'now',   'lead', 10,   'r/smallbusiness, r/Entrepreneur, r/sweatystartup'),
  ('freelance', 'warm',           'now',   'lead', 5,    'Business owners you know'),
  ('freelance', 'li_connect',     'now',   'test', 15,   'Owners and operations managers at small businesses'),
  ('freelance', 'li_dm',          'now',   'test', 5,    'Connections who engaged with you'),
  ('freelance', 'li_post',        'now',   'test', 1,    'Short build notes from CareerDB, SkillX and Carna'),
  ('freelance', 'referrals',      'now',   'test', null, 'Past clients and people you know'),
  ('freelance', 'site',           'now',   'test', null, ''),
  ('freelance', 'indie_hackers',  'next',  'test', 5,    ''),
  ('freelance', 'x',              'next',  'test', 3,    ''),
  ('freelance', 'chat_groups',    'next',  'test', 3,    'Small-business and no-code communities'),
  ('freelance', 'partners',       'next',  'test', 2,    'Agencies and consultants who turn down small builds'),
  ('freelance', 'reddit_post',    'later', 'test', 1,    'Self-promotion threads only'),
  ('freelance', 'forums',         'later', 'test', 3,    ''),
  ('freelance', 'events',         'later', 'test', 1,    'Local business meetups'),
  ('freelance', 'cold_email',     'later', 'test', 20,   'Small businesses; business addresses only outside the US'),
  ('freelance', 'paid_ads',       'later', 'test', null, '')
)
update public.flow_channels fc
   set enabled = true, phase = d.phase, focus = d.focus, weekly_target = d.weekly_target, where_hint = d.where_hint
  from defaults d
 where fc.flow_key = d.flow_key and fc.channel_key = d.channel_key
   and not fc.enabled and fc.weekly_target is null and fc.where_hint = '';  -- only rows never edited

-- ---------------------------------------------------------------- places
-- Real communities named in the plan. Member counts and rules are yours to fill in after reading each one.

insert into public.places (flow_key, channel_key, name, url, notes) values
  ('careerdb', 'reddit_comment', 'r/findapath',     'https://www.reddit.com/r/findapath/new/',     'Read the sidebar rules before posting.'),
  ('careerdb', 'reddit_comment', 'r/careerguidance','https://www.reddit.com/r/careerguidance/new/','Read the sidebar rules before posting.'),
  ('careerdb', 'reddit_comment', 'r/jobs',          'https://www.reddit.com/r/jobs/new/',          'Read the sidebar rules before posting.'),
  ('careerdb', 'reddit_comment', 'r/careeradvice',  'https://www.reddit.com/r/careeradvice/new/',  'Read the sidebar rules before posting.'),
  ('careerdb', 'reddit_comment', 'r/resumes',       'https://www.reddit.com/r/resumes/new/',       'Read the sidebar rules before posting.'),
  ('careerdb', 'li_comment',     '#opentowork',     'https://www.linkedin.com/feed/hashtag/opentowork/',   ''),
  ('careerdb', 'li_comment',     '#careerchange',   'https://www.linkedin.com/feed/hashtag/careerchange/', ''),
  ('careerdb', 'li_comment',     '#jobsearch',      'https://www.linkedin.com/feed/hashtag/jobsearch/',    ''),
  ('skillx',   'reddit_comment', 'r/humanresources','https://www.reddit.com/r/humanresources/new/','Research and wording, not selling.'),
  ('skillx',   'reddit_comment', 'r/managers',      'https://www.reddit.com/r/managers/new/',      'Research and wording, not selling.'),
  ('skillx',   'reddit_comment', 'r/ChatGPTPro',    'https://www.reddit.com/r/ChatGPTPro/new/',    'Research and wording, not selling.'),
  ('skillx',   'li_comment',     '#learninganddevelopment', 'https://www.linkedin.com/feed/hashtag/learninganddevelopment/', ''),
  ('skillx',   'li_comment',     '#aiadoption',     'https://www.linkedin.com/feed/hashtag/aiadoption/', ''),
  ('freelance','reddit_comment', 'r/smallbusiness', 'https://www.reddit.com/r/smallbusiness/new/', 'Read the sidebar rules before posting.'),
  ('freelance','reddit_comment', 'r/Entrepreneur',  'https://www.reddit.com/r/Entrepreneur/new/',  'Read the sidebar rules before posting.'),
  ('freelance','reddit_comment', 'r/sweatystartup', 'https://www.reddit.com/r/sweatystartup/new/', 'Read the sidebar rules before posting.'),
  ('carna',    'reddit_comment', 'r/workingmoms',   'https://www.reddit.com/r/workingmoms/new/',   ''),
  ('carna',    'reddit_comment', 'r/Mommit',        'https://www.reddit.com/r/Mommit/new/',        ''),
  ('carna',    'reddit_comment', 'r/loseit',        'https://www.reddit.com/r/loseit/new/',        ''),
  ('carna',    'reddit_comment', 'r/xxfitness',     'https://www.reddit.com/r/xxfitness/new/',     ''),
  ('carna',    'reddit_comment', 'r/beginnerfitness','https://www.reddit.com/r/beginnerfitness/new/',''),
  ('carna',    'reddit_comment', 'r/Fitness30plus', 'https://www.reddit.com/r/Fitness30plus/new/', ''),
  ('carna',    'reddit_comment', 'r/HealthyFood',   'https://www.reddit.com/r/HealthyFood/new/',   ''),
  ('carna',    'reddit_comment', 'r/EatCheapAndHealthy', 'https://www.reddit.com/r/EatCheapAndHealthy/new/', ''),
  ('carna',    'reddit_comment', 'r/MealPrepSunday','https://www.reddit.com/r/MealPrepSunday/new/',''),
  ('carna',    'reddit_comment', 'r/sleep',         'https://www.reddit.com/r/sleep/new/',         ''),
  ('carna',    'reddit_comment', 'r/PlantBasedDiet','https://www.reddit.com/r/PlantBasedDiet/new/',''),
  ('carna',    'reddit_comment', 'Your city’s subreddit', '', 'Rename this to your city’s subreddit.')
on conflict (flow_key, channel_key, name) do nothing;

-- ---------------------------------------------------------------- saved searches
-- Ready-to-open links: Reddit sorted by New for the past week, Google with site: for the past week,
-- LinkedIn content search for the past week, Upwork newest jobs with filters.

insert into public.saved_searches (flow_key, channel_key, label, query, url, notes, sort) values
  ('careerdb', 'reddit_comment', 'Reddit · “no idea what career”', '"no idea what career"', 'https://www.reddit.com/search/?q=%22no+idea+what+career%22&sort=new&t=week', 'All of Reddit, newest first, past week.', 1),
  ('careerdb', 'reddit_comment', 'Reddit · “don’t know what I want to do”', '"don''t know what I want to do"', 'https://www.reddit.com/search/?q=%22don%27t+know+what+I+want+to+do%22&sort=new&t=week', '', 2),
  ('careerdb', 'reddit_comment', 'Reddit · “career change at 30”', '"career change at 30"', 'https://www.reddit.com/search/?q=%22career+change+at+30%22&sort=new&t=week', '', 3),
  ('careerdb', 'reddit_comment', 'Reddit · “applied to 200 jobs”', '"applied to 200 jobs"', 'https://www.reddit.com/search/?q=%22applied+to+200+jobs%22&sort=new&t=week', 'Try other numbers too: 100, 300, 500.', 4),
  ('careerdb', 'reddit_comment', 'Reddit · “feel lost” career', '"feel lost" career', 'https://www.reddit.com/search/?q=%22feel+lost%22+career&sort=new&t=week', '', 5),
  ('careerdb', 'reddit_comment', 'Career subreddits · newest posts', '', 'https://www.reddit.com/r/findapath+careerguidance+jobs+careeradvice+resumes/new/', 'r/findapath, r/careerguidance, r/jobs, r/careeradvice and r/resumes in one feed.', 6),
  ('careerdb', 'reddit_comment', 'Google · Reddit career threads this week', 'site:reddit.com ("no idea what career" OR "don''t know what I want to do" OR "feel lost" career)', 'https://www.google.com/search?q=site%3Areddit.com+%28%22no+idea+what+career%22+OR+%22don%27t+know+what+I+want+to+do%22+OR+%22feel+lost%22+career%29&tbs=qdr:w', 'Google, past week. Catches threads Reddit’s own search misses.', 7),
  ('careerdb', 'forums', 'Google · Quora career-change questions', 'site:quora.com ("career change at 30" OR "no idea what career")', 'https://www.google.com/search?q=site%3Aquora.com+%28%22career+change+at+30%22+OR+%22no+idea+what+career%22%29&tbs=qdr:w', '', 8),
  ('careerdb', 'li_comment', 'LinkedIn posts · #opentowork', '#opentowork', 'https://www.linkedin.com/search/results/content/?keywords=%23opentowork&datePosted=%22past-week%22&sortBy=%22date_posted%22', 'Posts from the past week, newest first.', 9),
  ('careerdb', 'li_comment', 'LinkedIn posts · “career change”', '"career change"', 'https://www.linkedin.com/search/results/content/?keywords=%22career%20change%22&datePosted=%22past-week%22&sortBy=%22date_posted%22', '', 10),
  ('careerdb', 'fb_group_comment', 'Facebook · career-change groups', 'career change', 'https://www.facebook.com/search/groups/?q=career%20change', 'Finds groups to join. Add good ones under Places.', 11),
  ('careerdb', 'fb_group_comment', 'Facebook · job-seeker groups', 'job seekers', 'https://www.facebook.com/search/groups/?q=job%20seekers', '', 12),
  ('skillx', 'li_comment', 'LinkedIn posts · “AI is useless at work”', '"AI is useless" work', 'https://www.linkedin.com/search/results/content/?keywords=%22AI%20is%20useless%22%20work&datePosted=%22past-week%22&sortBy=%22date_posted%22', 'The signal: people saying AI only helps with emails.', 13),
  ('skillx', 'li_comment', 'LinkedIn posts · “Copilot rollout”', '"Copilot rollout"', 'https://www.linkedin.com/search/results/content/?keywords=%22Copilot%20rollout%22&datePosted=%22past-week%22&sortBy=%22date_posted%22', '', 14),
  ('skillx', 'li_comment', 'LinkedIn posts · “Copilot ROI”', '"Copilot ROI"', 'https://www.linkedin.com/search/results/content/?keywords=%22Copilot%20ROI%22&datePosted=%22past-week%22&sortBy=%22date_posted%22', '', 15),
  ('skillx', 'li_comment', 'LinkedIn posts · “AI adoption”', '"AI adoption"', 'https://www.linkedin.com/search/results/content/?keywords=%22AI%20adoption%22&datePosted=%22past-week%22&sortBy=%22date_posted%22', '', 16),
  ('skillx', 'li_comment', 'LinkedIn posts · “AI training for employees”', '"AI training for employees"', 'https://www.linkedin.com/search/results/content/?keywords=%22AI%20training%20for%20employees%22&datePosted=%22past-week%22&sortBy=%22date_posted%22', '', 17),
  ('skillx', 'li_connect', 'LinkedIn people · Head of L&D', '"Head of L&D"', 'https://www.linkedin.com/search/results/people/?keywords=%22Head%20of%20L%26D%22', 'Basic search can’t filter by company size: check it’s 20 to 200 people on their company page.', 18),
  ('skillx', 'li_connect', 'LinkedIn people · People Operations', '"People Operations"', 'https://www.linkedin.com/search/results/people/?keywords=%22People%20Operations%22', '', 19),
  ('skillx', 'li_connect', 'LinkedIn people · HR Manager', '"HR Manager"', 'https://www.linkedin.com/search/results/people/?keywords=%22HR%20Manager%22', '', 20),
  ('skillx', 'li_connect', 'LinkedIn people · Operations Manager', '"Operations Manager"', 'https://www.linkedin.com/search/results/people/?keywords=%22Operations%20Manager%22', '', 21),
  ('skillx', 'reddit_comment', 'Reddit · “how do you actually use ChatGPT at work”', '"how do you actually use ChatGPT" work', 'https://www.reddit.com/search/?q=%22how+do+you+actually+use+ChatGPT%22+work&sort=new&t=week', 'Research and wording, not selling.', 22),
  ('skillx', 'reddit_comment', 'Reddit · “AI is useless at work”', '"AI is useless" work', 'https://www.reddit.com/search/?q=%22AI+is+useless%22+work&sort=new&t=week', 'Research and wording, not selling.', 23),
  ('skillx', 'reddit_comment', 'Reddit · “Copilot rollout”', '"Copilot rollout"', 'https://www.reddit.com/search/?q=%22Copilot+rollout%22&sort=new&t=week', 'Research and wording, not selling.', 24),
  ('skillx', 'reddit_comment', 'HR subreddits · “AI training”', '"AI training"', 'https://www.reddit.com/r/humanresources+managers+ChatGPTPro/search/?q=%22AI+training%22&restrict_sr=1&sort=new&t=week', 'r/humanresources, r/managers and r/ChatGPTPro.', 25),
  ('freelance', 'upwork', 'Upwork · “internal tool”', '"internal tool"', 'https://www.upwork.com/nx/search/jobs/?q=%22internal%20tool%22&sort=recency&payment_verified=1&proposals=0-4,5-9', 'Filters in the link: payment verified, fewer than 10 proposals, newest first. Client spend is not a search filter: check the client’s total spent and hire rate on the job before you bid.', 26),
  ('freelance', 'upwork', 'Upwork · dashboard', 'dashboard', 'https://www.upwork.com/nx/search/jobs/?q=dashboard&sort=recency&payment_verified=1&proposals=0-4,5-9', 'Filters in the link: payment verified, fewer than 10 proposals, newest first. Client spend is not a search filter: check the client’s total spent and hire rate on the job before you bid.', 27),
  ('freelance', 'upwork', 'Upwork · “Google Sheets automation”', '"Google Sheets automation"', 'https://www.upwork.com/nx/search/jobs/?q=%22Google%20Sheets%20automation%22&sort=recency&payment_verified=1&proposals=0-4,5-9', 'Filters in the link: payment verified, fewer than 10 proposals, newest first. Client spend is not a search filter: check the client’s total spent and hire rate on the job before you bid.', 28),
  ('freelance', 'upwork', 'Upwork · Airtable', 'Airtable', 'https://www.upwork.com/nx/search/jobs/?q=Airtable&sort=recency&payment_verified=1&proposals=0-4,5-9', 'Filters in the link: payment verified, fewer than 10 proposals, newest first. Client spend is not a search filter: check the client’s total spent and hire rate on the job before you bid.', 29),
  ('freelance', 'upwork', 'Upwork · “admin panel”', '"admin panel"', 'https://www.upwork.com/nx/search/jobs/?q=%22admin%20panel%22&sort=recency&payment_verified=1&proposals=0-4,5-9', 'Filters in the link: payment verified, fewer than 10 proposals, newest first. Client spend is not a search filter: check the client’s total spent and hire rate on the job before you bid.', 30),
  ('freelance', 'upwork', 'Upwork · “Apps Script”', '"Apps Script"', 'https://www.upwork.com/nx/search/jobs/?q=%22Apps%20Script%22&sort=recency&payment_verified=1&proposals=0-4,5-9', 'Filters in the link: payment verified, fewer than 10 proposals, newest first. Client spend is not a search filter: check the client’s total spent and hire rate on the job before you bid.', 31),
  ('freelance', 'reddit_comment', 'Reddit · “we track this in Excel”', '"we track this in excel"', 'https://www.reddit.com/search/?q=%22we+track+this+in+excel%22&sort=new&t=week', '', 32),
  ('freelance', 'reddit_comment', 'Small-business subreddits · “is there a tool that”', '"is there a tool that"', 'https://www.reddit.com/r/smallbusiness+Entrepreneur+sweatystartup/search/?q=%22is+there+a+tool+that%22&restrict_sr=1&sort=new&t=week', 'r/smallbusiness, r/Entrepreneur and r/sweatystartup.', 33),
  ('freelance', 'reddit_comment', 'Reddit · “spreadsheet is a mess”', '"spreadsheet is a mess"', 'https://www.reddit.com/search/?q=%22spreadsheet+is+a+mess%22&sort=new&t=week', '', 34),
  ('freelance', 'reddit_comment', 'Small-business subreddits · newest posts', '', 'https://www.reddit.com/r/smallbusiness+Entrepreneur+sweatystartup/new/', '', 35),
  ('freelance', 'reddit_comment', 'Google · spreadsheet pain on Reddit', 'site:reddit.com ("we track this in excel" OR "spreadsheet is a mess" OR "is there a tool that") business', 'https://www.google.com/search?q=site%3Areddit.com+%28%22we+track+this+in+excel%22+OR+%22spreadsheet+is+a+mess%22+OR+%22is+there+a+tool+that%22%29+business&tbs=qdr:w', 'Google, past week.', 36),
  ('carna', 'reddit_comment', 'Reddit · “no time to work out”', '"no time to work out"', 'https://www.reddit.com/search/?q=%22no+time+to+work+out%22&sort=new&t=week', '', 37),
  ('carna', 'reddit_comment', 'Reddit · “too tired to cook”', '"too tired to cook"', 'https://www.reddit.com/search/?q=%22too+tired+to+cook%22&sort=new&t=week', '', 38),
  ('carna', 'reddit_comment', 'Parent and health subreddits · newest posts', '', 'https://www.reddit.com/r/workingmoms+Mommit+beginnerfitness+Fitness30plus+EatCheapAndHealthy/new/', 'r/workingmoms, r/Mommit, r/beginnerfitness, r/Fitness30plus and r/EatCheapAndHealthy.', 39),
  ('carna', 'fb_group_comment', 'Facebook · parent groups', 'moms', 'https://www.facebook.com/search/groups/?q=moms', 'Add your town to the search (for example “moms Austin”). Add good groups under Places.', 40),
  ('carna', 'fb_group_comment', 'Facebook · youth sports parents', 'soccer parents', 'https://www.facebook.com/search/groups/?q=soccer%20parents', 'Add your town or club name.', 41),
  ('carna', 'fb_group_comment', 'Facebook · walking and running groups', 'walking group', 'https://www.facebook.com/search/groups/?q=walking%20group', 'Add your town.', 42)
on conflict (flow_key, label) do nothing;

-- ---------------------------------------------------------------- metric definitions

insert into public.metric_definitions (key, platform, label, unit, cadence, source, importer, aggregate, config, sort) values
  ('linkedin.profile_views',      'LinkedIn', 'Profile views',            'views',       'weekly', 'manual', 'csv',    'sum',  '{}', 1),
  ('linkedin.search_appearances', 'LinkedIn', 'Search appearances',       'appearances', 'weekly', 'manual', 'csv',    'sum',  '{}', 2),
  ('linkedin.post_impressions',   'LinkedIn', 'Post impressions',         'impressions', 'weekly', 'manual', 'csv',    'sum',  '{}', 3),
  ('linkedin.followers',          'LinkedIn', 'Followers',                'people',      'weekly', 'manual', 'csv',    'last', '{}', 4),
  ('linkedin.connections',        'LinkedIn', 'Connections',              'people',      'weekly', 'manual', 'csv',    'last', '{}', 5),
  ('upwork.profile_views',        'Upwork',   'Profile views',            'views',       'weekly', 'manual', 'csv',    'sum',  '{}', 6),
  ('upwork.proposals_sent',       'Upwork',   'Proposals sent',           'proposals',   'weekly', 'manual', 'csv',    'sum',  '{}', 7),
  ('upwork.proposals_viewed',     'Upwork',   'Proposals viewed',         'proposals',   'weekly', 'manual', 'csv',    'sum',  '{}', 8),
  ('upwork.invites',              'Upwork',   'Invites to jobs',          'invites',     'weekly', 'manual', 'csv',    'sum',  '{}', 9),
  ('upwork.connects_balance',     'Upwork',   'Connects balance',         'Connects',    'weekly', 'manual', null,     'last', '{}', 10),
  ('reddit.karma',                'Reddit',   'Karma',                    'karma',       'weekly', 'manual', 'reddit', 'last', '{}', 11),
  ('reddit.views',                'Reddit',   'Post and comment views (where shown)', 'views', 'weekly', 'manual', null, 'sum', '{}', 12),
  ('facebook.group_comments',     'Facebook', 'Group comments left',      'comments',    'weekly', 'auto', 'activities', 'sum',
   '{"channel": "fb_group_comment", "action": "comment"}', 13),
  ('facebook.group_posts',        'Facebook', 'Group posts',              'posts',       'weekly', 'auto', 'activities', 'sum',
   '{"channel": "fb_group_post", "action": "post_published"}', 14),
  ('site.visits',                 'Portfolio site', 'Visits',             'visits',      'weekly', 'auto', 'page_views', 'sum', '{"entry": true}', 15),
  ('site.page_views',             'Portfolio site', 'Page views',         'views',       'weekly', 'auto', 'page_views', 'sum', '{}', 16),
  ('site.tracked_visits',         'Portfolio site', 'Visits from tracked links', 'visits', 'weekly', 'auto', 'page_views', 'sum', '{"entry": true, "utm": true}', 17),
  ('site.top_referrers',          'Portfolio site', 'Top referrers',      'visits',      'weekly', 'auto', 'page_views', 'list', '{"entry": true, "by": "referrer_host"}', 18)
on conflict (key) do nothing;

-- ---------------------------------------------------------------- templates
-- {Braces} are for you to fill in. Cold emails end with the CAN-SPAM footer: your name, postal
-- address, that it's promotional, and an opt-out.

insert into public.templates (flow_key, channel_key, name, body, sort) values
  -- Carna (from Carna’s own plan)
  ('carna', 'local_clubs', 'Cold email: a club, school or PTA', $b$Subject: A free talk for {club} parents

Hi {first name},

I’m {your name}, a health coach in {town}. I’d love to offer {club}’s parents something useful: a free 30-minute talk on keeping a busy family fed, rested and moving, or a relaxed walking group around the field during practice.

No selling on the night; just practical ideas and time for questions.

Would either suit you this season? Happy to send a one-page outline first.

{your name} · Carna
{website} · {postal address}
This is a one-off promotional note. Reply “no thanks” and I won’t write again.$b$, 1),
  ('carna', 'partners', 'Cold email: a referral partner', $b$Subject: An idea for {their business}

Hi {first name},

I’m {your name}, and I run Carna: a two-month coaching engagement that helps people build a steady base across movement, food, sleep, stress and the people around them.

I picked {their business} because {a specific, honest reason}. A lot of the people I work with need {what they offer}, and I suspect some of your clients would like help with the habits around it.

Would you be open to a 15-minute call about sending people each other’s way?

{your name} · Carna
{website} · {postal address}
This is a one-off promotional note. Reply “no thanks” and I won’t write again.$b$, 2),
  ('carna', 'cold_email', 'Cold email: a free talk for a team', $b$Subject: A free lunchtime talk for your team

Hi {first name},

I’m {your name}, a health coach at Carna. I give a free 30-minute talk called “Five small things for steadier energy”: one practical habit each for movement, food, sleep, stress and connection. No diets, no fitness tests.

Would it suit {company} sometime in {month}? It works in person or online, and I can send a one-page outline first.

{your name} · Carna
{website} · {postal address}
This is a one-off promotional note. Reply “no thanks” and I won’t write again.$b$, 3),
  ('carna', 'cold_email', 'Cold email: a person (US only)', $b$Subject: {their topic}: a thought

Hi {first name},

I saw {where they published their contact details and what they wrote}. {One specific, useful thought about it.}

I’m a health coach at Carna, working with busy professionals and parents on steady habits. If you’d ever like a hand, this short questionnaire is where I start: {questionnaire link}.

Either way, I hope {their thing} goes well.

{your name} · Carna
{website} · {postal address}
This is a one-off promotional note. Reply “no thanks” and I won’t write again.$b$, 4),
  ('carna', 'cold_email', 'Follow-up (once or twice, then stop)', $b$Subject: Re: {original subject}

Hi {first name},

A gentle nudge in case my note got buried. If a call is too much, I’m happy to send a one-page summary instead.

And if now isn’t the time, no problem at all.

{your name} · Carna
{website} · {postal address}
This is a one-off promotional note. Reply “no thanks” and I won’t write again.$b$, 5),
  ('carna', 'li_connect', 'LinkedIn: connection note', $b$Hi {first name}, I enjoyed your post on {topic}, especially {one detail}. I coach busy professionals and parents on steady health habits and would be glad to connect.$b$, 6),
  ('carna', 'li_dm', 'DM after a conversation', $b$Hi {first name}, thanks for the chat about {topic}. If you ever want a structured plan for it, I run two-month coaching engagements. The first step is a short questionnaire, so our first call is about you: {questionnaire link}. No pressure at all.$b$, 7),
  ('carna', 'warm', 'Asking your own network', $b$Hi {name}, I’ve started Carna, a two-month coaching engagement for people who want a steadier base for their health: movement, food, sleep, stress and the people around them. I work mostly with busy professionals and parents.

Do you know anyone who’s been meaning to sort out one of those and might like a chat? A name, or forwarding this message, would mean a lot. Thank you.$b$, 8),
  ('carna', 'fb_group_comment', 'Helpful reply in a group', $b$Thanks for asking this, lots of people wonder the same. Something that helps many of the people I work with: {one specific, practical tip}. {A second tip, if it helps.}

Start with the smallest version you’d still do on a bad day. Happy to share more if it’s useful.$b$, 9),
  ('carna', 'fb_group_post', 'Promo-day listing', $b$Hello, I’m {your name}, a health coach in {town}, and a {sports parent / working parent} myself.

Carna is a two-month engagement: we look at where you are across movement, food, sleep, stress and the people around you, then build habits that fit a busy week, with one call a week. No strict diets, no punishing workouts. A 20-minute walk counts.

If you’re curious, there’s a short questionnaire here: {questionnaire link}. Or comment below and I’ll message you.$b$, 10),
  ('carna', 'reddit_comment', 'Value-first comment', $b${Answer the actual question first, in three to five sentences.}

What tends to work: {specific}. What tends to backfire: {specific}.

If it helps, I’m a health coach and happy to answer follow-ups here.$b$, 11),
  ('carna', 'reddit_comment', 'Reply to someone who asked for more', $b$Hi, you asked for more detail on {topic}. {The answer.}

If you ever want a structured plan, I run two-month coaching engagements, and this is the questionnaire I start with: {questionnaire link}. No pressure either way.$b$, 12),
  ('carna', 'events', 'Walk during practice', $b$Parents of {team}: while the kids practise on {day}, I’m walking laps of the field from {time}. Join for a lap or for the whole hour; prams, coffee and chat welcome.

I’m {your name}, a health coach; there’s no catch, just company and a few easy ideas for busy weeks if you want them.$b$, 13),
  ('carna', 'events', 'Free talk', $b$Free talk: “Small things, steady health for busy families”
{date}, {time} at {place}

Forty-five minutes of practical ideas for movement, food, sleep and stress that fit around work and kids, with time for questions. Bring a friend.

{sign-up link}$b$, 14),
  ('carna', 'referrals', 'Asking a client for a referral', $b$Hi {name}, I’ve really enjoyed working with you. If anyone you know might like the same kind of support, I’d be glad to talk with them. You can forward this: {questionnaire link}.

As a thank you, {your thank-you, such as a free month of check-ins}.$b$, 15),
  ('carna', 'site', 'Reply to an enquiry', $b$Hi {first name},

Thanks for getting in touch. The first step is a short questionnaire, so our first call can be about you: {questionnaire link}. Then pick a time that suits you: {booking link}.

Looking forward to it,
{your name}$b$, 16),

  -- CareerDB
  ('careerdb', 'reddit_comment', 'Helpful answer: no clear direction', $b${Answer their actual question first, in a few sentences.}

Something that helps when you can’t name one career: write down three directions you could see yourself in. For each, list the job titles people actually hire for, two skills you already have that carry over, and one small step for this week (a conversation, a course, one application).

It turns “I don’t know what I want” into three searches you can run. Happy to help you sketch yours if you share a bit about your background.$b$, 1),
  ('careerdb', 'reddit_comment', 'Reply to someone who asked for more', $b$Hi {name}, you asked how to map out a few career options. {Your specific answer.}

I built a tool for exactly this, CareerDB: it lays out several career options from your background and helps you apply for each. If you want to try it: {link}. No pressure; the steps above work on paper too.$b$, 2),
  ('careerdb', 'li_comment', 'Comment on an #opentowork post', $b${A specific, encouraging note about their background.} One thing that helps a lot of people in a search like yours: {one concrete tip, for example pick two neighbouring job titles and keep a CV version for each}. Good luck with it.$b$, 3),
  ('careerdb', 'li_connect', 'Connection note: career changer', $b$Hi {first name}, saw your post about {their search or career change}. I build tools for people mapping out a career change and would be glad to connect.$b$, 4),
  ('careerdb', 'li_dm', 'DM after they accept', $b$Thanks for connecting, {first name}. {One line about their situation.} If it’d help, I can show you how I’d lay out three career options from your background; it takes ten minutes. Want me to send it?$b$, 5),
  ('careerdb', 'fb_group_comment', 'Helpful reply in a job-seeker group', $b${Answer the question first.}

When applications go nowhere, it’s often because the CV tries to fit every job at once. Pick the two or three directions that fit you best and write one version for each; your answers get much sharper. Happy to help you pick them if you share your background.$b$, 6),
  ('careerdb', 'site', 'Reply to a sign-up or enquiry', $b$Hi {first name},

Thanks for trying CareerDB. {Answer their question.} If you tell me a bit about your background, I’ll suggest which of your career options to start with.

{your name}$b$, 7),

  -- SkillX
  ('skillx', 'li_connect', 'Connection note: HR or L&D lead', $b$Hi {first name}, I’ve been reading your posts on {topic}. I research how teams get real value from AI beyond writing emails, and would be glad to connect.$b$, 1),
  ('skillx', 'li_comment', 'Comment on an AI adoption post', $b${Agree with or add to one specific point.} What I keep hearing: training stops at prompts for emails, so people decide AI isn’t for their job. The jump comes when they learn one workflow from their own week, like {example: turning a messy spreadsheet into a weekly summary}. Did your team see the same?$b$, 2),
  ('skillx', 'li_dm', 'DM after they engage', $b$Thanks for the comment on {post}, {first name}. I run SkillX: short, role-based AI courses that take teams past writing emails into their real work. If {company} is in the middle of a Copilot or ChatGPT rollout, I’d be glad to share the three workflows that land fastest for {their function}. Worth a 15-minute call?$b$, 3),
  ('skillx', 'cold_email', 'Cold email: AI training for a team', $b$Subject: Getting {company} past AI for emails

Hi {first name},

I’m {your name} from SkillX. {One real, specific reason you picked them, such as their Copilot rollout or a job ad.}

A pattern I see at companies your size: people try AI, find it writes emails, and stop there. SkillX courses are short and built around each role’s real work, so {function} teams leave with two or three workflows they use every week.

Would a 15-minute call to see whether it fits {company} be useful?

{your name} · SkillX
{website} · {postal address}
This is a one-off promotional note. Reply “no thanks” and I won’t write again.$b$, 4),
  ('skillx', 'cold_email', 'Follow-up (once, then stop)', $b$Subject: Re: {original subject}

Hi {first name},

Following up once in case this got buried. If it helps, I can send the one-page outline of the course for {function} instead of a call.

If the timing’s wrong, no problem at all.

{your name} · SkillX
{website} · {postal address}
This is a one-off promotional note. Reply “no thanks” and I won’t write again.$b$, 5),
  ('skillx', 'reddit_comment', 'Research question (no selling)', $b$Genuine question for people who use AI at work: {question, for example where does it actually save you time, and where did you give up on it?} I’m trying to understand what separates teams that get value from it from teams that stop after emails. {Your own one-line experience, so it isn’t a one-way ask.}$b$, 6),
  ('skillx', 'warm', 'Asking people you know', $b$Hi {name}, quick one: I’ve started SkillX, short AI courses for teams who tried ChatGPT or Copilot and found it only helps with emails. Do you know an HR, L&D or operations lead at a company of 20 to 200 people who might want to hear about it? An intro would mean a lot.$b$, 7),

  -- Freelancing
  ('freelance', 'upwork', 'Upwork proposal: internal tool', $b$Hi {client name},

{One line that shows you read the post: their problem, in your words.}

I build small internal tools: dashboards, trackers, spreadsheet replacements and automations. Three of mine are on {portfolio link}: CareerDB, SkillX and Carna.

For your project I’d {two or three concrete steps, for example move the sheet into a small database, build the two views you described, automate the weekly email}. A first working version in {timeframe}.

One question: {a specific question about their setup}.

{your name}$b$, 1),
  ('freelance', 'reddit_comment', 'Helpful answer: spreadsheet pain', $b${Answer the question first.}

When a sheet starts breaking like this, a few things help before any new tool: {1}, {2}, {3}. If it keeps growing, a small internal app on top of the same data usually beats a bigger spreadsheet. Happy to say how I’d structure it if you post the columns you track.$b$, 2),
  ('freelance', 'warm', 'Telling people you know', $b$Hi {name}, I’m now building small internal tools for businesses: dashboards, trackers, spreadsheet replacements and automations. If you know a business owner buried in spreadsheets, I’d love an intro. Some of my work: {portfolio link}.$b$, 3),
  ('freelance', 'li_connect', 'Connection note: small business owner', $b$Hi {first name}, I build small internal tools (dashboards, trackers, automations) for businesses like {business}. Would be glad to connect.$b$, 4),
  ('freelance', 'li_dm', 'DM after they engage', $b$Thanks for connecting, {first name}. Out of curiosity: what’s the one spreadsheet or manual task at {business} everyone wishes would go away? I build small tools for exactly that, and I’m happy to sketch an idea for free.$b$, 5),
  ('freelance', 'cold_email', 'Cold email: small business', $b$Subject: Your {process} at {business}

Hi {first name},

{The specific thing you noticed, for example that bookings come in by email and go into a shared sheet.}

I build small internal tools for businesses your size: a simple dashboard, a tracker or an automation that replaces the copy-paste. A typical build takes {timeframe} and runs on tools you already pay for.

Would it help if I sketched what this could look like for {business}?

{your name}
{website} · {postal address}
This is a one-off promotional note. Reply “no thanks” and I won’t write again.$b$, 6)
on conflict (flow_key, name) do nothing;

-- ---------------------------------------------------------------- settings: preferences

insert into public.settings (key, value) values
  ('prefs', '{"tz": "UTC", "hours_per_week": 40, "lead_share": 0.7, "link_warn": 0.1, "currency": "USD", "cut_after_days": 14}'),
  ('importers', '{"reddit": {"enabled": false}, "f5bot": {"enabled": false}, "csv": {"enabled": false}}'),
  ('checklist.done', '{}')
on conflict (key) do nothing;

-- ---------------------------------------------------------------- settings: plan content (refreshed on every run)

insert into public.settings (key, value) values
('plan.rules', $json$[
  "Help first in communities, and follow each place’s self-promotion rules.",
  "Use your own accounts only. Never borrowed or bought ones: Reddit forbids transferring accounts, and a ban hits every flow.",
  "Never buy, scrape or guess email lists. Write only to addresses people published for contact.",
  "Every cold email follows CAN-SPAM: your real name, an honest subject, a line saying it’s promotional, your postal address and an opt-out. The first “no” is the last email.",
  "Cold email to private individuals goes to US addresses only. Elsewhere in the English-speaking markets it’s business to business only, under that country’s rules below.",
  "No health claims for Carna. It’s education and coaching, not medical advice.",
  "Log as you go. One tap per action keeps these numbers honest."
]$json$),
('plan.legal', $json${
  "checked": "November 2026",
  "note": "A summary to keep you on the right side, not legal advice.",
  "rows": [
    {"place": "United States", "rule": "Cold email to individuals and businesses is allowed without prior consent if it follows CAN-SPAM: honest headers and subject, identified as an ad, a valid postal address (a registered PO box works), and an opt-out honoured within 10 business days.", "url": "https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business", "source": "FTC"},
    {"place": "Australia", "rule": "Spam Act: needs express or inferred consent, which you must be able to prove. A published work address only covers messages about that person’s role. Unsubscribes within 5 working days.", "url": "https://www.acma.gov.au/avoid-sending-spam", "source": "ACMA"},
    {"place": "New Zealand", "rule": "Unsolicited Electronic Messages Act: express, inferred or deemed consent, which the sender must prove; every message needs a working unsubscribe.", "url": "https://www.dia.govt.nz/Spam-NZ-Spam-Law-for-Businesses", "source": "Department of Internal Affairs"},
    {"place": "Canada", "rule": "CASL: consent needed. Implied consent only for a conspicuously published business address, with no “no spam” notice, and a message relevant to their role.", "url": "https://crtc.gc.ca/eng/com500/faq500.htm", "source": "CRTC"},
    {"place": "United Kingdom", "rule": "PECR: individuals and sole traders need consent. Staff at companies can get cold email, with your identity and an opt-out.", "url": "https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/business-to-business-marketing/", "source": "ICO"},
    {"place": "Ireland", "rule": "ePrivacy Regulations: individuals need express consent, and every message needs an opt-out. The DPC describes consent as the general rule and publishes no business-to-business exemption like the UK’s, so treat Irish addresses as consent first.", "url": "https://dataprotection.ie/en/faqs/direct-marketing/what-rules-apply-electronic-direct-marketing", "source": "Data Protection Commission"}
  ]
}$json$),
('plan.rhythm', $json${
  "summary": "Full-time across four flows: about 28 of 40 hours a week on the leading channels and 12 on testing new ones. Mark each channel as leading or testing under Sources.",
  "decide": "After two weeks, cut the channels that brought no replies. After four, move the best test into the lead and start a new one.",
  "blocks": [
    {"when": "Weekdays · 8:30", "minutes": 30, "focus": "lead", "what": "Triage: open the saved searches due today, paste F5Bot alerts into the Inbox, skip anything you can’t really help with."},
    {"when": "Weekdays · 9:00", "minutes": 120, "focus": "lead", "what": "Volume lanes, inside today’s caps: LinkedIn notes and DMs (SkillX, Freelancing, CareerDB), Upwork proposals (Freelancing)."},
    {"when": "Weekdays · 11:00", "minutes": 90, "focus": "lead", "what": "Trust lanes, from the Inbox: helpful answers in Facebook groups (Carna, CareerDB) and on Reddit (CareerDB, Freelancing, Carna)."},
    {"when": "Weekdays · 13:30", "minutes": 75, "focus": "lead", "what": "Every follow-up due, every reply and enquiry, then calls."},
    {"when": "Weekdays · 14:45", "minutes": 145, "focus": "test", "what": "Testing: one or two Next channels a day, done properly and logged. Monday Indie Hackers, Tuesday X, Wednesday forums and Quora, Thursday Discord and Slack, Friday a post or a newsletter issue."},
    {"when": "Weekdays · 17:10", "minutes": 20, "focus": "lead", "what": "Log anything you missed and set tomorrow’s follow-ups. On Fridays, enter the week’s platform numbers on Metrics and look at what to cut."}
  ]
}$json$),
('plan.flows', $json${
  "carna": {
    "first": "Facebook groups first, then health subreddits, LinkedIn and local clubs.",
    "now": "Answer questions in parent and health groups most days, comment in health subreddits, send LinkedIn notes to working parents, write to the clubs and schools near you, and tell the people you know.",
    "next": "Add reach that compounds: your own LinkedIn and Instagram posts, a walk during practice or a free talk, partners and referrals.",
    "later": "A newsletter, forums and chat groups, cold email to clubs and workplaces once sending is set up, and paid tests with a budget.",
    "watch": "Which groups and subreddits send people to the questionnaire."
  },
  "careerdb": {
    "first": "Career-advice subreddits, LinkedIn #opentowork and career-change posts, and job-seeker groups.",
    "now": "Answer the “I don’t know what career” threads every day, comment on #opentowork posts, join a few career-change groups and connect with people who post about a change.",
    "next": "Direct messages to people who engaged, Discord communities, X, a Product Hunt launch when the tool is ready, referrals.",
    "later": "A newsletter, partners such as career coaches and bootcamps, paid tests.",
    "watch": "Replies per subreddit and per phrase. The saved searches that keep finding real threads are the ones to keep."
  },
  "skillx": {
    "first": "LinkedIn is the main channel: title search plus posts on AI adoption and Copilot ROI. Reddit is for research and wording, not selling.",
    "now": "Connect with HR, L&D, People Ops and operations leads at companies of 20 to 200 people, comment on their AI posts, message the ones who engage, post what you learn.",
    "next": "Partners such as HR consultancies, HR Slack communities, meetups and webinars, a newsletter.",
    "later": "Cold email to companies once the sending domain is set up and warmed; paid tests.",
    "watch": "Reply rate per connection note and DM template, and which job titles reply."
  },
  "freelance": {
    "first": "Upwork, small-business subreddits, people you know, LinkedIn and the portfolio site.",
    "now": "Bid on new Upwork jobs with few proposals, answer spreadsheet and tooling questions on Reddit, tell business owners you know, and connect with owners and operations managers.",
    "next": "Indie Hackers, X, no-code communities, partners who turn down small builds.",
    "later": "Cold email to small businesses once sending is set up, forums, local meetups, paid tests.",
    "watch": "Proposals viewed and replies per Upwork search; enquiries from the portfolio site by tracked link."
  }
}$json$),
('plan.checklist', $json$[
  {"key": "basics", "label": "Basics", "items": [
    {"id": "photo-bio", "text": "One photo and a three-line bio for each flow: who you help, how, and one human detail. Use the same words on every profile."},
    {"id": "tracked-links", "text": "Put tracked links in every bio and signature (Sources → Copy tracked link), so visits show which channel sent them."},
    {"id": "postal-address", "text": "Choose the postal address for cold emails and newsletters: your street address, a PO box or a registered mailbox."},
    {"id": "calendar", "text": "Block the weekly rhythm in your calendar."},
    {"id": "ignore-me", "text": "On each of your own devices, open the dashboard menu and turn on “Don’t count my visits”."}
  ]},
  {"key": "linkedin", "label": "LinkedIn", "items": [
    {"id": "li-profile", "text": "Profile: photo, a headline that says who you help, an About section, and Featured links to the portfolio and the products.", "url": "https://www.linkedin.com/help/learning/answer/391"},
    {"id": "li-notes", "text": "Decide on Premium: free accounts can add a note to only a few invitations a month."},
    {"id": "li-follow", "text": "Follow 30 people your buyers follow, and the hashtags under Sources → Places."}
  ]},
  {"key": "reddit", "label": "Reddit", "items": [
    {"id": "reddit-account", "text": "Your own account with a clear name and a short bio about what you do. Never a bought or borrowed one.", "url": "https://redditinc.com/policies/user-agreement"},
    {"id": "reddit-rules", "text": "Read each subreddit’s rules and note them under Sources → Places."},
    {"id": "reddit-warmup", "text": "Only comment for the first two weeks: new accounts and links get filtered."}
  ]},
  {"key": "f5bot", "label": "F5Bot keyword alerts", "items": [
    {"id": "f5bot-account", "text": "Make a free F5Bot account and add the phrases from Sources → Saved searches as keywords.", "url": "https://f5bot.com/"},
    {"id": "f5bot-routine", "text": "Paste each alert email into Inbox → Paste alerts, or forward them to the f5bot importer once it’s set up."}
  ]},
  {"key": "facebook", "label": "Facebook groups", "items": [
    {"id": "fb-profile", "text": "Use your own profile, with a one-line intro that says what you do."},
    {"id": "fb-join", "text": "Join the groups for each flow, read their rules, and note promo days under Sources → Places."}
  ]},
  {"key": "upwork", "label": "Upwork", "items": [
    {"id": "upwork-profile", "text": "Profile: a title that names the work (internal tools, dashboards, automations), an overview, and portfolio items for CareerDB, SkillX and Carna."},
    {"id": "upwork-connects", "text": "Check your Connects balance, and enter it every Friday on Metrics."},
    {"id": "upwork-searches", "text": "Run the Upwork saved searches every weekday morning."}
  ]},
  {"key": "testing", "label": "Testing channels", "items": [
    {"id": "ih-ph", "text": "Indie Hackers and Product Hunt profiles with a bio and the portfolio link."},
    {"id": "x-profile", "text": "An X profile with a bio and the portfolio link."},
    {"id": "chat-join", "text": "Join three Discord or Slack communities where your buyers ask questions, and read the pinned rules."}
  ]},
  {"key": "email", "label": "Cold email (the last thing to set up)", "items": [
    {"id": "email-domain", "text": "A separate sending domain and inbox, with SPF, DKIM and DMARC.", "url": "https://support.google.com/mail/answer/81126?hl=en"},
    {"id": "email-warmup", "text": "Warm the inbox up before any volume, then stay around 30 to 50 a day per inbox."},
    {"id": "email-signature", "text": "A signature with your real name, postal address and a one-line opt-out."}
  ]}
]$json$)
on conflict (key) do update set value = excluded.value;

commit;
