-- Run the importers on a schedule with Supabase Cron (pg_cron) and pg_net.
-- Nothing here runs until you paste it into the SQL editor. Deploy the function first (README.md).

-- 1. The two extensions (Database → Extensions shows them too).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Keep the project URL and the importer secret in Vault, not in the job text. Run once each.
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret('<the IMPORTER_SECRET you set for the function>', 'importer_secret');

-- 3. Reddit every morning at 07:10 UTC (only useful if Reddit approved your API access).
select cron.schedule('importer-reddit', '10 7 * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/importers/reddit',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-trigger', 'cron',
      'x-importer-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'importer_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);

-- See what ran:      select * from cron.job_run_details order by start_time desc limit 20;
-- And what it did:   select * from public.import_runs order by started_at desc limit 20;
-- Stop it:           select cron.unschedule('importer-reddit');
