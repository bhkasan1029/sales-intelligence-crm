import { sql } from "@/lib/db";

/**
 * Resolution time (in hours) for every closed action of the given type
 * over the last 90 days. Used by the RH simulation page's histogram.
 *
 * `updated_at` is the closure timestamp (matches lib/queries/branch.ts —
 * see `avg_days_to_close` there). `status <> 'open'` excludes actions
 * still in flight.
 */
export async function getResolutionHours(actionType: string): Promise<number[]> {
  const rows = await sql`
    SELECT EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600 AS hours
    FROM actions
    WHERE type = ${actionType}
      AND status <> 'open'
      AND updated_at > now() - interval '90 days'`;
  return rows
    .map((r) => Number(r.hours))
    .filter((h) => Number.isFinite(h) && h >= 0);
}
