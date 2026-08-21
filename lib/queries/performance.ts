import { sql } from "@/lib/db";
import { num } from "@/lib/format";
import { resolveDeadline } from "@/lib/opportunity";
import {
  COMPETENCIES,
  buildInsight,
  buildPacing,
  empRef,
  median,
  quartileOf,
  scoreCompetencies,
  windowFor,
  type CompetencyKey,
  type CreditEvent,
  type Insight,
  type Pacing,
  type Quartile,
  type RawMetrics,
  type TargetRow,
  type Timeframe,
  type Window,
} from "@/lib/performance";

/**
 * Read side of the Performance page.
 *
 * Two rules hold everywhere in this file:
 *
 *  1. The signed-in RM and every peer are put through the *same* aggregation and
 *     the *same* scoring, so a benchmark can never compare two differently-built
 *     numbers. Only aggregate medians ever leave this module — an RM never sees
 *     an individual peer's row.
 *  2. Anything that also appears on another page (credited value, SLA state) is
 *     derived from the same helpers that page uses, so the two cannot drift.
 */

/* ── Payload ────────────────────────────────────────────────────────────── */

export type PerformanceAxis = {
  key: CompetencyKey;
  label: string;
  /** Pre-split for the two-line radar labels. */
  lines: string[];
  hint: string;
  unit: string;
  you: number;
  peer_median: number;
  /** you − peer_median, in points. */
  delta: number;
  /** Size of the sample the score came from; 0 means "no data this window". */
  sample: number;
};

export type PerformanceSnapshot = {
  now: string;
  timeframe: Timeframe;
  window: {
    key: Timeframe;
    label: string;
    prev_label: string;
    noun: string;
    start: string;
    end: string;
  };
  identity: { name: string; employee_ref: string };
  pacing: Pacing;
  benchmark: {
    peer_count: number;
    /** "your branch", or "the branch" when the manager has no name on file. */
    peer_label: string;
    axes: PerformanceAxis[];
  };
  insight: Insight;
  tiles: {
    overdue: { count: number; open_total: number };
    activities: { count: number; prev: number; delta: number };
    call_to_meeting: {
      /** Meetings per hundred calls. null when no call was logged — that is an
       *  undefined ratio, not a zero, and must not be ranked as one. */
      ratio_pct: number | null;
      calls: number;
      meetings: number;
      peer_median: number | null;
      quartile: Quartile;
    };
  };
};

/* ── Row shapes ─────────────────────────────────────────────────────────── */

type PeerRow = { id: string; name: string; manager_name: string | null };

type BookRow = {
  rm_id: string;
  book: number;
  touched: number;
  completeness: unknown;
  cohort_window_total: number;
  cohort_window_converted: number;
  cohort_wide_total: number;
  cohort_wide_converted: number;
};

type ActionRow = {
  rm_id: string;
  type: string;
  status: string;
  created_at: string;
  updated_at: string;
  sla_deadline: string | null;
};

type EventRow = {
  rm_id: string;
  activities: number;
  prev_activities: number;
  calls: number;
  meetings: number;
};

/**
 * A window thinner than this has too few assigned leads to read a conversion
 * rate off, so the cohort widens to the trailing 90 days — for everyone at
 * once, so the comparison stays like-for-like.
 */
const MIN_COHORT = 3;
const WIDE_COHORT_DAYS = 90;

/** Guard against an unbounded scan; a branch's window never approaches this. */
const ACTION_LIMIT = 5000;

/* ── Entry point ────────────────────────────────────────────────────────── */

export async function getPerformance(
  rmId: string,
  timeframe: Timeframe,
  now: Date = new Date()
): Promise<PerformanceSnapshot> {
  const win = windowFor(timeframe, now);
  const startIso = win.start.toISOString();
  const endIso = win.end.toISOString();
  const prevStartIso = win.prevStart.toISOString();
  const prevEndIso = win.prevEnd.toISOString();
  const wideIso = new Date(now.getTime() - WIDE_COHORT_DAYS * 86_400_000).toISOString();

  // Peers are the other RMs reporting to the same branch manager. An RM with no
  // manager on file has no peers, and the page says so rather than guessing.
  const branch = (await sql`
    SELECT u.id, u.name, m.name AS manager_name
    FROM users u
    LEFT JOIN users m ON m.id = u.manager_id
    WHERE u.role = 'rm'
      AND u.manager_id = (SELECT manager_id FROM users WHERE id = ${rmId})`) as unknown as PeerRow[];

  const peerIds = branch.map((r) => r.id).filter((id) => id !== rmId);
  const ids = [rmId, ...peerIds];
  const managerName = branch.find((r) => r.manager_name)?.manager_name ?? null;
  const me = branch.find((r) => r.id === rmId);
  const peerLabel = managerName ? `${managerName}'s branch` : "your branch";

  const [bookRows, actionRows, eventRows, creditRows, targetRows, meRow] = await Promise.all([
    sql`
      WITH book AS (
        SELECT c.id, c.rm_id,
               (c.stage = 'active' OR EXISTS (
                  SELECT 1 FROM events e
                  WHERE e.customer_id = c.id
                    AND e.type IN ('CONVERSION_COMPLETED', 'CUSTOMER_BECAME_ACTIVE')
               )) AS converted,
               EXISTS (
                  SELECT 1 FROM events e
                  WHERE e.customer_id = c.id
                    AND e.created_at >= ${startIso} AND e.created_at < ${endIso}
               ) AS touched,
               c.assigned_at,
               -- Five things a record needs before it can be worked properly.
               -- A brand-new lead is not marked down for never having been
               -- contacted; every other stage is.
               ((c.mobile IS NOT NULL AND c.mobile <> '')::int
              + (c.email IS NOT NULL AND c.email <> '')::int
              + (c.segment IS NOT NULL AND c.segment <> '')::int
              + (COALESCE(c.potential_value, 0) > 0)::int
              + (c.stage = 'new' OR c.last_contact_at IS NOT NULL)::int
               )::numeric / 5 AS completeness
        FROM customers c
        WHERE c.rm_id = ANY(${ids})
      )
      SELECT rm_id,
             COUNT(*)::int                                   AS book,
             COUNT(*) FILTER (WHERE touched)::int            AS touched,
             COALESCE(AVG(completeness), 0)                  AS completeness,
             COUNT(*) FILTER (WHERE assigned_at >= ${startIso}
                                AND assigned_at <  ${endIso})::int AS cohort_window_total,
             COUNT(*) FILTER (WHERE assigned_at >= ${startIso}
                                AND assigned_at <  ${endIso}
                                AND converted)::int          AS cohort_window_converted,
             COUNT(*) FILTER (WHERE assigned_at >= ${wideIso})::int AS cohort_wide_total,
             COUNT(*) FILTER (WHERE assigned_at >= ${wideIso}
                                AND converted)::int          AS cohort_wide_converted
      FROM book
      GROUP BY rm_id`,

    // Deadlines are resolved in JS rather than SQL because an action with no
    // sla_deadline derives one from its type — the same rule the dashboard's
    // countdown uses. Duplicating that table in SQL is how the two drift.
    sql`
      SELECT rm_id, type, status, created_at, updated_at, sla_deadline
      FROM actions
      WHERE rm_id = ANY(${ids})
        AND (status = 'open'
             OR (status IN ('done', 'closed')
                 AND updated_at >= ${startIso} AND updated_at < ${endIso}))
      LIMIT ${ACTION_LIMIT}`,

    sql`
      SELECT rm_id,
             COUNT(*) FILTER (WHERE created_at >= ${startIso}
                                AND created_at <  ${endIso})::int AS activities,
             COUNT(*) FILTER (WHERE created_at >= ${prevStartIso}
                                AND created_at <  ${prevEndIso})::int AS prev_activities,
             COUNT(*) FILTER (WHERE type = 'CALL_LOGGED'
                                AND created_at >= ${startIso}
                                AND created_at <  ${endIso})::int AS calls,
             COUNT(*) FILTER (WHERE type = 'MEETING_COMPLETED'
                                AND created_at >= ${startIso}
                                AND created_at <  ${endIso})::int AS meetings
      FROM events
      WHERE rm_id = ANY(${ids})
      GROUP BY rm_id`,

    // Shape-only: these dated rows decide where the actual line bends, and
    // buildPacing() normalises their sum away against targets.achieved_value.
    //
    // Conversions and nothing else: a conversion is the single event that
    // writes to achieved_value (see PATCH /api/actions/[id]), so shape and
    // endpoint come from the same act. A pay-in is money the *customer* moved
    // and is not credited revenue — shaping with it would put bends in the
    // line on days when nothing was actually credited.
    sql`
      SELECT created_at, COALESCE((payload->>'amount')::numeric, 0) AS amount
      FROM events
      WHERE rm_id = ${rmId}
        AND type = 'CONVERSION_COMPLETED'
        AND created_at >= ${prevStartIso} AND created_at < ${endIso}`,

    sql`
      SELECT period,
             COALESCE(SUM(target_value), 0)   AS target_value,
             COALESCE(SUM(achieved_value), 0) AS achieved_value
      FROM targets
      WHERE owner_id = ${rmId} AND owner_role = 'rm' AND period = ANY(${win.periods})
      GROUP BY period`,

    sql`SELECT name FROM users WHERE id = ${rmId}`,
  ]);

  /* ── Fold the rows into one RawMetrics per RM ─────────────────────────── */

  const metrics = new Map<string, RawMetrics>(
    ids.map((id) => [id, blankMetrics(id)])
  );

  for (const r of bookRows as unknown as BookRow[]) {
    const m = metrics.get(r.rm_id);
    if (!m) continue;
    m.book = num(r.book);
    m.touched = num(r.touched);
    m.completeness = num(r.completeness);

    const thin = num(r.cohort_window_total) < MIN_COHORT;
    m.cohort_widened = thin;
    m.cohort_total = thin ? num(r.cohort_wide_total) : num(r.cohort_window_total);
    m.cohort_converted = thin
      ? num(r.cohort_wide_converted)
      : num(r.cohort_window_converted);
  }

  const closeDays = new Map<string, number[]>(ids.map((id) => [id, []]));
  for (const r of actionRows as unknown as ActionRow[]) {
    const m = metrics.get(r.rm_id);
    if (!m) continue;
    const { deadline } = resolveDeadline(r);
    const due = new Date(deadline).getTime();

    if (r.status === "open") {
      if (due < now.getTime()) m.open_overdue++;
      continue;
    }

    const created = new Date(r.created_at).getTime();
    const closed = new Date(r.updated_at).getTime();
    m.closed_total++;
    if (closed <= due) m.closed_on_time++;
    closeDays.get(r.rm_id)!.push(Math.max(0, (closed - created) / 86_400_000));
  }
  for (const [id, days] of closeDays) {
    const m = metrics.get(id);
    if (m && days.length > 0) {
      m.avg_close_days = days.reduce((a, b) => a + b, 0) / days.length;
    }
  }

  for (const r of eventRows as unknown as EventRow[]) {
    const m = metrics.get(r.rm_id);
    if (!m) continue;
    m.activities = num(r.activities);
    m.prev_activities = num(r.prev_activities);
    m.calls = num(r.calls);
    m.meetings = num(r.meetings);
  }

  /* ── Score, then reduce the peers to medians ──────────────────────────── */

  const mine = metrics.get(rmId)!;
  const myScores = scoreCompetencies(mine);
  const peerScores = peerIds.map((id) => scoreCompetencies(metrics.get(id)!));

  const axes: PerformanceAxis[] = COMPETENCIES.map((c) => {
    const you = myScores[c.key];
    // A peer with no sample on this axis is left out of the median rather than
    // dragged in as a zero, which would flatter everyone above them.
    const peerValues = peerScores
      .filter((s) => s[c.key].sample > 0)
      .map((s) => s[c.key].value);
    const peer_median = median(peerValues);
    return {
      key: c.key,
      label: c.label,
      lines: [...c.lines],
      hint: c.hint,
      unit: c.unit,
      you: you.value,
      peer_median,
      delta: you.value - peer_median,
      sample: you.sample,
    };
  });

  /* ── Pacing ───────────────────────────────────────────────────────────── */

  const credit: CreditEvent[] = (
    creditRows as unknown as { created_at: string; amount: unknown }[]
  ).map((r) => ({ at: new Date(r.created_at), amount: num(r.amount) }));

  const targets: TargetRow[] = (
    targetRows as unknown as { period: string; target_value: unknown; achieved_value: unknown }[]
  ).map((r) => ({
    period: r.period,
    target_value: num(r.target_value),
    achieved_value: num(r.achieved_value),
  }));

  const pacing = buildPacing(win, credit, targets, now);

  /* ── Tiles ────────────────────────────────────────────────────────────── */

  const openTotal = (actionRows as unknown as ActionRow[]).filter(
    (r) => r.rm_id === rmId && r.status === "open"
  ).length;

  const ratio = (m: RawMetrics) => (m.meetings / m.calls) * 100;
  const myRatio = mine.calls > 0 ? ratio(mine) : null;
  const peerRatios = peerIds
    .map((id) => metrics.get(id)!)
    .filter((m) => m.calls > 0)
    .map(ratio);

  const name = ((meRow as unknown as { name: string }[])[0]?.name ?? me?.name ?? "").trim();

  return {
    now: now.toISOString(),
    timeframe,
    window: windowPayload(win),
    identity: { name, employee_ref: empRef(rmId) },
    pacing,
    benchmark: { peer_count: peerIds.length, peer_label: peerLabel, axes },
    insight: buildInsight({
      axes: axes.map((a) => ({
        key: a.key,
        label: a.label,
        you: a.you,
        peer_median: a.peer_median,
        delta: a.delta,
        // With no peers on an axis the median is 0, which would read as a huge
        // lead. Such an axis is excluded from the insight's comparison.
        sample: peerIds.length > 0 && a.sample > 0 ? a.sample : 0,
      })),
      peer_count: peerIds.length,
      peer_label: peerLabel,
      pace: pacing,
      overdue: mine.open_overdue,
      untouched: Math.max(0, mine.book - mine.touched),
      avg_close_days: mine.avg_close_days,
      window: win,
    }),
    tiles: {
      overdue: { count: mine.open_overdue, open_total: openTotal },
      activities: {
        count: mine.activities,
        prev: mine.prev_activities,
        delta: mine.activities - mine.prev_activities,
      },
      call_to_meeting: {
        ratio_pct: myRatio,
        calls: mine.calls,
        meetings: mine.meetings,
        peer_median: peerRatios.length > 0 ? median(peerRatios) : null,
        quartile:
          myRatio === null
            ? { rank: null, label: "No calls logged" }
            : quartileOf(myRatio, [myRatio, ...peerRatios]),
      },
    },
  };
}

function blankMetrics(rm_id: string): RawMetrics {
  return {
    rm_id,
    book: 0,
    touched: 0,
    completeness: 0,
    closed_total: 0,
    closed_on_time: 0,
    open_overdue: 0,
    avg_close_days: null,
    cohort_total: 0,
    cohort_converted: 0,
    cohort_widened: false,
    activities: 0,
    prev_activities: 0,
    calls: 0,
    meetings: 0,
  };
}

function windowPayload(win: Window): PerformanceSnapshot["window"] {
  return {
    key: win.key,
    label: win.label,
    prev_label: win.prevLabel,
    noun: win.noun,
    start: win.start.toISOString(),
    end: win.end.toISOString(),
  };
}
