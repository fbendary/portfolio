// The shared interface every importer implements, and the runner that logs each run to import_runs.
//
//   fetch(ctx) → rows       an importer only reads its source and returns rows;
//   run(importer, ctx)      checks it's switched on, writes the rows, and records the run.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';

export type InboxRow = {
  url: string;
  title?: string;
  snippet?: string;
  flow_key?: string | null;
  channel_key?: string | null;
  place_id?: string | null;
  saved_search_id?: string | null;
  found_at?: string;
  score?: number | null;
  source: string;
  kind?: 'post' | 'comment';
  author?: string;
};

export type MetricRow = {
  metric_key: string;
  period_start: string; // the Monday, YYYY-MM-DD
  value: number;
  source: string;
  flow_key?: string | null;
};

export type Rows = { inbox_items?: InboxRow[]; metric_values?: MetricRow[]; meta?: Record<string, unknown> };

export type Context = {
  db: SupabaseClient;          // service-role client: bypasses RLS, so keep it server-side
  req: Request;
  body: string;                // the raw request body (alert emails, CSV, JSON)
  env: (name: string) => string | undefined;
  settings: Record<string, unknown>; // settings → importers → <key>
};

export interface Importer {
  key: string;      // the name in import_runs and in settings → importers
  needs: string[];  // environment variables (secrets) it can't run without
  fetch(ctx: Context): Promise<Rows>;
}

export type RunResult = { importer: string; status: 'ok' | 'error' | 'skipped'; rows: number; error?: string; run_id?: string };

export async function run(imp: Importer, ctx: Omit<Context, 'settings'>): Promise<RunResult> {
  const { db } = ctx;
  const { data: s } = await db.from('settings').select('value').eq('key', 'importers').maybeSingle();
  const settings = ((s?.value ?? {}) as Record<string, Record<string, unknown>>)[imp.key] ?? {};
  const started = await db.from('import_runs').insert({ importer: imp.key, status: 'running', meta: { trigger: ctx.req.headers.get('x-trigger') ?? 'http' } }).select('id').single();
  if (started.error) throw started.error;
  const runId: string = started.data.id;
  const finish = async (status: RunResult['status'], rows: number, error?: string, meta?: Record<string, unknown>) => {
    await db.from('import_runs').update({ status, rows, error: error ?? null, finished_at: new Date().toISOString(), ...(meta ? { meta } : {}) }).eq('id', runId);
    return { importer: imp.key, status, rows, error, run_id: runId };
  };

  if (settings.enabled !== true) {
    return finish('skipped', 0, `Switched off. Turn it on under Metrics → Import CSV → Importers (settings → importers → ${imp.key} → enabled).`);
  }
  const missing = imp.needs.filter((n) => !ctx.env(n));
  if (missing.length) return finish('error', 0, `Missing secrets: ${missing.join(', ')}. Set them with supabase secrets set.`);

  try {
    const rows = await imp.fetch({ ...ctx, settings });
    let written = 0;
    if (rows.inbox_items?.length) {
      // New threads only: a link already in the inbox keeps its status.
      const { data, error } = await db.from('inbox_items').upsert(rows.inbox_items, { onConflict: 'url', ignoreDuplicates: true }).select('id');
      if (error) throw error;
      written += data?.length ?? 0;
    }
    if (rows.metric_values?.length) {
      const { error } = await db.from('metric_values').upsert(rows.metric_values, { onConflict: 'metric_key,period_start,source,flow_key' });
      if (error) throw error;
      written += rows.metric_values.length;
    }
    return finish('ok', written, undefined, rows.meta);
  } catch (e) {
    const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
    return finish('error', 0, msg.slice(0, 1000));
  }
}

// The Monday on or before a day, as YYYY-MM-DD (UTC).
export function mondayOf(d: Date = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
}

// When to collect from: the last good run of this importer minus some overlap (duplicates are
// ignored by url), or `firstS` seconds back on the first run.
export async function sinceLast(db: SupabaseClient, importer: string, overlapS = 600, firstS = 3600): Promise<number> {
  const { data } = await db.from('import_runs').select('started_at').eq('importer', importer).eq('status', 'ok')
    .order('started_at', { ascending: false }).limit(1).maybeSingle();
  return (data ? Date.parse(data.started_at) / 1000 : Date.now() / 1000 - firstS) - overlapS;
}

// Collected items nobody acted on are cleared after `days`, so the table stays small.
export async function clearOld(db: SupabaseClient, source: string, days = 7): Promise<number> {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const { count } = await db.from('inbox_items').delete({ count: 'exact' })
    .eq('source', source).eq('status', 'new').or('queue.is.null,queue.eq.pass').lt('found_at', cutoff);
  return count ?? 0;
}

// Plain text from the small HTML snippets APIs return.
export function plain(html: string, max = 600): string {
  return String(html || '').replace(/<p>/gi, ' ').replace(/<[^>]+>/g, '')
    .replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&#x2F;/g, '/').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim().slice(0, max);
}

// settings → importers → <key> → queries: { flow_key: [phrase, …] }
export function queriesByFlow(settings: Record<string, unknown>): [string, string[]][] {
  const q = (settings.queries ?? {}) as Record<string, unknown>;
  return Object.entries(q).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).map(String).filter(Boolean)]);
}
