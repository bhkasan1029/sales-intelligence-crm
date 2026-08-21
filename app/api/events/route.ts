import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";
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
 * POST /api/events — the hot path for the rules engine.
 *
 * What it does, in order:
 *   1. Persist the event (any downstream reporting can find it).
 *   2. Build a SCOPED evaluation context — only the users/customers/events/
 *      actions/targets that could possibly matter to a rule triggered by
 *      this event. Full-context sweeps are done by the cron endpoint later.
 *   3. Run rules-engine.runRules() on that context. The engine is pure so
 *      the run is a few ms of CPU with zero DB round-trips.
 *   4. Insert any generated action drafts. The engine already deduped in
 *      memory against `openActions`, so we just INSERT — no ON CONFLICT
 *      needed unless we add the partial unique index later.
 *
 * Body:
 *   {
 *     type: string,              // e.g. 'PAYIN_RECEIVED', 'MEETING_COMPLETED'
 *     customer_id?: string,      // optional; some events are RM-scoped only
 *     rm_id?: string,            // defaults to session.user_id (admins may override)
 *     payload?: Record<string, any>
 *   }
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const type = body?.type as string | undefined;
  const customer_id = (body?.customer_id ?? null) as string | null;
  const rm_id = (body?.rm_id ?? session.user_id) as string;
  const payload = body?.payload ?? {};

  if (!type) return NextResponse.json({ error: "type required" }, { status: 400 });
  // Only admins may log events on behalf of another user.
  if (rm_id !== session.user_id && session.role !== "admin") {
    return NextResponse.json({ error: "Cannot log events for other users" }, { status: 403 });
  }

  // ── 1) Persist the event ────────────────────────────────────────────────
  const [event] = await sql`
    INSERT INTO events (type, customer_id, rm_id, payload)
    VALUES (${type}, ${customer_id}, ${rm_id}, ${JSON.stringify(payload)})
    RETURNING *`;

  // ── 2) Load a scoped context ────────────────────────────────────────────
  // Scope = this RM's whole branch (self + peers + branch manager + regional
  // head). This is small (usually <10 rows) and correct: escalation rules
  // need the manager chain, benchmark rules need peer RMs.
  const now = new Date();
  const period = now.toISOString().slice(0, 7);

  // 2a) Users in scope.
  //   - self, self's manager, self's manager's manager (chain up)
  //   - all peers with the same manager (siblings)
  const users = await sql`
    WITH chain AS (
      SELECT id, name, role, manager_id, team_id FROM users WHERE id = ${rm_id}
      UNION
      SELECT u.id, u.name, u.role, u.manager_id, u.team_id
        FROM users u JOIN users me ON me.manager_id = u.id
        WHERE me.id = ${rm_id}
      UNION
      SELECT u.id, u.name, u.role, u.manager_id, u.team_id
        FROM users u
        JOIN users me ON me.manager_id = u.manager_id
        WHERE me.id = ${rm_id}
      UNION
      SELECT u.id, u.name, u.role, u.manager_id, u.team_id
        FROM users u
        JOIN users me ON me.id = ${rm_id}
        JOIN users bm ON bm.id = me.manager_id
        WHERE u.id = bm.manager_id
    )
    SELECT * FROM chain`;

  // 2b) Customers: everything the peer RMs own (peers = users in scope with role='rm').
  const rmIdsInScope = users.filter((u) => u.role === "rm").map((u) => u.id);
  const customers = rmIdsInScope.length
    ? await sql`SELECT * FROM customers WHERE rm_id = ANY(${rmIdsInScope})`
    : [];

  // 2c) Recent events window — 30 days. Newest-last is what the engine expects.
  const events = rmIdsInScope.length
    ? await sql`
        SELECT * FROM events
        WHERE (rm_id = ANY(${rmIdsInScope}) OR customer_id IN (
          SELECT id FROM customers WHERE rm_id = ANY(${rmIdsInScope})
        ))
          AND created_at > now() - interval '30 days'
        ORDER BY created_at ASC`
    : [];

  // 2d) Targets for the current period, across all scoped users.
  const scopedUserIds = users.map((u) => u.id);
  const targets = await sql`
    SELECT * FROM targets
    WHERE period = ${period} AND owner_id = ANY(${scopedUserIds})`;

  // 2e) Open + snoozed actions across the scope — this is the engine's dedupe pool.
  // 'done' rows are excluded on purpose so a fresh trigger can re-flag the same subject later.
  const openActions = await sql`
    SELECT * FROM actions
    WHERE rm_id = ANY(${scopedUserIds}) AND status IN ('open', 'snoozed')`;

  // 2f) All active rules.
  const rules = await sql`SELECT * FROM rules WHERE active = true`;

  // ── 3) Run the engine on the scoped context ─────────────────────────────
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

  // ── 4) Insert any brand-new action drafts ───────────────────────────────
  // The engine already skipped drafts whose dedupe_key was in openActions,
  // so every remaining draft is a fresh row. Bulk-inserted one at a time
  // for now — replace with UNNEST for real scale.
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
      RETURNING *`;
    inserted.push(row);

    // Tell the owner it landed. This is what the header bell reads, so an
    // action generated while an RM is on another page still reaches them.
    const [customer] = d.customer_id
      ? await sql`SELECT name FROM customers WHERE id = ${d.customer_id}`
      : [];
    await sql`
      INSERT INTO notifications (user_id, type, payload)
      VALUES (${d.rm_id}, ${d.type},
        ${JSON.stringify({
          title: d.message,
          body: customer?.name
            ? `${customer.name} — ${d.reason ?? "raised by the rules engine"}`
            : (d.reason ?? "Raised by the rules engine"),
          action_id: (row as { id: string }).id,
        })})`;
  }

  return NextResponse.json(
    {
      event,
      generated_actions: inserted.length,
      skipped_duplicates: result.skipped_duplicates,
      errors: result.errors,
    },
    { status: 201 }
  );
}
