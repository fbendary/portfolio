// Importers: one Edge Function, one adapter per source, all behind the same interface
// (fetch() → rows) and the same runner, which records every run in import_runs.
//
//   POST /functions/v1/importers/reddit   karma + saved Reddit searches → metric_values, inbox_items
//   POST /functions/v1/importers/f5bot    forwarded alert emails       → inbox_items
//   POST /functions/v1/importers/csv      a CSV export as JSON          → metric_values
//
// Every call needs the importer secret (x-importer-secret header, or ?secret= for email forwarders),
// and each importer must be switched on in settings → importers. All are off until you turn them on.
// Deploy: supabase functions deploy importers --no-verify-jwt   (README.md in this folder)

import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { run, type Importer } from './_shared/importer.ts';
import { reddit } from './reddit/index.ts';
import { f5bot } from './f5bot/index.ts';
import { csv } from './csv/index.ts';

const IMPORTERS: Record<string, Importer> = { reddit, f5bot, csv };

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function serviceKey(): string | undefined {
  // Older projects inject SUPABASE_SERVICE_ROLE_KEY; newer ones may only have the secret key(s).
  const direct = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY');
  if (direct) return direct;
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    return keys.default ?? Object.values(keys)[0] as string | undefined;
  } catch { return undefined; }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const name = url.pathname.split('/').filter(Boolean).pop() ?? '';
  if (req.method === 'GET' && (name === 'importers' || name === '')) return json({ importers: Object.keys(IMPORTERS) });
  const imp = IMPORTERS[name];
  if (!imp) return json({ error: `Unknown importer “${name}”. Use one of: ${Object.keys(IMPORTERS).join(', ')}.` }, 404);
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const secret = Deno.env.get('IMPORTER_SECRET');
  if (!secret) return json({ error: 'Set IMPORTER_SECRET first: supabase secrets set IMPORTER_SECRET=<a long random string>' }, 500);
  const given = req.headers.get('x-importer-secret') ?? url.searchParams.get('secret') ?? '';
  if (!sameSecret(given, secret)) return json({ error: 'Wrong or missing importer secret.' }, 401);

  const key = serviceKey();
  const base = Deno.env.get('SUPABASE_URL');
  if (!key || !base) return json({ error: 'The function has no service key or project URL in its environment.' }, 500);
  const db = createClient(base, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const body = await req.text();
  if (body.length > 2_000_000) return json({ error: 'Body too large (2 MB max).' }, 413);
  try {
    const result = await run(imp, { db, req, body, env: (n) => Deno.env.get(n) });
    return json(result, result.status === 'error' ? 500 : 200);
  } catch (e) {
    return json({ importer: name, status: 'error', error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
