# Lead desk

A private lead generation and tracking dashboard at `/admin`, for four flows: Carna, CareerDB, SkillX and Freelancing. It logs what you put out (comments, DMs, connection notes, proposals, emails, posts) and what comes back (replies, enquiries, calls, clients), per flow and per channel, so you can see after a couple of weeks what to keep and what to cut.

Plain static files: `admin/` (no build step, vanilla JS modules) on Vercel, with the data in Supabase (Postgres). It stays out of the nav, the sitemap and `robots.txt`; the page has `noindex` and Vercel sends `X-Robots-Tag: noindex` for `/admin`.

## Set it up

1. **Create a Supabase project.** At supabase.com, make a new project on the free plan, in a region near you. Keep the database password somewhere safe.
2. **Run the SQL.** In the project, open SQL Editor → New query. Paste and run each file from `supabase/migrations/`, in order:
   1. `0001_schema.sql`: tables, triggers and views.
   2. `0002_policies_open.sql`: the open access rules (see "The lock" below).
   3. `0003_seed.sql`: the fixed lists: flows, channels, actions, each flow's channels, places, saved searches, metric definitions, templates and plan content. No leads, activity or numbers: those are yours.

   Run each one once. Running `0003` again is safe: it keeps your changes.
3. **Copy the project URL and key.** The Project URL is under Project Settings → Data API (or the Connect button), and the publishable key (`sb_publishable_…`) is under Project Settings → API Keys. The legacy `anon` key works too. Paste both into:
   - `admin/config.js`: `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
   - `assets/site.js`: the two constants at the top of the page-view beacon, so visits to the public pages are recorded.
4. **Deploy.** Merge and push as usual; Vercel publishes it. Open `https://<your site>/admin`.
5. **On each of your own devices**, open the menu (⋯, top right) and turn on "Don't count my visits", so your own browsing doesn't inflate the portfolio numbers.
6. **Start.** Today shows a "Start here" list: check Sources, work through the one-time setup on Plan, run a saved search, paste good threads into the Inbox, and tap a chip each time you act.

The dashboard counts days in your browser's time zone (set on first visit; shown in the menu).

### Free Supabase projects pause

Supabase pauses free projects after about a week of low activity. When that happens the dashboard says it can't reach Supabase: open the Supabase dashboard and restore the project. Supabase's docs give 90 days to a year to restore a paused project, so check the deadline it shows you. Using the dashboard most days keeps it awake.

The free plan has no automatic backups. Download one now and then from the menu (⋯ → Download a backup), which saves every table as JSON.

## What each screen is for

- **Today**: one-tap quick log chips for your most used actions (with undo), follow-ups due, daily caps on the volume lanes, this week's targets, links-per-comment on the trust lanes, and new Inbox items.
- **Queue**: everything the Reddit collector brings in every hour (new posts and comments in the subreddits under Sources → Places, plus your saved Reddit searches). Four steps: **Triage** (copy a batch for Claude chat, paste back its picks: one line each, `id | why | angle`; the rest of the batch is passed), **Shortlist** (write the gist of each reply, copy the drafting prompt, paste back Claude's comments, read and approve each), **Ready to post** (Copy & open, then Mark posted; or copy the list for Claude in Chrome and mark the exported ones posted), **Posted**. Marking posted logs a comment on the activity log. Collected items nobody acted on are cleared after 7 days.
- **Inbox**: threads you found yourself or pasted from alerts. Paste a link (the channel, the place such as a subreddit, and a title are guessed from it), or paste F5Bot alert emails. Engaged logs the action; Make lead opens a lead; Skip hides it.
- **Leads**: the pipeline by stage (New → Contacted → Replied → Call booked → Client, plus Not now and Lost, which keep the furthest stage reached), with search and filters. In a lead, one-tap touches log the action, move the stage and set the next follow-up from the channel's default. Each stage is date-stamped the first time it's reached.
- **Activity**: log a batch ("12 Facebook comments, 1 with a link"), for any day, and fix or delete anything in the log.
- **Metrics**: Output by channel and week; Response with reply, lead and close rates by channel, template and place; Audience for the platform numbers; Site for visits, referrers and tracked links; a weekly form for the numbers you copy by hand; and the CSV import. The period switch (7, 30, 90 days, all) compares each figure with the previous period.
- **Sources**: per flow, turn channels on or off, put each in Now, Next or Later, mark it leading or testing, and set its weekly target and daily cap. Manage places and saved searches, and copy a tracked link for each channel.
- **Plan**: Now, Next and Later per flow, the weekly rhythm with the actual leading/testing split from what you logged, the one-time setup checklist, the ground rules, and cold email rules by country (a summary, not legal advice).
- **Templates**: copy, edit and the reply rate of every template.

"All flows" in the switcher is a view across the four flows, not a fifth flow.

## Tracked links

Use `?utm_source=<channel key>&utm_campaign=<flow key>` on links to the portfolio, for example `https://<your site>/?utm_source=li_post&utm_campaign=freelance`. Sources → Copy tracked link builds them. `utm_medium` and `utm_content` are recorded too if you add them.

## Page views

The beacon in `assets/site.js` sends one small insert per page view straight to Supabase: the path, the host, whether it's the first page of a visit, the referring site (origin and path only) and any `utm_*` tags. No cookies, nothing stored on the visitor's device, no IP address or browser fingerprint. It doesn't run on `/admin`, on localhost, in automated browsers, or in browsers with "Don't count my visits". The `country` column stays empty: a browser can't know it, and filling it would need a server-side function.

## The lock

Right now the database uses the **open** rules: anyone with the anon key can read and change everything. That key is public by design and sits in `assets/site.js` on every public page, so while the open rules are on, anyone who looks can read your leads. Turn on the lock before you store details about real people that you'd mind leaking.

### Turn on the lock

1. Supabase → Authentication → Users → Add user → Create new user, with your email (auto-confirm it).
2. Authentication → Sign In / Providers: turn off "Allow new users to sign up".
3. Authentication → URL Configuration: set the Site URL to your site, and add `https://<your site>/admin` to the Redirect URLs.
4. Optional: Authentication → Emails → Magic link: add `{{ .Token }}` to the template, so the email also carries a 6-digit code you can type in (handy when you ask on your laptop and read mail on your phone).
5. Open `supabase/migrations/later/0004_policies_locked.sql`, put your email on the `owner_email` line, and run it in the SQL editor. It refuses to run until the email is there and the user exists.
6. In `admin/config.js`, set `REQUIRE_AUTH = true` and `OWNER_EMAIL` to your email. Deploy.

From then on only your signed-in user can read or write anything, and the anon key can only insert page views. `OWNER_EMAIL` is visible to anyone who opens `admin/config.js`; it only decides where the sign-in link goes, while the database checks your user's id. To undo the lock, run `0002_policies_open.sql` again.

## The Reddit collector

The `importers` Edge Function is deployed to the project with the Reddit app's client ID and secret as Supabase secrets, and Supabase Cron runs it every hour at :07 (`select * from cron.job`). Add or remove subreddits under Sources → Places (a place named `r/<name>` on a Reddit channel; mark one banned or avoid to stop collecting it). Turn it off under Metrics → Import CSV → Importers, or with `select cron.unschedule('importer-reddit');`. Every run is listed under Metrics → Import CSV → Recent import runs. Run `supabase/migrations/0005_review_queue.sql` on a new project before using the Queue.

Hacker News, Stack Exchange and Bluesky are collected the same way, every hour at :17, :27 and :37, using their free public APIs (no keys). Their phrases (or Stack Exchange sites, as `site` or `site:tag`) per flow are in the `settings` table under `importers` → `hn` / `stackexchange` / `bluesky` → `queries`; run `supabase/migrations/0006_more_collectors.sql` on a new project. A Claude Code scheduled task (every 3 hours) reads the new items, shortlists the best with a reason, an angle and a first draft, and passes the rest; you edit and approve on the Queue.

## Importers (optional)

`supabase/functions/importers/` holds the plumbing for automation: Reddit (karma and saved searches into the Inbox), F5Bot (forwarded alert emails) and CSV, all behind one interface, every run logged in `import_runs`, all off by default. Its README explains what each needs and its terms of use. In short: Reddit API access now needs Reddit's approval, and LinkedIn, Upwork and Facebook have no public API for these numbers, so those stay manual or CSV.

## Next steps (not built yet)

- **The lock**: above, when you're ready.
- **Cold email sending**: a separate sending domain and inbox, SPF, DKIM and DMARC, a warm-up, then about 30 to 50 a day per inbox. This is the last thing to set up; until then cold email sits in Later for every flow.
- **Hosting**: Vercel's Hobby plan is for non-commercial use. Move to Vercel Pro or another host before relying on this commercially.

## Changing things

- Labels can change freely. Keys (`flows.key`, `channels.key`, `actions.key`, `metric_definitions.key`) are what other rows point at: never rename one that has rows.
- To add a channel, insert it in the SQL editor, then switch it on per flow under Sources:

  ```sql
  insert into channels (key, label, group_key, lane, platform, actions, primary_action, follow_up_days, notes, sort)
  values ('threads', 'Threads', 'content', 'trust', 'threads', '{post_published,comment,reply,enquiry}', 'post_published', 3, '', 26);
  ```

- Places, saved searches, templates, targets and caps are all edited in the dashboard.

## Files

- `admin/index.html`, `admin/config.js`, `admin/admin.css`: the page (it loads the site's `assets/styles.css` for its colours and fonts).
- `admin/js/app.js` (start-up, sign-in, routing), `db.js` (Supabase), `ui.js`, `charts.js` (hand-drawn SVG charts), `parse.js` (links, alerts, CSV), `screens/*.js` (one file per screen).
- `supabase/migrations/`: the SQL to paste; `later/` holds the lock.
- `supabase/functions/importers/`: the importer Edge Function.
- `assets/site.js` (the beacon) and `vercel.json` (the `noindex` header) are the only shared files this touches.
