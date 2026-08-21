import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { ruleEffectiveness, type ActionRow, type EventRow } from "@/lib/rules-engine";

/**
 * GET /api/rules/effectiveness — "which rules actually convert?"
 *
 * Joins every action back to its source_rule_id and every ACTION_COMPLETED
 * event's payload.outcome — see ruleEffectiveness() in lib/rules-engine.ts.
 * Returns rows sorted by conversion_rate desc.
 *
 * Visible to admin + managers (branch_manager, regional_head). RMs don't
 * need this — they see per-action outcomes on their own dashboard.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role === "rm") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [actions, events] = await Promise.all([
    sql`SELECT * FROM actions WHERE source_rule_id IS NOT NULL`,
    sql`SELECT * FROM events WHERE type = 'ACTION_COMPLETED'`,
  ]);

  const rows = ruleEffectiveness(actions as unknown as ActionRow[], events as unknown as EventRow[]);

  const rules = await sql`SELECT id, name FROM rules WHERE id = ANY(${rows.map(r => r.rule_id)})`;
  const nameById = new Map<string, string>(rules.map(r => [r.id as string, r.name as string]));

  return NextResponse.json(
    rows.map(r => ({ ...r, rule_name: nameById.get(r.rule_id) ?? null }))
  );
}
