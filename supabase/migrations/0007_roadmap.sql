-- Lead desk: the Roadmap page's content (settings → roadmap), so it can be kept current without a
-- code change. Statuses: live, ready (built, switched off), you (waiting on you), planned (agreed, not
-- built), proposed (suggested, not approved), ruled_out. Re-running replaces the content.

insert into public.settings (key, value) values ('roadmap', $json${
  "updated": "2026-11-28",
  "sections": [
    {"status": "live", "title": "Built and running", "items": [
      {"title": "Lead desk dashboard at /admin", "text": "Today, Inbox, Queue, Leads, Activity, Metrics, Sources, Plan, Templates and this page, for four flows: Carna, CareerDB, SkillX, Freelancing.", "ref": "PR #1"},
      {"title": "Database (Supabase)", "text": "Schema, the fixed lists (25+ channels, 28 places, 42 saved searches, 36 templates, plan content), open access rules.", "ref": "PR #1"},
      {"title": "Page-view beacon", "text": "Visits to the public site with referrer and tracked links (?utm_source=<channel>&utm_campaign=<flow>). No cookies.", "ref": "PR #1"},
      {"title": "Reddit collector", "text": "Every new post and comment in the 22 subreddits under Places, plus saved Reddit searches. Hourly at :07.", "ref": "PR #2"},
      {"title": "Hacker News, Stack Exchange and Bluesky collectors", "text": "Phrases per flow. Hourly at :17, :27, :37.", "ref": "PR #3"},
      {"title": "Claude triage and drafts", "text": "A scheduled Claude Code task, every 3 hours at :56: shortlists up to 30 items with a reason, an angle and a first draft; passes the rest.", "ref": "Scheduled task"},
      {"title": "Queue: approve and post", "text": "Edit and approve drafts; Copy & open, or a list for Claude in Chrome; marking posted logs the comment.", "ref": "PR #2"},
      {"title": "Manual tools", "text": "Quick-log chips, batch logging, lead pipeline with touches, F5Bot alert paste, weekly numbers, CSV import, backup download.", "ref": "PR #1"}
    ]},
    {"status": "ready", "title": "Built, switched off", "items": [
      {"title": "The lock", "text": "Owner-only database rules and magic-link sign-in. Off until you turn it on (see Waiting on you).", "ref": "later/0004_policies_locked.sql"},
      {"title": "F5Bot email importer", "text": "Turns forwarded F5Bot alert emails into Queue items. Needs an email-to-webhook forwarder. Pasting alerts in the Inbox works today.", "ref": "importers/f5bot"},
      {"title": "CSV importer endpoint", "text": "For an automation that posts platform exports. The CSV import on Metrics works today.", "ref": "importers/csv"},
      {"title": "Reddit karma", "text": "Records your karma weekly if your Reddit username and password are added as secrets.", "ref": "importers/reddit"}
    ]},
    {"status": "you", "title": "Waiting on you", "items": [
      {"title": "Turn on the lock", "text": "Before storing real people's details: the repo and the key are public, so anyone can read the data until it's locked. About 10 minutes with me; the triage task then moves to a server key."},
      {"title": "Revoke the Supabase access token", "text": "It was pasted in chat to deploy things. Revoke it at supabase.com/dashboard/account/tokens once nothing else needs deploying."},
      {"title": "One-time setup checklist", "text": "Profiles, bios, F5Bot phrases, Upwork, LinkedIn: Plan → One-time setup."},
      {"title": "Reddit commercial-use terms", "text": "Lead generation is commercial use; Reddit's Data API terms need a separate agreement for that. Public API access is reported to end in March 2027."},
      {"title": "Daily: approve and post", "text": "Queue → Shortlist, edit drafts into your own words, approve, post. Log other channels with Today's chips."}
    ]},
    {"status": "planned", "title": "Agreed, not built yet", "items": [
      {"title": "Cold email sending", "text": "Separate sending domain and inboxes, SPF/DKIM/DMARC, warm-up, then 30–50 a day per inbox, business-to-business. The last thing to set up."},
      {"title": "Hosting decision", "text": "Vercel's free plan is for non-commercial use; move to Vercel Pro or another host before relying on this commercially."}
    ]},
    {"status": "proposed", "title": "Proposed, not approved", "items": [
      {"title": "SkillX hiring signals", "text": "Companies posting AI enablement or L&D roles (public job APIs) become ranked leads with their published contact page."},
      {"title": "Contact form → lead", "text": "An enquiry form on the portfolio that creates a lead with a follow-up due today."},
      {"title": "Daily digest", "text": "A morning push: follow-ups due, new picks in the Queue, targets behind."},
      {"title": "Weekly review", "text": "Every Friday, a written keep / cut / test-next report from Metrics."},
      {"title": "Lead research", "text": "Claude reads a new lead's public profile or company site and fills notes and an opening angle."},
      {"title": "Google Alerts collector", "text": "Your phrases as Google Alerts RSS feeds (Quora, forums, blogs) into the Queue."},
      {"title": "Cold email sequences", "text": "A sending tool fed by hiring signals, with replies logged back. After the sending setup."},
      {"title": "Supabase connector in Claude chat", "text": "Ask Claude in a chat to work the Queue directly. Not needed while the scheduled task runs."}
    ]},
    {"status": "ruled_out", "title": "Ruled out", "items": [
      {"title": "Automating LinkedIn, Facebook, Upwork, Instagram", "text": "No usable API, and their terms forbid bots reading or posting; a ban would hit every flow. They stay manual, sped up by saved searches, the Queue and drafts."},
      {"title": "X (Twitter) collector", "text": "Its API costs about $200 a month."},
      {"title": "Fully automatic posting", "text": "Every reply is read and approved by you before it goes out."}
    ]}
  ]
}$json$)
on conflict (key) do update set value = excluded.value;
