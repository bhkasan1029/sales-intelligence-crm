import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";

/**
 * POST /api/rule-change-requests — RH files a rule change for admin review.
 *
 * Body: { rule_id: string, proposed_condition: object, justification: string }
 *
 * `proposed_condition` is the DELTA the RH wants applied — only the knobs
 * they changed. Admin merges it into the rule's live condition on approval.
 * `justification` is optional here (empty string if omitted); the DB column
 * is NOT NULL but accepts empty strings.
 *
 * Auth: regional_head only. Writes one row to rule_change_requests with
 * status='pending'. Nothing on the rule itself changes until an admin
 * approves it (that's a separate endpoint, not built yet).
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "regional_head") {
    return NextResponse.json({ error: "Regional heads only" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const rule_id = body?.rule_id as string | undefined;
  const proposed_condition = body?.proposed_condition;
  const justification = ((body?.justification as string | undefined) ?? "").trim();

  if (!rule_id) {
    return NextResponse.json({ error: "rule_id required" }, { status: 400 });
  }
  if (
    !proposed_condition ||
    typeof proposed_condition !== "object" ||
    Array.isArray(proposed_condition) ||
    Object.keys(proposed_condition).length === 0
  ) {
    return NextResponse.json(
      { error: "proposed_condition must be a non-empty object" },
      { status: 400 },
    );
  }

  const [rule] = await sql`SELECT id FROM rules WHERE id = ${rule_id}`;
  if (!rule) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

  const [row] = await sql`
    INSERT INTO rule_change_requests
      (rule_id, requested_by, proposed_condition, justification)
    VALUES
      (${rule_id}, ${session.user_id}, ${JSON.stringify(proposed_condition)}, ${justification})
    RETURNING id, created_at, status`;

  return NextResponse.json(row, { status: 201 });
}
