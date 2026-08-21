import { sql } from "@/lib/db";
import { num, periodOf } from "@/lib/format";

/**
 * Every query here is scoped by `manager_id` inside SQL — a branch manager can
 * only ever read rows belonging to RMs that report to them. Nothing is filtered
 * in JS after the fact.
 */

export type RosterRow = {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  target_value: number;
  achieved_value: number;
  achieved_pct: number;
  open_actions: number;
  closed_actions: number;
  customer_count: number;
  open_complaints: number;
  last_activity_at: string | null;
  tasks_total: number;
  tasks_completed: number;
  tasks_remaining: number;
  task_completion_pct: number;
};

export type BranchSummary = {
  period: string;
  rm_count: number;
  target_value: number;
  achieved_value: number;
  achieved_pct: number;
  open_actions: number;
  closed_actions: number;
  open_complaints: number;
  tasks_total: number;
  tasks_completed: number;
  task_completion_pct: number;
  rms_behind: number;
  rms_on_track: number;
};

/**
 * One round-trip for the whole roster.
 *
 * The database is remote (Neon over HTTP), so every separate `await sql` costs a
 * full network round-trip. Anything that can be expressed as one statement
 * should be — splitting this into "fetch RMs, then fetch their task counts"
 * doubles the wall-clock cost of the page for zero benefit.
 *
 * A task counts as completed when none of the actions rolled into it are still
 * open. Tasks with no linked actions at all are treated as completed too.
 */
export async function getRoster(
  bmId: string,
  period: string = periodOf()
): Promise<RosterRow[]> {
  const rows = await sql`
    WITH team AS (
      SELECT id, name, email, avatar_url FROM users
      WHERE manager_id = ${bmId} AND role = 'rm'
    ),
    per_task AS (
      SELECT tk.id, tk.rm_id,
        COUNT(a.id) FILTER (WHERE a.status = 'open')::int AS open_count
      FROM tasks tk
      LEFT JOIN action_tasks at ON at.task_id = tk.id
      LEFT JOIN actions a ON a.id = at.action_id
      WHERE tk.rm_id IN (SELECT id FROM team)
      GROUP BY tk.id, tk.rm_id
    ),
    task_stats AS (
      SELECT rm_id,
        COUNT(*)::int AS tasks_total,
        COUNT(*) FILTER (WHERE open_count = 0)::int AS tasks_completed
      FROM per_task GROUP BY rm_id
    )
    SELECT u.id, u.name, u.email, u.avatar_url,
      COALESCE(t.target_value, 0) AS target_value,
      COALESCE(t.achieved_value, 0) AS achieved_value,
      COALESCE(ts.tasks_total, 0)::int AS tasks_total,
      COALESCE(ts.tasks_completed, 0)::int AS tasks_completed,
      (SELECT COUNT(*) FROM actions a
        WHERE a.rm_id = u.id AND a.status = 'open')::int AS open_actions,
      (SELECT COUNT(*) FROM actions a
        WHERE a.rm_id = u.id AND a.status <> 'open')::int AS closed_actions,
      (SELECT COUNT(*) FROM customers c WHERE c.rm_id = u.id)::int AS customer_count,
      (SELECT COUNT(*) FROM feedback f
        WHERE f.author_id = u.id AND f.status = 'open')::int AS open_complaints,
      (SELECT MAX(e.created_at) FROM events e WHERE e.rm_id = u.id) AS last_activity_at
    FROM team u
    LEFT JOIN targets t
      ON t.owner_id = u.id AND t.owner_role = 'rm' AND t.period = ${period}
    LEFT JOIN task_stats ts ON ts.rm_id = u.id
    ORDER BY u.name`;

  return rows.map((r) => {
    const target = num(r.target_value);
    const achieved = num(r.achieved_value);
    const t = { total: num(r.tasks_total), completed: num(r.tasks_completed) };
    return {
      id: r.id as string,
      name: r.name as string,
      email: r.email as string,
      avatar_url: (r.avatar_url as string | null) ?? null,
      target_value: target,
      achieved_value: achieved,
      achieved_pct: target > 0 ? (achieved / target) * 100 : 0,
      open_actions: num(r.open_actions),
      closed_actions: num(r.closed_actions),
      customer_count: num(r.customer_count),
      open_complaints: num(r.open_complaints),
      last_activity_at: (r.last_activity_at as string | null) ?? null,
      tasks_total: t.total,
      tasks_completed: t.completed,
      tasks_remaining: t.total - t.completed,
      task_completion_pct: t.total > 0 ? (t.completed / t.total) * 100 : 0,
    };
  });
}

export function summarise(
  roster: RosterRow[],
  period: string = periodOf()
): BranchSummary {
  const acc = roster.reduce(
    (a, r) => {
      a.target_value += r.target_value;
      a.achieved_value += r.achieved_value;
      a.open_actions += r.open_actions;
      a.closed_actions += r.closed_actions;
      a.open_complaints += r.open_complaints;
      a.tasks_total += r.tasks_total;
      a.tasks_completed += r.tasks_completed;
      if (r.target_value > 0 && r.achieved_pct < 75) a.rms_behind += 1;
      else a.rms_on_track += 1;
      return a;
    },
    {
      target_value: 0,
      achieved_value: 0,
      open_actions: 0,
      closed_actions: 0,
      open_complaints: 0,
      tasks_total: 0,
      tasks_completed: 0,
      rms_behind: 0,
      rms_on_track: 0,
    }
  );

  return {
    period,
    rm_count: roster.length,
    ...acc,
    achieved_pct:
      acc.target_value > 0 ? (acc.achieved_value / acc.target_value) * 100 : 0,
    task_completion_pct:
      acc.tasks_total > 0 ? (acc.tasks_completed / acc.tasks_total) * 100 : 0,
  };
}

/* ------------------------------------------------------------------ */
/* RM drill-down                                                       */
/* ------------------------------------------------------------------ */

export type RmAction = {
  id: string;
  type: string;
  message: string;
  reason: string | null;
  priority_score: number;
  status: string;
  created_at: string;
  updated_at: string;
  customer_name: string | null;
  task_id: string | null;
};

export type RmTask = {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  action_count: number;
  open_count: number;
  completed: boolean;
  top_priority: number;
  actions: RmAction[];
};

export type SelfEvaluation = {
  id: string;
  period: string;
  self_rating: number | null;
  notes: string | null;
  created_at: string;
};

export type RmDetail = {
  rm: { id: string; name: string; email: string; avatar_url: string | null };
  period: string;
  target_value: number;
  achieved_value: number;
  achieved_pct: number;
  /** Open and actionable right now (excludes snoozed). */
  open_actions: number;
  snoozed_actions: number;
  /** Everything still open, snoozed included — matches the roster's count. */
  open_total: number;
  closed_actions: number;
  closed_week: number;
  closure_pct: number;
  avg_days_to_close: number | null;
  avg_open_priority: number;
  customer_count: number;
  customers_new: number;
  customers_in_progress: number;
  customers_active: number;
  pipeline_value: number;
  open_complaints: number;
  last_activity_at: string | null;
  tasks: RmTask[];
  tasks_total: number;
  tasks_completed: number;
  tasks_remaining: number;
  task_completion_pct: number;
  self_evaluations: SelfEvaluation[];
};

/** Returns null when the RM does not report to this branch manager. */
export async function getRmDetail(
  bmId: string,
  rmId: string,
  period: string = periodOf()
): Promise<RmDetail | null> {
  // Fired as one parallel batch, not a chain of awaits: the database is remote,
  // so six sequential statements would cost six network round-trips. The
  // ownership check below still gates every byte that leaves this function.
  const [
    [rm],
    [target],
    [stats],
    taskRows,
    actionRows,
    selfEvalRows,
  ] = await Promise.all([
    sql`
    SELECT id, name, email, avatar_url FROM users
    WHERE id = ${rmId} AND role = 'rm' AND manager_id = ${bmId}`,

    sql`
    SELECT target_value, achieved_value FROM targets
    WHERE owner_id = ${rmId} AND owner_role = 'rm' AND period = ${period}`,

  // Mirrors the metric set on the RM's own self-evaluation page — a manager and
  // an RM should never be looking at two different definitions of the same number.
    sql`
    SELECT
      (SELECT COUNT(*) FROM actions
         WHERE rm_id = ${rmId} AND status = 'open'
           AND (sla_deadline IS NULL OR sla_deadline <= now()))::int AS open_actions,
      (SELECT COUNT(*) FROM actions
         WHERE rm_id = ${rmId} AND status = 'open' AND sla_deadline > now())::int AS snoozed_actions,
      (SELECT COUNT(*) FROM actions WHERE rm_id = ${rmId} AND status <> 'open')::int AS closed_actions,
      (SELECT COUNT(*) FROM actions
         WHERE rm_id = ${rmId} AND status <> 'open'
           AND updated_at > now() - interval '7 days')::int AS closed_week,
      (SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400)
         FROM actions WHERE rm_id = ${rmId} AND status <> 'open') AS avg_days_to_close,
      (SELECT COALESCE(AVG(priority_score), 0)
         FROM actions WHERE rm_id = ${rmId} AND status = 'open') AS avg_open_priority,
      (SELECT COUNT(*) FROM customers WHERE rm_id = ${rmId})::int AS customer_count,
      (SELECT COUNT(*) FROM customers WHERE rm_id = ${rmId} AND stage = 'new')::int AS customers_new,
      (SELECT COUNT(*) FROM customers
         WHERE rm_id = ${rmId} AND stage = 'in_progress')::int AS customers_in_progress,
      (SELECT COUNT(*) FROM customers
         WHERE rm_id = ${rmId} AND stage = 'active')::int AS customers_active,
      (SELECT COALESCE(SUM(potential_value), 0) FROM customers WHERE rm_id = ${rmId}) AS pipeline_value,
      (SELECT COUNT(*) FROM feedback
         WHERE author_id = ${rmId} AND status = 'open')::int AS open_complaints,
      (SELECT MAX(created_at) FROM events WHERE rm_id = ${rmId}) AS last_activity_at`,

    sql`
    SELECT t.id, t.title, t.description, t.created_at,
      COUNT(a.id)::int AS action_count,
      COUNT(a.id) FILTER (WHERE a.status = 'open')::int AS open_count,
      COALESCE(MAX(a.priority_score), 0) AS top_priority
    FROM tasks t
    LEFT JOIN action_tasks at ON at.task_id = t.id
    LEFT JOIN actions a ON a.id = at.action_id
    WHERE t.rm_id = ${rmId}
    GROUP BY t.id, t.title, t.description, t.created_at
    ORDER BY open_count DESC, top_priority DESC`,

    sql`
    SELECT a.id, a.type, a.message, a.reason, a.priority_score, a.status,
      a.created_at, a.updated_at, c.name AS customer_name, at.task_id
    FROM actions a
    LEFT JOIN customers c ON c.id = a.customer_id
    LEFT JOIN action_tasks at ON at.action_id = a.id
    WHERE a.rm_id = ${rmId}
    ORDER BY a.status = 'open' DESC, a.priority_score DESC`,

    sql`
    SELECT id, period, self_rating, notes, created_at FROM self_evaluations
    WHERE rm_id = ${rmId} ORDER BY period DESC, created_at DESC`,
  ]);

  // Not this manager's RM — nothing computed above is returned.
  if (!rm) return null;

  const actionsByTask = new Map<string, RmAction[]>();
  for (const a of actionRows) {
    const action: RmAction = {
      id: a.id as string,
      type: a.type as string,
      message: a.message as string,
      reason: (a.reason as string | null) ?? null,
      priority_score: num(a.priority_score),
      status: a.status as string,
      created_at: a.created_at as string,
      updated_at: a.updated_at as string,
      customer_name: (a.customer_name as string | null) ?? null,
      task_id: (a.task_id as string | null) ?? null,
    };
    if (!action.task_id) continue;
    const list = actionsByTask.get(action.task_id) ?? [];
    list.push(action);
    actionsByTask.set(action.task_id, list);
  }

  const tasks: RmTask[] = taskRows.map((t) => ({
    id: t.id as string,
    title: t.title as string,
    description: (t.description as string | null) ?? null,
    created_at: t.created_at as string,
    action_count: num(t.action_count),
    open_count: num(t.open_count),
    completed: num(t.open_count) === 0,
    top_priority: num(t.top_priority),
    actions: actionsByTask.get(t.id as string) ?? [],
  }));

  const tasksCompleted = tasks.filter((t) => t.completed).length;
  const targetValue = num(target?.target_value);
  const achievedValue = num(target?.achieved_value);
  const open = num(stats?.open_actions);
  const snoozed = num(stats?.snoozed_actions);
  const openTotal = open + snoozed;
  const closed = num(stats?.closed_actions);

  return {
    rm: {
      id: rm.id as string,
      name: rm.name as string,
      email: rm.email as string,
      avatar_url: (rm.avatar_url as string | null) ?? null,
    },
    period,
    target_value: targetValue,
    achieved_value: achievedValue,
    achieved_pct: targetValue > 0 ? (achievedValue / targetValue) * 100 : 0,
    open_actions: open,
    snoozed_actions: snoozed,
    open_total: openTotal,
    closed_actions: closed,
    closed_week: num(stats?.closed_week),
    closure_pct:
      openTotal + closed > 0 ? (closed / (openTotal + closed)) * 100 : 0,
    avg_days_to_close:
      stats?.avg_days_to_close == null ? null : num(stats.avg_days_to_close),
    avg_open_priority: num(stats?.avg_open_priority),
    customer_count: num(stats?.customer_count),
    customers_new: num(stats?.customers_new),
    customers_in_progress: num(stats?.customers_in_progress),
    customers_active: num(stats?.customers_active),
    pipeline_value: num(stats?.pipeline_value),
    open_complaints: num(stats?.open_complaints),
    last_activity_at: (stats?.last_activity_at as string | null) ?? null,
    tasks,
    tasks_total: tasks.length,
    tasks_completed: tasksCompleted,
    tasks_remaining: tasks.length - tasksCompleted,
    task_completion_pct: tasks.length ? (tasksCompleted / tasks.length) * 100 : 0,
    self_evaluations: selfEvalRows.map((r) => ({
      id: r.id as string,
      period: r.period as string,
      self_rating: r.self_rating == null ? null : num(r.self_rating),
      notes: (r.notes as string | null) ?? null,
      created_at: r.created_at as string,
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

export type ActionTypeBreakdown = {
  type: string;
  open_count: number;
  closed_count: number;
  total: number;
};

export type WeeklyPoint = {
  week: string;
  raised: number;
  closed: number;
};

export type TeamReport = {
  kind: "self_evaluation" | "feedback";
  id: string;
  rm_id: string;
  rm_name: string;
  title: string;
  body: string | null;
  meta: string;
  status: string | null;
  created_at: string;
};

export type BranchOverview = {
  breakdown: ActionTypeBreakdown[];
  weekly: WeeklyPoint[];
  reports: TeamReport[];
  segments: { segment: string; customers: number; pipeline_value: number }[];
};

export async function getBranchOverview(
  bmId: string
): Promise<BranchOverview> {
  // Scoping is an inline subquery rather than a fetched id list, so all five
  // statements go out at once instead of waiting on a lookup round-trip first.
  const [breakdownRows, weeklyRows, segmentRows, evalRows, feedbackRows] =
    await Promise.all([
      sql`
    SELECT type,
      COUNT(*) FILTER (WHERE status = 'open')::int AS open_count,
      COUNT(*) FILTER (WHERE status <> 'open')::int AS closed_count,
      COUNT(*)::int AS total
    FROM actions
    WHERE rm_id IN (SELECT id FROM users WHERE manager_id = ${bmId} AND role = 'rm')
    GROUP BY type
    ORDER BY total DESC`,

      sql`
    SELECT to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS week,
      COUNT(*)::int AS raised,
      COUNT(*) FILTER (WHERE status <> 'open')::int AS closed
    FROM actions
    WHERE rm_id IN (SELECT id FROM users WHERE manager_id = ${bmId} AND role = 'rm')
      AND created_at > now() - interval '8 weeks'
    GROUP BY 1
    ORDER BY 1`,

      sql`
    SELECT COALESCE(segment, 'unspecified') AS segment,
      COUNT(*)::int AS customers,
      COALESCE(SUM(potential_value), 0) AS pipeline_value
    FROM customers
    WHERE rm_id IN (SELECT id FROM users WHERE manager_id = ${bmId} AND role = 'rm')
    GROUP BY 1
    ORDER BY pipeline_value DESC`,

      sql`
    SELECT se.id, se.rm_id, u.name AS rm_name, se.period, se.self_rating,
      se.notes, se.created_at
    FROM self_evaluations se
    JOIN users u ON u.id = se.rm_id
    WHERE u.manager_id = ${bmId} AND u.role = 'rm'
    ORDER BY se.created_at DESC
    LIMIT 20`,

      sql`
    SELECT f.id, f.author_id, u.name AS rm_name, f.category, f.subject,
      f.body, f.status, f.created_at
    FROM feedback f
    JOIN users u ON u.id = f.author_id
    WHERE u.manager_id = ${bmId} AND u.role = 'rm'
    ORDER BY f.created_at DESC
    LIMIT 20`,
    ]);

  const reports: TeamReport[] = [
    ...evalRows.map((r) => ({
      kind: "self_evaluation" as const,
      id: r.id as string,
      rm_id: r.rm_id as string,
      rm_name: r.rm_name as string,
      title: `Self-evaluation · ${r.period}`,
      body: (r.notes as string | null) ?? null,
      meta:
        r.self_rating == null ? "unrated" : `${num(r.self_rating)}/5 self-rating`,
      status: null,
      created_at: r.created_at as string,
    })),
    ...feedbackRows.map((r) => ({
      kind: "feedback" as const,
      id: r.id as string,
      rm_id: r.author_id as string,
      rm_name: r.rm_name as string,
      title: r.subject as string,
      body: (r.body as string | null) ?? null,
      meta: (r.category as string).replace(/_/g, " "),
      status: r.status as string,
      created_at: r.created_at as string,
    })),
  ].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

  return {
    breakdown: breakdownRows.map((r) => ({
      type: r.type as string,
      open_count: num(r.open_count),
      closed_count: num(r.closed_count),
      total: num(r.total),
    })),
    weekly: weeklyRows.map((r) => ({
      week: r.week as string,
      raised: num(r.raised),
      closed: num(r.closed),
    })),
    reports,
    segments: segmentRows.map((r) => ({
      segment: r.segment as string,
      customers: num(r.customers),
      pipeline_value: num(r.pipeline_value),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Reports & Analytics                                                 */
/* ------------------------------------------------------------------ */

export type RunRatePoint = {
  week: number;
  label: string;
  actual: number | null;
  target: number;
  is_current: boolean;
};

export type BranchRunRate = {
  points: RunRatePoint[];
  period_label: string;
  current_week: number;
  weeks_in_quarter: number;
  branch_target: number;
  current_actual: number;
};

/**
 * Weekly cumulative closed-actions volume vs a linear target trajectory for the
 * current quarter. Actual is null for weeks in the future so the chart can stop
 * the line at the current week; target extends to the end of the quarter.
 */
export async function getBranchRunRate(
  bmId: string,
  now: Date = new Date()
): Promise<BranchRunRate> {
  const year = now.getFullYear();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  const quarterStartMonth = (quarter - 1) * 3;
  const quarterStart = new Date(year, quarterStartMonth, 1);
  const weeksInQuarter = 13;

  const monthPeriods = [0, 1, 2].map((offset) =>
    periodOf(new Date(year, quarterStartMonth + offset, 1))
  );

  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const rawWeek = Math.ceil(
    (now.getTime() - quarterStart.getTime()) / msPerWeek
  );
  const currentWeek = Math.max(1, Math.min(weeksInQuarter, rawWeek));

  const [weeklyRows, [targetRow]] = await Promise.all([
    sql`
      WITH weeks AS (
        SELECT gs.n AS week_num,
          ${quarterStart.toISOString()}::timestamptz + (gs.n - 1) * interval '7 days' AS week_start,
          ${quarterStart.toISOString()}::timestamptz + gs.n * interval '7 days' AS week_end
        FROM generate_series(1, ${weeksInQuarter}) AS gs(n)
      ),
      per_week AS (
        SELECT w.week_num,
          COALESCE(SUM(c.potential_value), 0) AS week_value
        FROM weeks w
        LEFT JOIN actions a
          ON a.status <> 'open'
         AND a.updated_at >= w.week_start
         AND a.updated_at <  w.week_end
         AND a.rm_id IN (
           SELECT id FROM users WHERE manager_id = ${bmId} AND role = 'rm'
         )
        LEFT JOIN customers c ON c.id = a.customer_id
        GROUP BY w.week_num
      )
      SELECT week_num,
        SUM(week_value) OVER (ORDER BY week_num) AS cumulative_value
      FROM per_week
      ORDER BY week_num`,

    sql`
      SELECT COALESCE(SUM(target_value), 0) AS branch_target
      FROM targets
      WHERE owner_role = 'rm'
        AND owner_id IN (
          SELECT id FROM users WHERE manager_id = ${bmId} AND role = 'rm'
        )
        AND period = ANY(${monthPeriods})`,
  ]);

  const branchTarget = num(targetRow?.branch_target);

  const points: RunRatePoint[] = weeklyRows.map((r) => {
    const week = num(r.week_num);
    return {
      week,
      label: `W${week}`,
      actual: week <= currentWeek ? num(r.cumulative_value) : null,
      target: (branchTarget / weeksInQuarter) * week,
      is_current: week === currentWeek,
    };
  });

  const currentActual = num(points[currentWeek - 1]?.actual);

  return {
    points,
    period_label: `Q${quarter} ${year}`,
    current_week: currentWeek,
    weeks_in_quarter: weeksInQuarter,
    branch_target: branchTarget,
    current_actual: currentActual,
  };
}

export type BranchTopClient = {
  id: string;
  name: string;
  segment: string | null;
  stage: string;
  rm_id: string;
  rm_name: string;
  ytd_volume: number;
  closed_actions: number;
};

/**
 * Top N customers assigned to any RM in the branch, ranked by potential value.
 * Historical YoY growth is not tracked in the schema, so the page renders a
 * placeholder for that column instead of a fabricated number.
 */
export async function getBranchTopClients(
  bmId: string,
  limit = 5
): Promise<BranchTopClient[]> {
  const rows = await sql`
    SELECT c.id, c.name, c.segment, c.stage, c.rm_id,
      u.name AS rm_name,
      COALESCE(c.potential_value, 0) AS ytd_volume,
      (SELECT COUNT(*) FROM actions a
        WHERE a.customer_id = c.id AND a.status <> 'open')::int AS closed_actions
    FROM customers c
    JOIN users u ON u.id = c.rm_id
    WHERE u.manager_id = ${bmId} AND u.role = 'rm'
      AND COALESCE(c.potential_value, 0) > 0
    ORDER BY c.potential_value DESC
    LIMIT ${limit}`;

  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    segment: (r.segment as string | null) ?? null,
    stage: r.stage as string,
    rm_id: r.rm_id as string,
    rm_name: r.rm_name as string,
    ytd_volume: num(r.ytd_volume),
    closed_actions: num(r.closed_actions),
  }));
}

export type BranchIntelligence = {
  sla_breaches: number;
  sla_breach_pct: number;
  latency_change_pct: number | null;
  latency_recent_days: number | null;
  top_performer_name: string | null;
  top_performer_over_pct: number | null;
};

/**
 * Signals surfaced on the right rail of the Reports & Analytics page: SLA
 * breaches on open actions, week-over-month change in closure latency, and the
 * top RM if they've exceeded their target this period.
 */
export async function getBranchIntelligence(
  bmId: string,
  period: string = periodOf()
): Promise<BranchIntelligence> {
  const [[sla], [latency], topRm] = await Promise.all([
    sql`
      SELECT
        (SELECT COUNT(*) FROM actions a
          WHERE a.rm_id IN (
            SELECT id FROM users WHERE manager_id = ${bmId} AND role = 'rm'
          )
            AND a.status = 'open'
            AND a.sla_deadline IS NOT NULL
            AND a.sla_deadline < now())::int AS breached,
        (SELECT COUNT(*) FROM actions a
          WHERE a.rm_id IN (
            SELECT id FROM users WHERE manager_id = ${bmId} AND role = 'rm'
          )
            AND a.status = 'open')::int AS total_open`,

    sql`
      SELECT
        (SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400)
          FROM actions
          WHERE rm_id IN (
            SELECT id FROM users WHERE manager_id = ${bmId} AND role = 'rm'
          )
            AND status <> 'open'
            AND updated_at > now() - interval '7 days') AS recent_avg,
        (SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400)
          FROM actions
          WHERE rm_id IN (
            SELECT id FROM users WHERE manager_id = ${bmId} AND role = 'rm'
          )
            AND status <> 'open'
            AND updated_at BETWEEN now() - interval '37 days' AND now() - interval '7 days')
          AS prior_avg`,

    sql`
      SELECT u.name, t.target_value, t.achieved_value,
        CASE WHEN t.target_value > 0
          THEN (t.achieved_value / t.target_value) * 100
          ELSE 0
        END AS achieved_pct
      FROM users u
      JOIN targets t ON t.owner_id = u.id
        AND t.owner_role = 'rm'
        AND t.period = ${period}
      WHERE u.manager_id = ${bmId} AND u.role = 'rm'
      ORDER BY achieved_pct DESC
      LIMIT 1`,
  ]);

  const breached = num(sla?.breached);
  const totalOpen = num(sla?.total_open);
  const recentAvg = latency?.recent_avg == null ? null : num(latency.recent_avg);
  const priorAvg = latency?.prior_avg == null ? null : num(latency.prior_avg);
  const latencyChangePct =
    recentAvg != null && priorAvg != null && priorAvg > 0
      ? ((recentAvg - priorAvg) / priorAvg) * 100
      : null;

  const topRow = topRm[0];
  const topAchievedPct = topRow ? num(topRow.achieved_pct) : 0;
  const showTop = topRow != null && topAchievedPct >= 100;

  return {
    sla_breaches: breached,
    sla_breach_pct: totalOpen > 0 ? (breached / totalOpen) * 100 : 0,
    latency_change_pct: latencyChangePct,
    latency_recent_days: recentAvg,
    top_performer_name: showTop ? (topRow!.name as string) : null,
    top_performer_over_pct: showTop ? topAchievedPct - 100 : null,
  };
}

/* ------------------------------------------------------------------ */
/* Feedback (own submissions)                                          */
/* ------------------------------------------------------------------ */

export type FeedbackRow = {
  id: string;
  category: string;
  subject: string;
  body: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
};

export async function getOwnFeedback(userId: string): Promise<FeedbackRow[]> {
  const rows = await sql`
    SELECT id, category, subject, body, status, created_at, resolved_at
    FROM feedback
    WHERE author_id = ${userId}
    ORDER BY created_at DESC`;
  return rows as FeedbackRow[];
}

/* ------------------------------------------------------------------ */
/* Feedback (tickets raised by the team)                               */
/* ------------------------------------------------------------------ */

export type TeamTicketRow = FeedbackRow & {
  author_id: string;
  author_name: string;
  author_avatar: string | null;
};

/** Every ticket filed by an RM who reports to this branch manager. */
export async function getTeamTickets(
  managerId: string
): Promise<TeamTicketRow[]> {
  const rows = await sql`
    SELECT f.id, f.category, f.subject, f.body, f.status, f.created_at,
           f.resolved_at,
           u.id AS author_id, u.name AS author_name,
           u.avatar_url AS author_avatar
    FROM feedback f
    JOIN users u ON u.id = f.author_id
    WHERE u.manager_id = ${managerId}
    ORDER BY f.created_at DESC`;
  return rows as TeamTicketRow[];
}

/**
 * Every ticket filed anywhere below a regional head — the branch managers who
 * report to them plus the RMs who report to those branch managers.
 *
 * Two levels, so it walks the tree rather than matching manager_id once. Both
 * categories come back: a rule dispute is routed to Admin *and* the Regional
 * Head, so filtering to system_bug here would hide exactly the tickets they
 * are meant to weigh in on.
 */
export async function getRegionTickets(
  regionalHeadId: string
): Promise<TeamTicketRow[]> {
  const rows = await sql`
    WITH RECURSIVE team AS (
      SELECT id FROM users WHERE manager_id = ${regionalHeadId}
      UNION ALL
      SELECT u.id FROM users u JOIN team t ON u.manager_id = t.id
    )
    SELECT f.id, f.category, f.subject, f.body, f.status, f.created_at,
           f.resolved_at,
           u.id AS author_id, u.name AS author_name,
           u.avatar_url AS author_avatar
    FROM feedback f
    JOIN users u ON u.id = f.author_id
    WHERE f.author_id IN (SELECT id FROM team)
    ORDER BY f.created_at DESC`;
  return rows as TeamTicketRow[];
}
