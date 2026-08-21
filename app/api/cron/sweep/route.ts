import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import {
  runRules,
  type EvaluationContext,
  type User,
  type Customer,
  type EventRow,
  type Rule,
  type ActionRow,
  type TargetRow,
} from "@/lib/rules-engine";

/**
 * POST /api/cron/sweep — full-scope re-evaluation.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET`. Vercel Cron sends this header
 * automatically when CRON_SECRET is set as an env var.
 *
 * Why this exists: `/api/events` fires the engine only against the scope of
 * the RM who emitted the event. Time-triggered rules (stale_pipeline,
 * dormant_reactivation, target_gap, weak_pipeline, overdue_backlog) need to
 * fire even when nothing new happened. This sweep runs the engine against
 * every RM and inserts the drafts the events-path can't see.
 *
 * Idempotent: the engine dedupes against open/snoozed actions, so running
 * this every 15 minutes is safe.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const period = now.toISOString().slice(0, 7);

  // Full-scope context. At the target scale (hundreds of RMs, tens of
  // thousands of customers) this fits comfortably in one Node process; if it
  // ever doesn't, split the sweep by branch and enqueue per-branch jobs.
  const [users, customers, events, targets, openActions, rules] = await Promise.all([
    sql`SELECT id, name, role, manager_id, team_id FROM users`,
    sql`SELECT * FROM customers`,
    sql`SELECT * FROM events WHERE created_at > now() - interval '30 days' ORDER BY created_at ASC`,
    sql`SELECT * FROM targets WHERE period = ${period}`,
    sql`SELECT * FROM actions WHERE status IN ('open', 'snoozed')`,
    sql`SELECT * FROM rules WHERE active = true`,
  ]);

  const ctx: EvaluationContext = {
    now,
    period,
    users: users as unknown as User[],
    customers: customers as unknown as Customer[],
    events: events as unknown as EventRow[],
    targets: targets as unknown as TargetRow[],
    openActions: openActions as unknown as ActionRow[],
  };
  const result = runRules(ctx, rules as unknown as Rule[]);

  const inserted: unknown[] = [];
  for (const d of result.drafts) {
    const [row] = await sql`
      INSERT INTO actions
        (customer_id, rm_id, type, message, reason, priority_score,
         sla_deadline, source_event_id, source_rule_id, status)
      VALUES
        (${d.customer_id}, ${d.rm_id}, ${d.type}, ${d.message}, ${d.reason},
         ${d.priority_score}, ${d.sla_deadline}, ${d.source_event_id},
         ${d.source_rule_id}, 'open')
      RETURNING id`;
    inserted.push(row);
  }

  return NextResponse.json({
    ran_at: now.toISOString(),
    generated_actions: inserted.length,
    skipped_duplicates: result.skipped_duplicates,
    per_rule: result.per_rule,
    errors: result.errors,
  });
}
