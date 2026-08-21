import { sql } from "@/lib/db";
import { num } from "@/lib/format";
import {
  customerRef,
  statusOf,
  tierOf,
  type BookCustomer,
} from "@/lib/customer";
import {
  entityOf,
  oppRef,
  quarterOf,
  resolveDeadline,
  tagsFor,
  urgencyOf,
  type Opportunity,
} from "@/lib/opportunity";
import type { Scope } from "@/lib/scope";

/**
 * Read side of the RM dashboard. Every query is filtered by rm_id in SQL — an
 * RM can only ever read their own book. The shapes returned here are exactly
 * what /api/rm/* serves, so the client never has to reshape anything.
 */

/* ── Queue ──────────────────────────────────────────────────────────────── */

/** Rows still worth showing: open, and not skipped into the future. */
const QUEUE_LIMIT = 60;

type QueueRow = {
  id: string;
  type: string;
  message: string;
  reason: string | null;
  priority_score: unknown;
  status: string;
  created_at: string;
  sla_deadline: string | null;
  snoozed_until: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_segment: string | null;
  customer_stage: string | null;
  customer_mobile: string | null;
  customer_email: string | null;
  potential_value: unknown;
  last_contact_at: string | null;
  rule_name: string | null;
};

export async function getQueue(rmId: string, now = new Date()): Promise<Opportunity[]> {
  const rows = (await sql`
    SELECT a.id, a.type, a.message, a.reason, a.priority_score, a.status, a.created_at,
           a.sla_deadline, a.snoozed_until, a.customer_id,
           c.name          AS customer_name,
           c.segment       AS customer_segment,
           c.stage         AS customer_stage,
           c.mobile        AS customer_mobile,
           c.email         AS customer_email,
           c.potential_value,
           c.last_contact_at,
           r.name          AS rule_name
    FROM actions a
    LEFT JOIN customers c ON c.id = a.customer_id
    LEFT JOIN rules r ON r.id = a.source_rule_id
    WHERE a.rm_id = ${rmId}
      AND a.status = 'open'
      AND (a.snoozed_until IS NULL OR a.snoozed_until <= now())
    ORDER BY a.priority_score DESC, a.created_at DESC
    LIMIT ${QUEUE_LIMIT}`) as unknown as QueueRow[];

  const insights = await buildInsights(
    rmId,
    rows.map((r) => r.customer_id).filter((id): id is string => Boolean(id))
  );

  return rows.map((r) => toOpportunity(r, insights.get(r.customer_id ?? ""), now));
}

function toOpportunity(r: QueueRow, insight: string | undefined, now: Date): Opportunity {
  const { deadline, source } = resolveDeadline(r);
  const est_value = num(r.potential_value);
  return {
    id: r.id,
    ref: oppRef(r.id),
    type: r.type,
    message: r.message,
    reason: r.reason,
    priority_score: num(r.priority_score),
    status: r.status,
    created_at: new Date(r.created_at).toISOString(),
    deadline,
    deadline_source: source,
    snoozed_until: r.snoozed_until ? new Date(r.snoozed_until).toISOString() : null,
    customer_id: r.customer_id,
    customer_name: r.customer_name,
    customer_segment: r.customer_segment,
    customer_stage: r.customer_stage,
    customer_mobile: r.customer_mobile,
    customer_email: r.customer_email,
    last_contact_at: r.last_contact_at ? new Date(r.last_contact_at).toISOString() : null,
    entity: entityOf(r.customer_stage, Boolean(r.customer_id)),
    est_value,
    tags: tagsFor(
      { type: r.type, deadline, est_value, customer_segment: r.customer_segment },
      now.getTime()
    ),
    rule_name: r.rule_name,
    insight: insight ?? null,
  };
}

/**
 * One sentence of "why now" per customer, built from their last 30 days of
 * events. This is what the hover card shows above the rule's own reason.
 */
async function buildInsights(rmId: string, customerIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (customerIds.length === 0) return out;

  const rows = await sql`
    SELECT customer_id,
           COUNT(*)::int                                                   AS event_count,
           COUNT(*) FILTER (WHERE type = 'PAYIN_RECEIVED')::int            AS payins,
           COALESCE(SUM((payload->>'amount')::numeric)
             FILTER (WHERE type = 'PAYIN_RECEIVED'), 0)                    AS payin_value,
           MAX(created_at)                                                 AS last_event_at,
           (ARRAY_AGG(type ORDER BY created_at DESC))[1]                   AS last_event_type
    FROM events
    WHERE rm_id = ${rmId}
      AND customer_id = ANY(${customerIds})
      AND created_at > now() - interval '30 days'
    GROUP BY customer_id`;

  for (const row of rows) {
    const parts: string[] = [];
    const count = num(row.event_count);
    if (num(row.payins) > 0) {
      parts.push(
        `${num(row.payins)} pay-in${num(row.payins) > 1 ? "s" : ""} worth ₹${Math.round(
          num(row.payin_value)
        ).toLocaleString("en-IN")} landed in the last 30 days`
      );
    }
    if (count > 0) {
      const hours = Math.round((Date.now() - new Date(row.last_event_at as string).getTime()) / 3_600_000);
      const when = hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
      parts.push(
        `${count} interaction${count > 1 ? "s" : ""} logged, last was ${String(
          row.last_event_type
        )
          .toLowerCase()
          .replace(/_/g, " ")} ${when}`
      );
    }
    if (parts.length) out.set(row.customer_id as string, `${parts.join("; ")}.`);
  }
  return out;
}

/* ── KPI tiles ──────────────────────────────────────────────────────────── */

export type QuotaTile = {
  label: string;
  target_value: number;
  achieved_value: number;
  achieved_pct: number;
  expected_pct: number;
  status: "ahead" | "on_track" | "lagging";
};

export async function getQuota(rmId: string, now = new Date()): Promise<QuotaTile> {
  const q = quarterOf(now);
  const [row] = await sql`
    SELECT COALESCE(SUM(target_value), 0)   AS target_value,
           COALESCE(SUM(achieved_value), 0) AS achieved_value
    FROM targets
    WHERE owner_id = ${rmId} AND owner_role = 'rm' AND period = ANY(${q.periods})`;

  const target_value = num(row?.target_value);
  const achieved_value = num(row?.achieved_value);
  const achieved_pct = target_value > 0 ? (achieved_value / target_value) * 100 : 0;
  const expected_pct = q.elapsedPct;

  return {
    label: `${q.label} Quota Progress`,
    target_value,
    achieved_value,
    achieved_pct,
    expected_pct,
    // "On track" allows a 5-point cushion so a normal day doesn't read as red.
    status:
      achieved_pct >= 100
        ? "ahead"
        : achieved_pct >= expected_pct - 5
          ? "on_track"
          : "lagging",
  };
}

export type SlaTile = {
  at_risk: number;
  breached: number;
  window_minutes: number;
};

/** Counted off the same queue the cards render, so the tile can never disagree. */
export function getSlaTile(queue: Opportunity[], now = new Date()): SlaTile {
  let at_risk = 0;
  let breached = 0;
  for (const o of queue) {
    const u = urgencyOf(o.deadline, now.getTime());
    if (u === "critical") at_risk++;
    else if (u === "breached") breached++;
  }
  return { at_risk, breached, window_minutes: 30 };
}

export type ConversionTile = {
  rate_pct: number;
  delta_pts: number | null;
  converted: number;
  assigned: number;
  window_days: number;
};

/** Smallest cohort worth comparing period-on-period. */
const MIN_COHORT_FOR_DELTA = 3;

/**
 * Cohort conversion: of the leads assigned to this RM in the last 30 days, how
 * many are now converted (stage 'active', or a conversion event on the record).
 * The delta compares that with the cohort assigned in the 30 days before it.
 */
export async function getConversion(rmId: string): Promise<ConversionTile> {
  const [row] = await sql`
    WITH book AS (
      SELECT c.id, c.assigned_at,
             (c.stage = 'active' OR EXISTS (
                SELECT 1 FROM events e
                WHERE e.customer_id = c.id
                  AND e.type IN ('CONVERSION_COMPLETED', 'CUSTOMER_BECAME_ACTIVE')
             )) AS converted
      FROM customers c
      WHERE c.rm_id = ${rmId}
    )
    SELECT
      COUNT(*) FILTER (WHERE assigned_at > now() - interval '30 days')::int AS cur_total,
      COUNT(*) FILTER (WHERE assigned_at > now() - interval '30 days' AND converted)::int AS cur_converted,
      COUNT(*) FILTER (WHERE assigned_at <= now() - interval '30 days'
                         AND assigned_at > now() - interval '60 days')::int AS prev_total,
      COUNT(*) FILTER (WHERE assigned_at <= now() - interval '30 days'
                         AND assigned_at > now() - interval '60 days' AND converted)::int AS prev_converted
    FROM book`;

  const curTotal = num(row?.cur_total);
  const curConverted = num(row?.cur_converted);
  const prevTotal = num(row?.prev_total);
  const prevConverted = num(row?.prev_converted);

  const rate = curTotal > 0 ? (curConverted / curTotal) * 100 : 0;
  // A two-lead cohort swings by 50 points on a single deal, which says nothing.
  // Below the floor the tile shows the rate with no delta rather than noise.
  const prevRate =
    prevTotal >= MIN_COHORT_FOR_DELTA && curTotal >= MIN_COHORT_FOR_DELTA
      ? (prevConverted / prevTotal) * 100
      : null;

  return {
    rate_pct: rate,
    delta_pts: prevRate === null ? null : rate - prevRate,
    converted: curConverted,
    assigned: curTotal,
    window_days: 30,
  };
}

/* ── The whole payload ──────────────────────────────────────────────────── */

export type RmDashboard = {
  now: string;
  quota: QuotaTile;
  sla: SlaTile;
  conversion: ConversionTile;
  queue: Opportunity[];
};

export async function getRmDashboard(rmId: string): Promise<RmDashboard> {
  const now = new Date();
  const [quota, conversion, queue] = await Promise.all([
    getQuota(rmId, now),
    getConversion(rmId),
    getQueue(rmId, now),
  ]);

  return {
    now: now.toISOString(),
    quota,
    sla: getSlaTile(queue, now),
    conversion,
    queue,
  };
}

/* ── Customer book (Customers & Leads) ──────────────────────────────────── */

/**
 * An RM's book runs to tens of rows, a regional head's to hundreds. The cap is
 * a guard against an unbounded scan, not a paging mechanism — the table pages
 * client-side over whatever comes back.
 */
const BOOK_LIMIT = 500;

type BookRow = {
  id: string;
  name: string;
  segment: string | null;
  stage: string;
  potential_value: unknown;
  lead_source: string | null;
  mobile: string | null;
  email: string | null;
  assigned_at: string;
  last_contact_at: string | null;
  next_followup_at: string | null;
  open_actions: unknown;
  overdue_actions: unknown;
};

/**
 * Every customer visible to the caller, with the two action counts the table
 * needs to colour a row. Scoped in SQL — an RM can only ever read their own
 * book, a manager their team's.
 */
export async function getCustomerBook(scope: Scope): Promise<BookCustomer[]> {
  const rmIds =
    scope === "*"
      ? (await sql`SELECT id FROM users WHERE role = 'rm'`).map((r) => r.id as string)
      : scope;
  if (rmIds.length === 0) return [];

  const rows = (await sql`
    SELECT c.id, c.name, c.segment, c.stage, c.potential_value, c.lead_source,
           c.mobile, c.email, c.assigned_at, c.last_contact_at, c.next_followup_at,
           COUNT(a.id) FILTER (WHERE a.status = 'open')::int AS open_actions,
           -- Only actions carrying an explicit deadline can be counted overdue
           -- here; a NULL sla_deadline is derived at read time, not stored.
           COUNT(a.id) FILTER (WHERE a.status = 'open'
                                 AND a.sla_deadline < now())::int AS overdue_actions
    FROM customers c
    LEFT JOIN actions a ON a.customer_id = c.id
    WHERE c.rm_id = ANY(${rmIds})
    GROUP BY c.id
    ORDER BY c.potential_value DESC, c.name ASC
    LIMIT ${BOOK_LIMIT}`) as unknown as BookRow[];

  const now = Date.now();

  return rows.map((r) => {
    const next_followup_at = r.next_followup_at
      ? new Date(r.next_followup_at).toISOString()
      : null;
    const overdue_actions = num(r.overdue_actions);

    return {
      id: r.id,
      ref: customerRef(r.id),
      name: r.name,
      segment: r.segment,
      stage: r.stage,
      entity: entityOf(r.stage, true),
      tier: tierOf(r.potential_value),
      status: statusOf({ stage: r.stage, overdue_actions, next_followup_at, now }),
      potential_value: num(r.potential_value),
      lead_source: r.lead_source,
      mobile: r.mobile,
      email: r.email,
      assigned_at: new Date(r.assigned_at).toISOString(),
      last_contact_at: r.last_contact_at
        ? new Date(r.last_contact_at).toISOString()
        : null,
      next_followup_at,
      open_actions: num(r.open_actions),
      overdue_actions,
    };
  });
}

/* ── Customer drill-down (Review drawer + omni-search) ──────────────────── */

export type TimelineEntry = {
  id: string;
  kind: "event" | "action";
  type: string;
  label: string;
  detail: string | null;
  at: string;
};

export type CustomerDetail = {
  id: string;
  name: string;
  segment: string | null;
  stage: string;
  potential_value: number;
  lead_source: string | null;
  mobile: string | null;
  email: string | null;
  assigned_at: string;
  last_contact_at: string | null;
  next_followup_at: string | null;
  open_actions: number;
  closed_actions: number;
  timeline: TimelineEntry[];
};

export async function getCustomerDetail(
  rmId: string,
  customerId: string
): Promise<CustomerDetail | null> {
  const [customer] = await sql`
    SELECT * FROM customers WHERE id = ${customerId} AND rm_id = ${rmId}`;
  if (!customer) return null;

  const [counts] = await sql`
    SELECT COUNT(*) FILTER (WHERE status = 'open')::int AS open_actions,
           COUNT(*) FILTER (WHERE status IN ('done', 'closed'))::int AS closed_actions
    FROM actions WHERE customer_id = ${customerId}`;

  const events = await sql`
    SELECT id, type, payload, created_at FROM events
    WHERE customer_id = ${customerId}
    ORDER BY created_at DESC LIMIT 15`;

  const actions = await sql`
    SELECT id, type, message, status, created_at, updated_at FROM actions
    WHERE customer_id = ${customerId}
    ORDER BY created_at DESC LIMIT 15`;

  const timeline: TimelineEntry[] = [
    ...events.map((e) => ({
      id: `e-${e.id}`,
      kind: "event" as const,
      type: String(e.type),
      label: String(e.type).toLowerCase().replace(/_/g, " "),
      detail: (e.payload as Record<string, unknown>)?.amount
        ? `₹${num((e.payload as Record<string, unknown>).amount).toLocaleString("en-IN")}`
        : ((e.payload as Record<string, unknown>)?.outcome as string) ?? null,
      at: new Date(e.created_at as string).toISOString(),
    })),
    ...actions.map((a) => ({
      id: `a-${a.id}`,
      kind: "action" as const,
      type: String(a.type),
      label: String(a.message),
      detail: a.status === "open" ? "open" : "closed",
      at: new Date((a.updated_at ?? a.created_at) as string).toISOString(),
    })),
  ].sort((a, b) => +new Date(b.at) - +new Date(a.at));

  return {
    id: customer.id as string,
    name: customer.name as string,
    segment: (customer.segment as string) ?? null,
    stage: customer.stage as string,
    potential_value: num(customer.potential_value),
    lead_source: (customer.lead_source as string) ?? null,
    mobile: (customer.mobile as string) ?? null,
    email: (customer.email as string) ?? null,
    assigned_at: new Date(customer.assigned_at as string).toISOString(),
    last_contact_at: customer.last_contact_at
      ? new Date(customer.last_contact_at as string).toISOString()
      : null,
    next_followup_at: customer.next_followup_at
      ? new Date(customer.next_followup_at as string).toISOString()
      : null,
    open_actions: num(counts?.open_actions),
    closed_actions: num(counts?.closed_actions),
    timeline,
  };
}

/* ── Omni-search ────────────────────────────────────────────────────────── */

export type SearchHit = {
  kind: "customer" | "action";
  id: string;
  title: string;
  subtitle: string;
  meta: string | null;
  /** Where selecting the hit should take the user. */
  href: string;
};

export async function searchWorkspace(rmIds: string[] | "*", q: string): Promise<SearchHit[]> {
  const term = `%${q.trim()}%`;
  const scoped = rmIds !== "*";
  const ids = scoped ? (rmIds as string[]) : [];
  if (scoped && ids.length === 0) return [];

  const customers = scoped
    ? await sql`
        SELECT id, name, segment, stage, potential_value FROM customers
        WHERE rm_id = ANY(${ids}) AND (name ILIKE ${term} OR email ILIKE ${term} OR mobile ILIKE ${term})
        ORDER BY potential_value DESC LIMIT 6`
    : await sql`
        SELECT id, name, segment, stage, potential_value FROM customers
        WHERE name ILIKE ${term} OR email ILIKE ${term} OR mobile ILIKE ${term}
        ORDER BY potential_value DESC LIMIT 6`;

  const actions = scoped
    ? await sql`
        SELECT a.id, a.type, a.message, a.status, c.name AS customer_name
        FROM actions a LEFT JOIN customers c ON c.id = a.customer_id
        WHERE a.rm_id = ANY(${ids})
          AND (a.message ILIKE ${term} OR a.type ILIKE ${term} OR c.name ILIKE ${term})
        ORDER BY a.status = 'open' DESC, a.priority_score DESC LIMIT 6`
    : await sql`
        SELECT a.id, a.type, a.message, a.status, c.name AS customer_name
        FROM actions a LEFT JOIN customers c ON c.id = a.customer_id
        WHERE a.message ILIKE ${term} OR a.type ILIKE ${term} OR c.name ILIKE ${term}
        ORDER BY a.status = 'open' DESC, a.priority_score DESC LIMIT 6`;

  return [
    ...customers.map((c) => ({
      kind: "customer" as const,
      id: c.id as string,
      title: c.name as string,
      subtitle: `${c.segment ?? "—"} · ${String(c.stage).replace(/_/g, " ")}`,
      meta: `₹${Math.round(num(c.potential_value)).toLocaleString("en-IN")}`,
      href: `/RM_dashboard?customer=${c.id}`,
    })),
    ...actions.map((a) => ({
      kind: "action" as const,
      id: a.id as string,
      title: a.message as string,
      subtitle: `${oppRef(a.id as string)} · ${(a.customer_name as string) ?? "Portfolio"}`,
      meta: a.status === "open" ? "Open" : "Closed",
      href: `/RM_dashboard?focus=${a.id}`,
    })),
  ];
}

/* ── Notifications ──────────────────────────────────────────────────────── */

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  action_id: string | null;
  read_at: string | null;
  created_at: string;
};

export async function getNotifications(userId: string) {
  const rows = await sql`
    SELECT id, type, payload, read_at, created_at FROM notifications
    WHERE user_id = ${userId}
    ORDER BY created_at DESC LIMIT 20`;

  const items: NotificationRow[] = rows.map((r) => {
    const payload = (r.payload ?? {}) as Record<string, unknown>;
    return {
      id: r.id as string,
      type: r.type as string,
      title: (payload.title as string) ?? String(r.type).replace(/_/g, " "),
      body: (payload.body as string) ?? null,
      action_id: (payload.action_id as string) ?? null,
      read_at: r.read_at ? new Date(r.read_at as string).toISOString() : null,
      created_at: new Date(r.created_at as string).toISOString(),
    };
  });

  return { items, unread: items.filter((i) => !i.read_at).length };
}

/* ── Branch chip ────────────────────────────────────────────────────────── */

export type BranchInfo = {
  /** What the header chip shows. */
  label: string;
  manager_name: string | null;
  manager_role: string | null;
  regional_head: string | null;
  team_size: number;
};

/**
 * Where the signed-in user sits in the hierarchy. An RM's "branch" is their
 * manager's; a branch manager's is their own; above that it is the whole region.
 */
export async function getBranchInfo(userId: string, role: string): Promise<BranchInfo> {
  const [row] = await sql`
    SELECT m.id AS manager_id, m.name AS manager_name, m.role AS manager_role,
           rh.name AS regional_head
    FROM users u
    LEFT JOIN users m ON m.id = u.manager_id
    LEFT JOIN users rh ON rh.id = m.manager_id
    WHERE u.id = ${userId}`;

  const managerId = (row?.manager_id as string) ?? null;
  // RMs count their peers under the same manager; anyone senior counts the RMs
  // reporting into them.
  const teamOwnerId = role === "rm" ? managerId : userId;
  const [count] = teamOwnerId
    ? await sql`
        SELECT COUNT(*)::int AS n FROM users
        WHERE role = 'rm' AND (manager_id = ${teamOwnerId} OR manager_id IN (
          SELECT id FROM users WHERE manager_id = ${teamOwnerId}
        ))`
    : [{ n: 0 }];

  const managerName = (row?.manager_name as string) ?? null;
  const label =
    role === "rm"
      ? managerName
        ? `${managerName}'s branch`
        : "Unassigned"
      : role === "branch_manager"
        ? "Your branch"
        : "All branches";

  return {
    label,
    manager_name: managerName,
    manager_role: (row?.manager_role as string) ?? null,
    regional_head: (row?.regional_head as string) ?? null,
    team_size: num(count?.n),
  };
}
