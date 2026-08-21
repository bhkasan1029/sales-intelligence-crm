import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";
import {
  simulateRuleChange,
  type EvaluationContext,
  type User,
  type Customer,
  type EventRow,
  type Rule,
  type ActionRow,
  type TargetRow,
} from "@/lib/rules-engine";

/**
 * POST /api/rules/simulate — "what would change if I tweaked this rule?"
 *
 * Body: { rule_id: string, proposed: Record<string, any>, proposed_weight?: number }
 *
 * Runs the same evaluator that runs in production, against a snapshot of live
 * data, with the proposed condition merged over the rule's current condition.
 * Returns before/after counts, added drafts, and dedupe_keys that would no
 * longer fire — see SimulationDiff in lib/rules-engine.ts.
 *
 * Admin-only. Managers can request changes via /api/rules/change-requests
 * (rule_change_requests table) — this endpoint is the preview tool the
 * admin uses when reviewing those requests.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const rule_id = body?.rule_id as string | undefined;
  const proposed = body?.proposed;
  const proposed_weight = body?.proposed_weight as number | undefined;
  if (!rule_id || !proposed || typeof proposed !== "object") {
    return NextResponse.json({ error: "rule_id and proposed (object) required" }, { status: 400 });
  }

  const now = new Date();
  const period = now.toISOString().slice(0, 7);

  const [users, customers, events, targets, openActions, rules] = await Promise.all([
    sql`SELECT id, name, role, manager_id, team_id FROM users`,
    sql`SELECT * FROM customers`,
    sql`SELECT * FROM events WHERE created_at > now() - interval '30 days' ORDER BY created_at ASC`,
    sql`SELECT * FROM targets WHERE period = ${period}`,
    sql`SELECT * FROM actions WHERE status IN ('open', 'snoozed')`,
    sql`SELECT * FROM rules WHERE id = ${rule_id}`,
  ]);

  if (!rules.length) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

  const ctx: EvaluationContext = {
    now,
    period,
    users: users as unknown as User[],
    customers: customers as unknown as Customer[],
    events: events as unknown as EventRow[],
    targets: targets as unknown as TargetRow[],
    openActions: openActions as unknown as ActionRow[],
  };

  const diff = simulateRuleChange(ctx, rules as unknown as Rule[], rule_id, proposed, proposed_weight);
  return NextResponse.json(diff);
}
