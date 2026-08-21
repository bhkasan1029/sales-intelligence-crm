/**
 * Everything the Performance page needs that is pure computation: the
 * weekly/monthly/annual windows, the run-rate series maths, the five
 * competency scores, and the written insight.
 *
 * Nothing here touches the database. lib/queries/performance.ts fetches the
 * rows and hands them to these functions, so the same scoring rule is applied
 * to the signed-in RM and to every peer they are benchmarked against — a
 * comparison where the two sides were scored differently would be worthless.
 */

import { num } from "@/lib/format";

/* ── Identity ───────────────────────────────────────────────────────────── */

/**
 * Short human-quotable staff handle, e.g. "EMP-942". Derived from the UUID the
 * same way oppRef() derives an action's, so it is stable for the life of the
 * row without another column.
 */
export function empRef(id: string): string {
  const hex = (id ?? "").replace(/-/g, "").slice(0, 8);
  const n = parseInt(hex || "0", 16);
  return `EMP-${100 + (n % 900)}`;
}

/* ── Timeframes ─────────────────────────────────────────────────────────── */

export type Timeframe = "weekly" | "monthly" | "annual";

export const TIMEFRAMES: { key: Timeframe; label: string }[] = [
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "annual", label: "Annual" },
];

export function parseTimeframe(value: string | null | undefined): Timeframe {
  return value === "weekly" || value === "annual" ? value : "monthly";
}

/** One column of the trajectory chart. */
export type Bucket = {
  start: Date;
  end: Date;
  label: string;
  /** Whether this bucket's label is printed on the x-axis. */
  tick: boolean;
};

export type Window = {
  key: Timeframe;
  /** "Week of 17 Aug", "August 2026", "2026" */
  label: string;
  /** How the previous window is referred to in copy. */
  prevLabel: string;
  /** Noun for "this ___" in insight copy. */
  noun: string;
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
  buckets: Bucket[];
  /** Every YYYY-MM the window and its predecessor touch — targets are monthly. */
  periods: string[];
};

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Every YYYY-MM touched by [from, to). */
function periodsBetween(from: Date, to: Date): string[] {
  const out: string[] = [];
  for (let m = startOfMonth(from); m < to; m = addMonths(m, 1)) out.push(monthKey(m));
  return out;
}

export function windowFor(key: Timeframe, now: Date = new Date()): Window {
  if (key === "weekly") {
    // ISO week — Monday start, so "this week" means the same thing to everyone.
    const offset = (now.getDay() + 6) % 7;
    const start = addDays(startOfDay(now), -offset);
    const end = addDays(start, 7);
    const prevStart = addDays(start, -7);
    return {
      key,
      label: `Week of ${start.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`,
      prevLabel: "last week",
      noun: "week",
      start,
      end,
      prevStart,
      prevEnd: start,
      buckets: range(7).map((i) => {
        const s = addDays(start, i);
        return { start: s, end: addDays(s, 1), label: WEEKDAYS[i]!, tick: true };
      }),
      periods: periodsBetween(prevStart, end),
    };
  }

  if (key === "annual") {
    const year = now.getFullYear();
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);
    const prevStart = new Date(year - 1, 0, 1);
    return {
      key,
      label: String(year),
      prevLabel: "last year",
      noun: "year",
      start,
      end,
      prevStart,
      prevEnd: start,
      buckets: range(12).map((i) => ({
        start: new Date(year, i, 1),
        end: new Date(year, i + 1, 1),
        label: MONTHS_SHORT[i]!,
        // Every other month, so twelve labels never collide on a narrow card.
        tick: i % 2 === 0,
      })),
      periods: periodsBetween(prevStart, end),
    };
  }

  const start = startOfMonth(now);
  const end = addMonths(start, 1);
  const prevStart = addMonths(start, -1);
  const total = daysInMonth(now);
  return {
    key: "monthly",
    label: start.toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
    prevLabel: "last month",
    noun: "month",
    start,
    end,
    prevStart,
    prevEnd: start,
    buckets: range(total).map((i) => {
      const s = addDays(start, i);
      return {
        start: s,
        end: addDays(s, 1),
        label: String(i + 1),
        tick: i === 0 || (i + 1) % 7 === 0,
      };
    }),
    periods: periodsBetween(prevStart, end),
  };
}

/* ── Trajectory pacing ──────────────────────────────────────────────────── */

/** A dated event that moved money. Only its date and size are used. */
export type CreditEvent = { at: Date; amount: number };

export type TargetRow = { period: string; target_value: number; achieved_value: number };

export type PacingPoint = {
  label: string;
  at: string;
  /** Cumulative credited value. null once the bucket is entirely in the future. */
  actual: number | null;
  /** Cumulative expected value at this point in the window. */
  target: number;
  tick: boolean;
};

export type Pacing = {
  points: PacingPoint[];
  /** Credited in this window. For a monthly window this is exactly the
   *  targets row's achieved_value — the number the Dashboard quota tile shows. */
  achieved_value: number;
  /** The whole window's target. */
  target_value: number;
  /** What the run-rate says should have been credited by now. */
  expected_value: number;
  achieved_pct: number;
  expected_pct: number;
  /** Positive means ahead of the run-rate, in percentage points. */
  pace_delta_pts: number;
  status: "ahead" | "on_track" | "lagging";
  prev_achieved_value: number;
  /** Growth against the equivalent previous window. null when it was empty. */
  prev_delta_pct: number | null;
};

/**
 * Credited value per day.
 *
 * The authoritative "how much have I brought in" number is targets.achieved_value —
 * it is what the Dashboard's quota tile reads and what a conversion writes to. It
 * carries no date, so the *shape* of the curve comes from dated money events
 * (conversions and pay-ins) and is then scaled so each month sums back to exactly
 * that month's achieved_value. The endpoint can therefore never disagree with the
 * Dashboard, while every bend in the line is a real day something happened.
 *
 * A month with a credited value but no dated events (a target set by hand, say)
 * spreads evenly across the days that have actually elapsed in it.
 */
function creditByDay(
  from: Date,
  to: Date,
  events: CreditEvent[],
  targets: Map<string, TargetRow>,
  now: Date
): Map<string, number> {
  const out = new Map<string, number>();
  const add = (d: Date, v: number) => {
    const k = dayKey(d);
    out.set(k, (out.get(k) ?? 0) + v);
  };

  for (let m = startOfMonth(from); m < to; m = addMonths(m, 1)) {
    const achieved = num(targets.get(monthKey(m))?.achieved_value);
    if (achieved <= 0) continue;

    const monthEnd = addMonths(m, 1);
    const inMonth = events.filter((e) => e.at >= m && e.at < monthEnd && e.amount > 0);
    const total = inMonth.reduce((sum, e) => sum + e.amount, 0);

    if (total > 0) {
      const scale = achieved / total;
      for (const e of inMonth) add(e.at, e.amount * scale);
    } else {
      const last = now < monthEnd ? startOfDay(now) : addDays(monthEnd, -1);
      const elapsed = Math.max(1, Math.round((last.getTime() - m.getTime()) / DAY_MS) + 1);
      for (let i = 0; i < elapsed; i++) add(addDays(m, i), achieved / elapsed);
    }
  }
  return out;
}

/**
 * Expected value per day. Each month contributes its own target spread evenly
 * across its days, so a window spanning months with different targets bends
 * rather than running straight. Future months with no target row yet carry the
 * last one forward — otherwise the annual target line would go flat from today.
 */
function targetByDay(from: Date, to: Date, targets: Map<string, TargetRow>): Map<string, number> {
  const out = new Map<string, number>();
  let carry = 0;
  for (let m = startOfMonth(from); m < to; m = addMonths(m, 1)) {
    const row = targets.get(monthKey(m));
    const value = num(row?.target_value);
    if (value > 0) carry = value;
    const dim = daysInMonth(m);
    const rate = (value > 0 ? value : carry) / dim;
    for (let i = 0; i < dim; i++) out.set(dayKey(addDays(m, i)), rate);
  }
  return out;
}

/** Sum a per-day map over [from, to). */
function sumDays(map: Map<string, number>, from: Date, to: Date): number {
  let total = 0;
  for (let d = startOfDay(from); d < to; d = addDays(d, 1)) total += map.get(dayKey(d)) ?? 0;
  return total;
}

/** How much of the target may slip before "on track" stops being honest. */
const ON_TRACK_CUSHION_PTS = 5;

export function buildPacing(
  win: Window,
  events: CreditEvent[],
  targetRows: TargetRow[],
  now: Date = new Date()
): Pacing {
  const targets = new Map(targetRows.map((t) => [t.period, t]));
  const from = win.prevStart < win.start ? win.prevStart : win.start;
  const credit = creditByDay(from, win.end, events, targets, now);
  const rate = targetByDay(from, win.end, targets);

  const points: PacingPoint[] = [
    { label: "", at: win.start.toISOString(), actual: 0, target: 0, tick: false },
  ];

  let actual = 0;
  let target = 0;
  for (const b of win.buckets) {
    target += sumDays(rate, b.start, b.end);
    // Every credit event is in the past by definition, so a bucket that has
    // started can be summed whole — there is nothing in it yet to come.
    const started = b.start <= now;
    if (started) actual += sumDays(credit, b.start, b.end);
    points.push({
      label: b.label,
      at: b.end.toISOString(),
      actual: started ? actual : null,
      target,
      tick: b.tick,
    });
  }

  const target_value = target;
  const achieved_value = actual;
  const toNow = addDays(startOfDay(now), 1);
  const expected_value = sumDays(rate, win.start, toNow < win.end ? toNow : win.end);

  const achieved_pct = target_value > 0 ? (achieved_value / target_value) * 100 : 0;
  const expected_pct = target_value > 0 ? (expected_value / target_value) * 100 : 0;
  const pace_delta_pts = achieved_pct - expected_pct;

  // Compare like for like: the same *slice* of the previous window, not all of
  // it. On the 3rd of the month, three days of trading against a full previous
  // month would read as a collapse every time.
  const elapsed = Math.min(now.getTime(), win.end.getTime()) - win.start.getTime();
  const prevCutoff = new Date(
    Math.min(win.prevStart.getTime() + elapsed, win.prevEnd.getTime())
  );
  const prev_achieved_value = sumDays(credit, win.prevStart, prevCutoff);

  return {
    points,
    achieved_value,
    target_value,
    expected_value,
    achieved_pct,
    expected_pct,
    pace_delta_pts,
    status:
      achieved_pct >= 100
        ? "ahead"
        : pace_delta_pts >= -ON_TRACK_CUSHION_PTS
          ? "on_track"
          : "lagging",
    prev_achieved_value,
    prev_delta_pct:
      prev_achieved_value > 0
        ? ((achieved_value - prev_achieved_value) / prev_achieved_value) * 100
        : null,
  };
}

/* ── Competencies (the peer-benchmark radar) ────────────────────────────── */

/**
 * The five axes, in the order they are drawn — clockwise from the top of the
 * pentagon. Changing this order rotates the radar.
 */
export const COMPETENCIES = [
  {
    key: "relationship_growth",
    label: "Relationship Growth",
    lines: ["Relationship", "Growth"],
    hint: "Share of your book you made contact with in this window",
    unit: "of book engaged",
  },
  {
    key: "sla_compliance",
    label: "SLA Compliance",
    lines: ["SLA", "Compliance"],
    hint: "Actions resolved inside their response deadline",
    unit: "resolved on time",
  },
  {
    key: "conversion",
    label: "Conversion",
    lines: ["Conversion"],
    hint: "Leads from the cohort that are now active clients",
    unit: "of cohort converted",
  },
  {
    key: "data_accuracy",
    label: "Data Accuracy",
    lines: ["Data", "Accuracy"],
    hint: "Customer records with complete contact, segment and value data",
    unit: "of fields complete",
  },
  {
    key: "pipeline_velocity",
    label: "Pipeline Velocity",
    lines: ["Pipeline", "Velocity"],
    hint: "How fast a raised action gets closed",
    unit: "velocity score",
  },
] as const;

export type CompetencyKey = (typeof COMPETENCIES)[number]["key"];

/** Everything the five scores are computed from, for one RM. */
export type RawMetrics = {
  rm_id: string;
  /** Customers on the book. */
  book: number;
  /** Of those, how many saw an event inside the window. */
  touched: number;
  /** Average field-completeness across the book, 0–1. */
  completeness: number;
  /** Actions resolved inside the window. */
  closed_total: number;
  /** Of those, how many landed on or before their deadline. */
  closed_on_time: number;
  /** Open actions already past their deadline right now. */
  open_overdue: number;
  /** Mean days from raised to resolved, over the window's closures. */
  avg_close_days: number | null;
  /** Conversion cohort actually used (widened when the window is too thin). */
  cohort_total: number;
  cohort_converted: number;
  cohort_widened: boolean;
  activities: number;
  prev_activities: number;
  calls: number;
  meetings: number;
};

/** A closure inside a day of being raised is as good as it gets. */
export const VELOCITY_FAST_DAYS = 1;
/** Two weeks to close is the floor — past this the score is zero. */
export const VELOCITY_SLOW_DAYS = 14;

export function velocityScore(avgDays: number | null): number {
  if (avgDays == null) return 0;
  if (avgDays <= VELOCITY_FAST_DAYS) return 100;
  if (avgDays >= VELOCITY_SLOW_DAYS) return 0;
  return ((VELOCITY_SLOW_DAYS - avgDays) / (VELOCITY_SLOW_DAYS - VELOCITY_FAST_DAYS)) * 100;
}

/** A score plus the sample it came from, so "0" and "no data" stay tellable apart. */
export type Score = { value: number; sample: number };

const pct = (n: number, d: number): Score => ({
  value: d > 0 ? (n / d) * 100 : 0,
  sample: d,
});

export function scoreCompetencies(m: RawMetrics): Record<CompetencyKey, Score> {
  return {
    relationship_growth: pct(m.touched, m.book),
    // Letting something breach counts against you the same as closing it late,
    // which is what makes this move when the Overdue SLAs tile moves.
    sla_compliance: pct(m.closed_on_time, m.closed_total + m.open_overdue),
    conversion: pct(m.cohort_converted, m.cohort_total),
    data_accuracy: { value: m.completeness * 100, sample: m.book },
    pipeline_velocity: {
      value: velocityScore(m.avg_close_days),
      sample: m.closed_total,
    },
  };
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/* ── Quartile ranking ───────────────────────────────────────────────────── */

export type Quartile = { rank: 1 | 2 | 3 | 4 | null; label: string };

/**
 * Where `value` sits in `population` (which must include `value` itself).
 * Rank 1 is the top quartile. A population of one has no ranking to give.
 */
export function quartileOf(value: number, population: number[]): Quartile {
  if (population.length < 2) return { rank: null, label: "No peer data" };
  const below = population.filter((v) => v < value).length;
  const percentile = (below / population.length) * 100;
  if (percentile >= 75) return { rank: 1, label: "Top quartile" };
  if (percentile >= 50) return { rank: 2, label: "Upper mid" };
  if (percentile >= 25) return { rank: 3, label: "Lower mid" };
  return { rank: 4, label: "Bottom quartile" };
}

/* ── Radar geometry ─────────────────────────────────────────────────────── */

/**
 * Vertex for axis `index` at `value` (0–100), clockwise from the top. Shared by
 * the grid rings, the two data polygons and the axis labels so they cannot
 * drift apart.
 */
export function radarPoint(
  index: number,
  value: number,
  cx: number,
  cy: number,
  radius: number,
  count: number = COMPETENCIES.length
): { x: number; y: number } {
  const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
  const r = (Math.max(0, Math.min(100, value)) / 100) * radius;
  return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
}

export function radarPolygon(
  values: number[],
  cx: number,
  cy: number,
  radius: number
): string {
  return values
    .map((v, i) => {
      const p = radarPoint(i, v, cx, cy, radius, values.length);
      return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    })
    .join(" ");
}

/* ── Insight ────────────────────────────────────────────────────────────── */

export type InsightPart = { text: string; strong?: boolean };
export type Insight = { tone: "positive" | "warning"; parts: InsightPart[] };

export type InsightAxis = {
  key: CompetencyKey;
  label: string;
  you: number;
  peer_median: number;
  delta: number;
  sample: number;
};

/** One decimal, always — the pacing chip above the chart prints the same
 *  figure, and "33" beside "32.7 pts behind run-rate" reads like two numbers. */
const round = (n: number) => Math.abs(n).toFixed(1);

/**
 * What to do about the competency you are furthest behind on. Each line names a
 * lever the RM actually has, not a restatement of the score.
 */
function advice(
  key: CompetencyKey,
  m: { overdue: number; untouched: number; avgDays: number | null; noun: string }
): string {
  switch (key) {
    case "sla_compliance":
      return m.overdue > 0
        ? `Clearing the ${m.overdue} action${m.overdue === 1 ? "" : "s"} already past deadline is the fastest way to move it.`
        : "Take the next action in the queue before its countdown drops under thirty minutes.";
    case "relationship_growth":
      return m.untouched > 0
        ? `${m.untouched} customer${m.untouched === 1 ? " has" : "s have"} had no contact from you this ${m.noun}.`
        : "Keep working down the book — every account has been touched at least once.";
    case "conversion":
      return `Work the newest leads first; the cohort ages out of this ${m.noun} whether or not you call.`;
    case "data_accuracy":
      return "Filling in the missing mobile, email and deal-value fields lifts this immediately.";
    case "pipeline_velocity":
      return m.avgDays != null
        ? `Actions are taking ${m.avgDays.toFixed(1)} days to close — closing the small ones same-day is the quickest win.`
        : "Nothing was closed in this window, so there is no velocity to measure yet.";
  }
}

/**
 * The written read-out under the radar. Everything in it is derived from the
 * numbers on this page — no model call, so it can never say something the
 * charts contradict.
 */
export function buildInsight(input: {
  axes: InsightAxis[];
  peer_count: number;
  peer_label: string;
  pace: Pacing;
  overdue: number;
  untouched: number;
  avg_close_days: number | null;
  window: Window;
}): Insight {
  const { pace, window: win } = input;
  const ahead = pace.pace_delta_pts >= 0;

  // With no target row there is no run-rate to be ahead or behind of, and
  // saying "0.0 pts ahead" would dress up a missing number as a result.
  const noTarget = pace.target_value <= 0;
  const paceClause: InsightPart[] = noTarget
    ? [
        { text: "You have " },
        { text: `no target set for this ${win.noun}`, strong: true },
        { text: ", so there is no run-rate to pace against" },
      ]
    : [
        { text: "You are " },
        {
          text: `${round(pace.pace_delta_pts)} pts ${ahead ? "ahead of" : "behind"} run-rate`,
          strong: true,
        },
        { text: ` this ${win.noun}` },
      ];

  // The pace clause opens "You are …" normally but "You have …" when there is
  // no target, so anything continuing its predicate needs its own subject then.
  const and = noTarget ? ". You are" : " and";
  const comma = noTarget ? ". You are " : ", ";

  const rated = input.axes.filter((a) => a.sample > 0);

  // No peers to compare against — fall back to the RM's own pacing and queue.
  if (input.peer_count === 0 || rated.length === 0) {
    const tail: InsightPart[] =
      input.overdue > 0
        ? [
            { text: ". " },
            {
              text: `${input.overdue} action${input.overdue === 1 ? " is" : "s are"} past deadline`,
              strong: true,
            },
            { text: " — clear those first; they are the only thing dragging the score." },
          ]
        : [
            { text: ". " },
            { text: "Nothing is past deadline", strong: true },
            { text: " — keep taking the top of the queue as it refreshes." },
          ];
    return {
      tone: ahead && !noTarget && input.overdue === 0 ? "positive" : "warning",
      parts: [...paceClause, ...tail],
    };
  }

  const sorted = [...rated].sort((a, b) => b.delta - a.delta);
  const best = sorted[0]!;
  const worst = sorted[sorted.length - 1]!;
  const lever = advice(worst.key, {
    overdue: input.overdue,
    untouched: input.untouched,
    avgDays: input.avg_close_days,
    noun: win.noun,
  });

  // Everything above median: say so rather than manufacturing a weakness.
  if (worst.delta >= 0) {
    return {
      tone: "positive",
      parts: [
        ...paceClause,
        { text: `${and} above ` },
        { text: `${input.peer_label} median`, strong: true },
        { text: " on every competency, led by " },
        { text: `${best.label} (+${round(best.delta)} pts)`, strong: true },
        { text: `. Your narrowest lead is ${worst.label}, at +${round(worst.delta)} pts.` },
      ],
    };
  }

  // Everything below median: don't invent a strength either.
  if (best.delta < 0) {
    return {
      tone: "warning",
      parts: [
        ...paceClause,
        { text: `${and} below ` },
        { text: `${input.peer_label} median`, strong: true },
        { text: " on every competency, furthest on " },
        { text: `${worst.label} (${round(worst.delta)} pts behind)`, strong: true },
        { text: `. ${lever}` },
      ],
    };
  }

  return {
    tone: worst.delta < -10 || !ahead || noTarget ? "warning" : "positive",
    parts: [
      ...paceClause,
      { text: comma },
      { text: `${round(best.delta)} pts above ${input.peer_label} median`, strong: true },
      { text: ` on ${best.label} but ` },
      { text: `${round(worst.delta)} pts behind`, strong: true },
      { text: ` on ${worst.label}. ${lever}` },
    ],
  };
}
