import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getResolutionHours } from "@/lib/queries/rules-sim";
import { evaluate as evalSla } from "@/lib/simulate/sla-hours";
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
 * POST /api/simulate — retrospective + engine simulation, RH-only.
 *
 * Body: { rule_id: string, condition_overrides: Record<string, number> }
 *
 * Returns two shapes:
 *   engine — result of running the live engine with the proposed condition
 *            (before/after count, newly-added drafts, removed dedup keys,
 *            score shifts). Works for every rule in REGISTRY.
 *   sla    — only present when rule is follow_up_breach AND the override
 *            includes sla_hours. Adds the 90-day resolution histogram +
 *            reality metrics needed to preserve the correctness-critical
 *            "line vs work" distinction for that rule.
 *
 * Writes nothing.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "regional_head") {
    return NextResponse.json({ error: "Regional heads only" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const rule_id = body?.rule_id as string | undefined;
  const overrides = body?.condition_overrides;
  if (!rule_id) {
    return NextResponse.json({ error: "rule_id required" }, { status: 400 });
  }
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return NextResponse.json({ error: "condition_overrides must be an object" }, { status: 400 });
  }

  const now = new Date();
  const period = now.toISOString().slice(0, 7);

  // Full engine context so simulateRuleChange sees the same world an event
  // trigger would. All rules loaded (not just the target one) so future
  // cross-rule checks — e.g. escalated_breach watching other action_types —
  // stay consistent.
  const [users, customers, events, targets, openActions, rules] = await Promise.all([
    sql`SELECT id, name, role, manager_id, team_id FROM users`,
    sql`SELECT * FROM customers`,
    sql`SELECT * FROM events WHERE created_at > now() - interval '30 days' ORDER BY created_at ASC`,
    sql`SELECT * FROM targets WHERE period = ${period}`,
    sql`SELECT * FROM actions WHERE status IN ('open', 'snoozed')`,
    sql`SELECT * FROM rules WHERE active = true`,
  ]);

  const rule = (rules as unknown as Rule[]).find((r) => r.id === rule_id) ?? null;
  if (!rule) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

  const ctx: EvaluationContext = {
    now,
    period,
    users: users as unknown as User[],
    customers: customers as unknown as Customer[],
    events: events as unknown as EventRow[],
    targets: targets as unknown as TargetRow[],
    openActions: openActions as unknown as ActionRow[],
  };

  const engineDiff = simulateRuleChange(
    ctx,
    rules as unknown as Rule[],
    rule_id,
    overrides as Record<string, unknown>,
  );

  let slaSim = null;
  if (
    rule.action_type === "follow_up_breach" &&
    typeof (overrides as Record<string, unknown>).sla_hours === "number"
  ) {
    const resolutionHours = await getResolutionHours("follow_up_breach");
    slaSim = evalSla({
      resolutionHours,
      thresholdHours: (overrides as { sla_hours: number }).sla_hours,
    });
  }

  return NextResponse.json({
    rule: { id: rule.id, name: rule.name, action_type: rule.action_type },
    engine: engineDiff,
    sla: slaSim,
  });
}
