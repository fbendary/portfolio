-- Lead desk: the Roadmap page's content (settings → roadmap), so it can be kept current without a
-- code change. Statuses: live, ready (built, switched off), you (waiting on you), planned (agreed, not
-- built), proposed (suggested, not approved), ruled_out. Re-running replaces the content.

insert into public.settings (key, value) values ('roadmap', $json${
 "updated": "2026-11-28",
 "sections": [
  {
   "status": "live",
   "title": "Built and running",
   "items": [
    {
     "title": "Lead desk dashboard at /admin",
     "text": "Today, Inbox, Queue, Leads, Activity, Metrics, Sources, Plan, Templates and this page, for four flows: Carna, CareerDB, SkillX, Freelancing.",
     "ref": "PR #1"
    },
    {
     "title": "Database (Supabase)",
     "text": "Schema, the fixed lists (25+ channels, 28 places, 42 saved searches, 36 templates, plan content), open access rules.",
     "ref": "PR #1"
    },
    {
     "title": "Page-view beacon",
     "text": "Visits to the public site with referrer and tracked links (?utm_source=<channel>&utm_campaign=<flow>). No cookies.",
     "ref": "PR #1"
    },
    {
     "title": "Reddit collector",
     "text": "Every new post and comment in the 22 subreddits under Places, plus saved Reddit searches. Hourly at :07.",
     "ref": "PR #2"
    },
    {
     "title": "Hacker News, Stack Exchange and Bluesky collectors",
     "text": "Phrases per flow. Hourly at :17, :27, :37.",
     "ref": "PR #3"
    },
    {
     "title": "Claude triage and drafts",
     "text": "A scheduled Claude Code task, every 3 hours at :56: turns your gists into drafts and custom LinkedIn notes, then shortlists up to 30 new items (all collectors and Facebook posts) with a reason, an angle and a first draft; passes the rest.",
     "ref": "Scheduled task"
    },
    {
     "title": "Queue: approve and post",
     "text": "Edit and approve drafts; Copy & open, or a list for Claude in Chrome; marking posted logs the comment.",
     "ref": "PR #2"
    },
    {
     "title": "Manual tools",
     "text": "Quick-log chips, batch logging, lead pipeline with touches, F5Bot alert paste, weekly numbers, CSV import, backup download.",
     "ref": "PR #1"
    },
    {
     "title": "LinkedIn prospects with Claude in Chrome (SkillX)",
     "text": "Collect page prompt: HR, People and L&D heads at small and medium, non-tech companies in English-speaking countries. On Prospects you pick, tag custom notes (your gist → Claude's note) or use a template, then Copy & open and Mark sent, which creates the lead.",
     "ref": "PR #4"
    },
    {
     "title": "Facebook groups and posts with Claude in Chrome (Carna)",
     "text": "Collect page prompts: relevant groups go to Sources → Places; recent posts asking for help go to the Queue for gists and drafts like Reddit.",
     "ref": "PR #4"
    },
    {
     "title": "This Roadmap page",
     "text": "Kept current in the database (settings → roadmap).",
     "ref": "PR #4"
    }
   ]
  },
  {
   "status": "ready",
   "title": "Built, switched off",
   "items": [
    {
     "title": "The lock",
     "text": "Owner-only database rules and magic-link sign-in. Off until you turn it on (see Waiting on you).",
     "ref": "later/0004_policies_locked.sql"
    },
    {
     "title": "F5Bot email importer",
     "text": "Turns forwarded F5Bot alert emails into Queue items. Needs an email-to-webhook forwarder. Pasting alerts in the Inbox works today.",
     "ref": "importers/f5bot"
    },
    {
     "title": "CSV importer endpoint",
     "text": "For an automation that posts platform exports. The CSV import on Metrics works today.",
     "ref": "importers/csv"
    },
    {
     "title": "Reddit karma",
     "text": "Records your karma weekly if your Reddit username and password are added as secrets.",
     "ref": "importers/reddit"
    }
   ]
  },
  {
   "status": "you",
   "title": "Waiting on you",
   "items": [
    {
     "title": "Turn on the lock",
     "text": "Before storing real people's details: the repo and the key are public, so anyone can read the data until it's locked. About 10 minutes with me; the triage task then moves to a server key."
    },
    {
     "title": "Revoke the Supabase access token",
     "text": "It was pasted in chat to deploy things. Revoke it at supabase.com/dashboard/account/tokens once nothing else needs deploying."
    },
    {
     "title": "One-time setup checklist",
     "text": "Profiles, bios, F5Bot phrases, Upwork, LinkedIn: Plan → One-time setup."
    },
    {
     "title": "Reddit commercial-use terms",
     "text": "Lead generation is commercial use; Reddit's Data API terms need a separate agreement for that. Public API access is reported to end in March 2027."
    },
    {
     "title": "Daily: approve and post",
     "text": "Queue → Shortlist, edit drafts into your own words, approve, post. Log other channels with Today's chips."
    },
    {
     "title": "LinkedIn and Facebook terms",
     "text": "Both forbid automated reading in their terms; it's your choice and your accounts. Keep Claude in Chrome sessions small and human-paced, and stop if either site shows a warning."
    }
   ]
  },
  {
   "status": "planned",
   "title": "Agreed, not built yet",
   "items": [
    {
     "title": "Cold email sending",
     "text": "Separate sending domain and inboxes, SPF/DKIM/DMARC, warm-up, then 30–50 a day per inbox, business-to-business. The last thing to set up."
    },
    {
     "title": "Hosting decision",
     "text": "Vercel's free plan is for non-commercial use; move to Vercel Pro or another host before relying on this commercially."
    }
   ]
  },
  {
   "status": "proposed",
   "title": "Proposed, not approved",
   "items": [
    {
     "title": "Upwork and Instagram with Claude in Chrome",
     "text": "The same collect-and-draft pattern as LinkedIn and Facebook, for Upwork jobs (proposal drafts) and Instagram. Agreed for later."
    },
    {
     "title": "SkillX hiring signals",
     "text": "Companies posting AI enablement or L&D roles (public job APIs) become ranked leads with their published contact page."
    },
    {
     "title": "Contact form → lead",
     "text": "An enquiry form on the portfolio that creates a lead with a follow-up due today."
    },
    {
     "title": "Daily digest",
     "text": "A morning push: follow-ups due, new picks in the Queue, targets behind."
    },
    {
     "title": "Weekly review",
     "text": "Every Friday, a written keep / cut / test-next report from Metrics."
    },
    {
     "title": "Lead research",
     "text": "Claude reads a new lead's public profile or company site and fills notes and an opening angle."
    },
    {
     "title": "Google Alerts collector",
     "text": "Your phrases as Google Alerts RSS feeds (Quora, forums, blogs) into the Queue."
    },
    {
     "title": "Cold email sequences",
     "text": "A sending tool fed by hiring signals, with replies logged back. After the sending setup."
    },
    {
     "title": "Supabase connector in Claude chat",
     "text": "Ask Claude in a chat to work the Queue directly. Not needed while the scheduled task runs."
    }
   ]
  },
  {
   "status": "ruled_out",
   "title": "Ruled out",
   "items": [
    {
     "title": "Automated connection requests, DMs and posting",
     "text": "Claude in Chrome only reads when collecting. Every request, comment and message is approved by you and sent by you (or by Claude in Chrome while you watch)."
    },
    {
     "title": "X (Twitter) collector",
     "text": "Its API costs about $200 a month."
    }
   ]
  }
 ]
}$json$)
on conflict (key) do update set value = excluded.value;
