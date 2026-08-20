import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { visibleRmIds } from "@/lib/scope";

/**
 * GET /api/actions
 *   Default: rows the user should ACT ON right now
 *     — status='open' AND (no deadline set, OR deadline is now/past)
 *     — this hides both user-snoozed rows and future-rescheduled rows
 *   ?includeSnoozed=true → also return status='snoozed' and future-deadline rows
 *   ?includeClosed=true  → also return status='done'
 *
 * Scope (from lib/scope.ts):
 *   admin           → all RMs
 *   regional_head   → RMs down two levels
 *   branch_manager  → their direct RM reports
 *   rm              → only themselves
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const includeSnoozed = req.nextUrl.searchParams.get("includeSnoozed") === "true";
  const includeClosed = req.nextUrl.searchParams.get("includeClosed") === "true";

  const scope = await visibleRmIds(session);
  const rmFilter = scope === "*" ? null : (scope as string[]);

  const rows = rmFilter
    ? await sql`
        SELECT a.*, c.name AS customer_name, c.mobile AS customer_mobile, c.segment AS customer_segment
        FROM actions a
        LEFT JOIN customers c ON c.id = a.customer_id
        WHERE a.rm_id = ANY(${rmFilter})
          AND (${includeClosed}::boolean OR a.status <> 'done')
          AND (${includeSnoozed}::boolean OR (a.status = 'open' AND (a.sla_deadline IS NULL OR a.sla_deadline <= now())))
        ORDER BY a.priority_score DESC, a.created_at DESC`
    : await sql`
        SELECT a.*, c.name AS customer_name, c.mobile AS customer_mobile, c.segment AS customer_segment
        FROM actions a
        LEFT JOIN customers c ON c.id = a.customer_id
        WHERE (${includeClosed}::boolean OR a.status <> 'done')
          AND (${includeSnoozed}::boolean OR (a.status = 'open' AND (a.sla_deadline IS NULL OR a.sla_deadline <= now())))
        ORDER BY a.priority_score DESC, a.created_at DESC`;
  return NextResponse.json(rows);
}
