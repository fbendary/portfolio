// CSV: platform exports (LinkedIn, Upwork, …) into metric_values, summed into weeks.
//
// The everyday way is the dashboard (Metrics → Import CSV), which needs none of this. This adapter
// is for automation that can POST a file, as JSON:
//   { "csv": "Date,Impressions\n2026-11-23,812\n…",
//     "date_column": "Date",
//     "columns": { "Impressions": "linkedin.post_impressions" },
//     "day_first": false }

import type { Importer, MetricRow } from '../_shared/importer.ts';
import { mondayOf } from '../_shared/importer.ts';
import { parseCsv, toDay, toNumber } from '../_shared/parse.ts';

export const csv: Importer = {
  key: 'csv',
  needs: [],

  async fetch({ db, body }) {
    let input: { csv?: string; date_column?: string; columns?: Record<string, string>; day_first?: boolean };
    try { input = JSON.parse(body || '{}'); } catch { throw new Error('Send JSON: { csv, date_column, columns }.'); }
    if (!input.csv || !input.date_column || !input.columns) throw new Error('Missing csv, date_column or columns.');

    const { data: defs, error } = await db.from('metric_definitions').select('key,aggregate');
    if (error) throw error;
    const agg = new Map((defs ?? []).map((d) => [d.key, d.aggregate]));
    for (const key of Object.values(input.columns)) if (!agg.has(key)) throw new Error(`Unknown metric key: ${key}`);

    const { header, rows } = parseCsv(input.csv);
    const di = header.indexOf(input.date_column);
    if (di < 0) throw new Error(`No column called ${input.date_column}.`);
    const acc = new Map<string, MetricRow & { day: string }>();
    let skipped = 0;
    for (const row of rows) {
      const day = toDay(row[di], !!input.day_first);
      if (!day) { skipped++; continue; }
      const week = mondayOf(new Date(`${day}T12:00:00Z`));
      header.forEach((col, i) => {
        const key = input.columns![col];
        const n = key ? toNumber(row[i]) : null;
        if (!key || n == null) return;
        const k = `${key}|${week}`;
        const prev = acc.get(k);
        if (agg.get(key) === 'last') { if (!prev || day >= prev.day) acc.set(k, { metric_key: key, period_start: week, value: n, source: 'csv', flow_key: null, day }); }
        else acc.set(k, { metric_key: key, period_start: week, value: (prev?.value ?? 0) + n, source: 'csv', flow_key: null, day });
      });
    }
    const metric_values = [...acc.values()].map(({ day: _day, ...v }) => v);
    return { metric_values, meta: { rows: rows.length, skipped, values: metric_values.length } };
  },
};
