# Importers

Plumbing for automation. One Edge Function, `importers`, with one adapter per source behind the same interface:

```ts
interface Importer {
  key: string;                          // 'reddit', 'f5bot', 'csv'
  needs: string[];                      // secrets it can't run without
  fetch(ctx: Context): Promise<Rows>;   // read the source, return rows: { inbox_items?, metric_values? }
}
```

The shared runner (`_shared/importer.ts`) does everything else: it checks the importer is switched on, records the run in `import_runs` (started, finished, status, rows, error), writes the rows (new inbox links only; metric values upserted per metric, week and source), and returns the result. Every metric value carries its `source` (`reddit_api`, `csv`, …), so imported and hand-entered numbers sit side by side on Metrics → Audience.

It's one deployable function rather than one per source because Supabase recommends a few larger functions over many small ones, and it means one deploy and one set of secrets. Each source still has its own folder and can be scheduled on its own.

| Route | Writes | Needs |
|---|---|---|
| `POST /functions/v1/importers/reddit` | `reddit.karma`, new posts from saved Reddit searches → Inbox | A Reddit "script" app with approved API access |
| `POST /functions/v1/importers/f5bot` | Links in forwarded F5Bot alert emails → Inbox | An email-to-webhook forwarder |
| `POST /functions/v1/importers/csv` | A CSV export, posted as JSON → `metric_values` | Nothing |

All three are **off** until you switch them on (dashboard → Metrics → Import CSV → Importers). A call to a switched-off importer is logged as `skipped`. You don't need any of this to use the dashboard: pasting alerts in the Inbox and the CSV import on Metrics work without it.

## Deploy

1. Install the Supabase CLI (`npm i -D supabase` in a scratch folder, or see supabase.com/docs/guides/cli), then:

   ```bash
   npx supabase login
   ```

   ```bash
   npx supabase link --project-ref <project-ref>
   ```

2. Set a long random secret that every call must carry:

   ```bash
   npx supabase secrets set IMPORTER_SECRET=<a long random string>
   ```

3. Deploy (from the repository root). `--no-verify-jwt` because email forwarders and cron can't send a Supabase JWT; the function checks `IMPORTER_SECRET` itself, sent as the `x-importer-secret` header or as `?secret=` in the URL:

   ```bash
   npx supabase functions deploy importers --no-verify-jwt
   ```

4. Switch the importer on in the dashboard, then try it:

   ```bash
   curl -X POST "https://<project-ref>.supabase.co/functions/v1/importers/f5bot" -H "x-importer-secret: <secret>" -H "Content-Type: text/plain" --data-binary @alert.txt
   ```

5. To run one on a schedule, edit and paste `schedule.sql` (Supabase Cron with pg_net; the URL and secret live in Vault).

The function uses the service role key that Supabase gives every Edge Function. It bypasses Row Level Security, so it stays on the server: never put it in `admin/config.js` or `assets/site.js`.

## Reddit

What it does: with app-only (read-only) access, collects every new post and comment since the last run in the subreddits under Places (one multireddit per flow, up to 1,000 of each an hour), plus your saved Reddit searches, into the Queue (`source = reddit_api`). Skips NSFW, stickied, AutoModerator and deleted items, and clears collected items nobody acted on after 7 days. If `REDDIT_USERNAME` and `REDDIT_PASSWORD` are also set, it signs in as you and records your karma.

Secrets: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT` (Reddit asks for the form `web:lead-desk:v1 (by /u/yourname)`); optionally `REDDIT_USERNAME`, `REDDIT_PASSWORD`.

Terms and limits, which decide whether this is usable at all:

- **Access needs Reddit's approval.** Since November 2025 Reddit's Responsible Builder Policy requires you to request access and be approved before using the Data API; self-service keys are gone. Third-party reports (not checked against Reddit's own posts) say Reddit stopped accepting new requests for public API access on 31 October 2026, and plans to end the remaining public access in March 2027, moving apps to its Developer Platform. Check r/redditdev and Reddit's developer help before you spend time on it.
- **Commercial use needs its own agreement.** This is lead generation for paid offers, so read Reddit's Developer Terms and Data API Terms and ask Reddit if in doubt.
- **Your own account only, at a modest pace.** One request per saved search, in order, backing off when the rate-limit header runs low. No scraping of reddit.com pages, and never a bought or borrowed account.

Without API access, F5Bot alerts plus the saved searches (opened by hand from Sources) cover the same ground.

## F5Bot

What it does: F5Bot (f5bot.com) emails you when your keywords appear on Reddit, Hacker News or Lobsters. This adapter reads those emails, pulls out every link with its title and the keyword it matched, picks the flow whose saved search contains that keyword (or `settings → importers → f5bot → default_flow`), and adds them to the Inbox.

To use it, have an email-to-webhook service forward F5Bot's emails to `…/functions/v1/importers/f5bot?secret=<secret>`. Examples include a Cloudflare Email Routing rule with an Email Worker, an inbound route at a mail provider such as Mailgun, or an automation tool's email trigger. It accepts the raw text, JSON (`{"text": "…"}`) or a form post with `body-plain`.

Limits: F5Bot's free plan has delays and per-keyword daily caps, and very common words can't be tracked; its paid plans lift those. Use specific phrases (the ones under Sources → Saved searches).

## CSV

What it does: the same weekly aggregation as Metrics → Import CSV (totals summed per week; counts like followers keep the week's last value), for an automation that can post a file:

```json
{ "csv": "Date,Impressions\n2026-11-23,812\n", "date_column": "Date", "columns": { "Impressions": "linkedin.post_impressions" }, "day_first": false }
```

LinkedIn, Upwork and Facebook have no public API for these numbers, so they stay manual or CSV: download the export yourself from the platform (if it comes as Excel, save it as CSV), then import it. Don't scrape those sites or automate their logins; their terms forbid it, and a restricted account hurts every flow.

## Adding a source later

Make a folder with an `index.ts` that exports an `Importer`, add it to `IMPORTERS` in `index.ts`, add a key to `settings → importers`, and deploy again.

## Testing locally

```bash
npx supabase start
```

```bash
npx supabase functions serve importers --no-verify-jwt --env-file ./supabase/functions/.env
```

Put `IMPORTER_SECRET=…` in that `.env` file (it's for your machine only; don't commit it).
