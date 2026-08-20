import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";

/**
 * GET /api/me/stats — RM-only aggregate for the dashboard's stat row.
 *
 * Status buckets (must match lib/rules-engine.ts):
 *   open      → visible now (status='open' AND deadline null/past)
 *   snoozed   → hidden until deadline (status='snoozed' OR future deadline)
 *   done      → status='done'
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "rm") {
    return NextResponse.json({ error: "RM only for now" }, { status: 403 });
  }

  const period = new Date().toISOString().slice(0, 7); // YYYY-MM

  const [target] = await sql`
    SELECT target_value, achieved_value FROM targets
    WHERE owner_id = ${session.user_id} AND owner_role = 'rm' AND period = ${period}
    ORDER BY set_at DESC LIMIT 1`;

  const [actionStats] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'open' AND (sla_deadline IS NULL OR sla_deadline <= now())) AS open_count,
      COUNT(*) FILTER (WHERE status <> 'done' AND sla_deadline > now()) AS snoozed_count,
      COUNT(*) FILTER (WHERE status = 'done' AND updated_at::date = current_date) AS closed_today,
      COALESCE(ROUND(AVG(priority_score) FILTER (WHERE status = 'open'), 0), 0) AS avg_priority
    FROM actions WHERE rm_id = ${session.user_id}`;

  const [customerStats] = await sql`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE stage = 'new') AS new_leads,
      COUNT(*) FILTER (WHERE stage = 'in_progress') AS in_progress,
      COUNT(*) FILTER (WHERE stage = 'active') AS active
    FROM customers WHERE rm_id = ${session.user_id}`;

  const targetValue = Number(target?.target_value ?? 0);
  const achievedValue = Number(target?.achieved_value ?? 0);
  const achievedPct = targetValue > 0 ? Math.round((achievedValue / targetValue) * 100) : 0;

  return NextResponse.json({
    period,
    target: {
      target_value: targetValue,
      achieved_value: achievedValue,
      achieved_pct: achievedPct,
    },
    actions: actionStats,
    customers: customerStats,
  });
}
