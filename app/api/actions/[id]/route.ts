import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { closeAction, snoozeAction, type ActionRow, type Outcome } from "@/lib/rules-engine";

/**
 * PATCH /api/actions/[id]
 * Body: { op: 'complete', outcome?: 'converted'|'contacted'|'no_answer'|'not_interested'|'deferred', note?: string }
 *     | { op: 'snooze', hours: number }
 *     | { op: 'reschedule', when: string (ISO datetime) }
 *
 * Status semantics (aligned with lib/rules-engine.ts):
 *   'open'    → visible in the RM's Tasks list (sla_deadline null or past)
 *   'snoozed' → user paused; hidden until sla_deadline passes
 *   'done'    → completed; excluded from the engine's dedupe pool so a fresh
 *               trigger can re-flag the same customer/rule combo later
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "rm") {
    return NextResponse.json({ error: "Only RMs can update their actions" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const op = body?.op as "complete" | "snooze" | "reschedule" | undefined;
  if (!op) return NextResponse.json({ error: "Missing op" }, { status: 400 });

  const [existing] = await sql`SELECT * FROM actions WHERE id = ${id}`;
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.rm_id !== session.user_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();

  // ── COMPLETE ─────────────────────────────────────────────────────────────
  // Uses the engine's closeAction() to compute all the writes we need to
  // make in one place: the action update, an ACTION_COMPLETED event (so
  // ruleEffectiveness can attribute conversions later), a customer touch
  // (last_contact_at), and the audit row.
  if (op === "complete") {
    const outcome = ((body.outcome as Outcome) ?? "contacted");
    const plan = closeAction(
      existing as unknown as ActionRow,
      outcome,
      session.user_id,
      now,
      body.note
    );

    const [updated] = await sql`
      UPDATE actions
      SET status = ${plan.actionUpdate.status},
          updated_at = ${plan.actionUpdate.updated_at}
      WHERE id = ${plan.actionUpdate.id}
      RETURNING *`;

    // Emit the ACTION_COMPLETED event so downstream rule-effectiveness reports
    // can join back through payload.source_rule_id.
    await sql`
      INSERT INTO events (type, customer_id, rm_id, payload)
      VALUES (${plan.event.type}, ${plan.event.customer_id},
              ${plan.event.rm_id}, ${JSON.stringify(plan.event.payload)})`;

    if (plan.customerUpdate) {
      await sql`
        UPDATE customers SET last_contact_at = ${plan.customerUpdate.last_contact_at}
        WHERE id = ${plan.customerUpdate.id}`;
    }

    await sql`
      INSERT INTO audit_log (actor_id, action, entity_type, entity_id, before, after)
      VALUES (${plan.audit.actor_id}, ${plan.audit.action}, ${plan.audit.entity_type},
              ${plan.audit.entity_id}, ${JSON.stringify(plan.audit.before)},
              ${JSON.stringify(plan.audit.after)})`;

    return NextResponse.json(updated);
  }

  // ── SNOOZE ───────────────────────────────────────────────────────────────
  // Uses engine.snoozeAction(): sets status='snoozed' + sla_deadline as the
  // wake-up time. The engine treats snoozed actions as still occupying the
  // dedupe slot so the same rule doesn't re-fire while paused.
  if (op === "snooze") {
    const hours = Number(body.hours);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 7) {
      return NextResponse.json({ error: "hours must be 1–168" }, { status: 400 });
    }
    const until = new Date(now.getTime() + hours * 3_600_000);
    const plan = snoozeAction(existing as unknown as ActionRow, until, session.user_id, now);

    const [updated] = await sql`
      UPDATE actions
      SET status = ${plan.actionUpdate.status},
          sla_deadline = ${plan.actionUpdate.sla_deadline},
          updated_at = ${plan.actionUpdate.updated_at}
      WHERE id = ${plan.actionUpdate.id}
      RETURNING *`;

    await sql`
      INSERT INTO audit_log (actor_id, action, entity_type, entity_id, before, after)
      VALUES (${plan.audit.actor_id}, ${plan.audit.action}, ${plan.audit.entity_type},
              ${plan.audit.entity_id}, ${JSON.stringify(plan.audit.before)},
              ${JSON.stringify(plan.audit.after)})`;

    return NextResponse.json(updated);
  }

  // ── RESCHEDULE ───────────────────────────────────────────────────────────
  // Same idea as snooze but keeps status='open' — user is planning a specific
  // future time rather than pausing. Deadline in the future hides it from the
  // Tasks list until then.
  if (op === "reschedule") {
    const when = body.when as string | undefined;
    if (!when) return NextResponse.json({ error: "when is required" }, { status: 400 });
    const dt = new Date(when);
    if (isNaN(dt.getTime())) {
      return NextResponse.json({ error: "Invalid datetime" }, { status: 400 });
    }
    const [row] = await sql`
      UPDATE actions
      SET sla_deadline = ${dt.toISOString()}, updated_at = now()
      WHERE id = ${id} RETURNING *`;
    return NextResponse.json(row);
  }

  return NextResponse.json({ error: "Unknown op" }, { status: 400 });
}
