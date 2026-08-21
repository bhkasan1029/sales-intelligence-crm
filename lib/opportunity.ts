/**
 * Everything the RM dashboard needs to turn an `actions` row into the card the
 * RM sees. Pure functions only — the API routes use them to build the payload
 * and the client uses them to re-derive urgency as the countdown ticks, so the
 * two can never drift.
 */

import { num } from "@/lib/format";

/* ── Types ──────────────────────────────────────────────────────────────── */

export type EntityKind = "lead" | "client" | "portfolio";

export type Urgency = "breached" | "critical" | "soon" | "normal";

export type Tag = {
  key: string;
  label: string;
  icon: string;
  /** Maps to a colour pairing in the card. */
  tone: "error" | "primary" | "tertiary" | "neutral";
};

export type Opportunity = {
  id: string;
  ref: string;
  type: string;
  message: string;
  reason: string | null;
  priority_score: number;
  status: string;
  created_at: string;
  /** When this is due. Always present — derived from the type when unset. */
  deadline: string;
  deadline_source: "action" | "derived";
  snoozed_until: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_segment: string | null;
  customer_stage: string | null;
  customer_mobile: string | null;
  customer_email: string | null;
  last_contact_at: string | null;
  entity: EntityKind;
  est_value: number;
  tags: Tag[];
  rule_name: string | null;
  insight: string | null;
};

/* ── SLA windows ────────────────────────────────────────────────────────── */

/** Fallback response window per action type, in hours. Keyed lowercase. */
export const SLA_HOURS: Record<string, number> = {
  follow_up_breach: 4,
  opportunity_at_risk: 24,
  high_intent: 2,
  meeting_no_outcome: 24,
  escalated_breach: 4,
  stale_pipeline: 48,
  dormant_reactivation: 72,
  cross_sell: 72,
  target_gap: 72,
  achievement: 168,
  target_achievement: 168,
};
const DEFAULT_SLA_HOURS = 24;

/** Seed data writes UPPER_SNAKE types, the rules engine writes lower_snake. */
export function normaliseType(type: string): string {
  return (type ?? "").toLowerCase();
}

export function slaHoursFor(type: string): number {
  return SLA_HOURS[normaliseType(type)] ?? DEFAULT_SLA_HOURS;
}

/** The deadline to count down to. Falls back to created_at + the type's window. */
export function resolveDeadline(row: {
  sla_deadline?: string | Date | null;
  created_at: string | Date;
  type: string;
}): { deadline: string; source: "action" | "derived" } {
  if (row.sla_deadline) {
    return { deadline: new Date(row.sla_deadline).toISOString(), source: "action" };
  }
  const base = new Date(row.created_at).getTime();
  return {
    deadline: new Date(base + slaHoursFor(row.type) * 3_600_000).toISOString(),
    source: "derived",
  };
}

/* ── Urgency ────────────────────────────────────────────────────────────── */

/** Anything due inside this window counts against the SLA-risk tile. */
export const SLA_RISK_MINUTES = 30;

export function urgencyOf(deadline: string | Date, now: number = Date.now()): Urgency {
  const ms = new Date(deadline).getTime() - now;
  if (ms <= 0) return "breached";
  if (ms <= SLA_RISK_MINUTES * 60_000) return "critical";
  if (ms <= 4 * 3_600_000) return "soon";
  return "normal";
}

/** 0–100: how much of the response window has been used up. */
export function elapsedPct(
  createdAt: string | Date,
  deadline: string | Date,
  now: number = Date.now()
): number {
  const start = new Date(createdAt).getTime();
  const end = new Date(deadline).getTime();
  if (!(end > start)) return 100;
  return Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
}

/** "14:57" under an hour, "01:45:18" above it. Negative time reads as overdue. */
export function formatCountdown(msRemaining: number): string {
  const overdue = msRemaining < 0;
  const total = Math.floor(Math.abs(msRemaining) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  return overdue ? `+${clock}` : clock;
}

/* ── Identity ───────────────────────────────────────────────────────────── */

const OPEN_STAGES = new Set(["new", "in_progress", "contacted", "qualified"]);

export function entityOf(stage: string | null | undefined, hasCustomer: boolean): EntityKind {
  if (!hasCustomer) return "portfolio";
  if (stage && OPEN_STAGES.has(stage)) return "lead";
  return "client";
}

export const ENTITY_LABEL: Record<EntityKind, string> = {
  lead: "Lead",
  client: "Client",
  portfolio: "Portfolio",
};

/**
 * Short human-quotable handle for an action, e.g. "OPP-8921". Derived from the
 * UUID so it is stable for the life of the row without another column.
 */
export function oppRef(id: string): string {
  const hex = (id ?? "").replace(/-/g, "").slice(0, 8);
  const n = parseInt(hex || "0", 16);
  return `OPP-${1000 + (n % 9000)}`;
}

/* ── Tags ───────────────────────────────────────────────────────────────── */

const TYPE_TAGS: Record<string, Tag> = {
  opportunity_at_risk: {
    key: "uninvested_payin",
    label: "Uninvested Pay-In",
    icon: "account_balance_wallet",
    tone: "primary",
  },
  high_intent: {
    key: "high_intent",
    label: "High Digital Intent",
    icon: "trending_up",
    tone: "tertiary",
  },
  dormant_reactivation: { key: "dormant", label: "Dormant Opp", icon: "snooze", tone: "neutral" },
  stale_pipeline: { key: "stale", label: "Dormant Opp", icon: "snooze", tone: "neutral" },
  follow_up_breach: {
    key: "first_contact",
    label: "First Contact Due",
    icon: "call",
    tone: "primary",
  },
  meeting_no_outcome: {
    key: "meeting_summary",
    label: "Summary Pending",
    icon: "edit_note",
    tone: "neutral",
  },
  cross_sell: { key: "cross_sell", label: "Cross-sell", icon: "sell", tone: "tertiary" },
  target_gap: { key: "target_gap", label: "Behind Run-Rate", icon: "speed", tone: "error" },
  escalated_breach: { key: "escalated", label: "Escalated", icon: "priority_high", tone: "error" },
  achievement: { key: "milestone", label: "Milestone", icon: "workspace_premium", tone: "tertiary" },
  target_achievement: {
    key: "milestone",
    label: "Milestone",
    icon: "workspace_premium",
    tone: "tertiary",
  },
};

const SLA_TAG: Tag = {
  key: "sla_breach",
  label: "SLA Breach Risk",
  icon: "timer",
  tone: "error",
};
const BREACHED_TAG: Tag = {
  key: "sla_breached",
  label: "SLA Breached",
  icon: "timer_off",
  tone: "error",
};
const HIGH_VALUE_TAG: Tag = {
  key: "high_value",
  label: "High Value",
  icon: "diamond",
  tone: "tertiary",
};

/** Value from which a deal is worth calling out on its own. */
export const HIGH_VALUE_FLOOR = 500_000;

export function tagsFor(
  row: { type: string; deadline: string; est_value?: unknown; customer_segment?: string | null },
  now: number = Date.now()
): Tag[] {
  const tags: Tag[] = [];
  const urgency = urgencyOf(row.deadline, now);
  if (urgency === "breached") tags.push(BREACHED_TAG);
  else if (urgency === "critical") tags.push(SLA_TAG);

  const byType = TYPE_TAGS[normaliseType(row.type)];
  if (byType) tags.push(byType);

  if (num(row.est_value) >= HIGH_VALUE_FLOOR) tags.push(HIGH_VALUE_TAG);
  return tags;
}

/** Tailwind pairings for a tag tone. Kept here so card and drawer agree. */
export const TAG_TONE_CLASS: Record<Tag["tone"], string> = {
  error: "bg-error-container text-on-error-container",
  primary: "bg-primary-container text-on-primary-container",
  tertiary: "bg-tertiary-container text-on-tertiary-container",
  neutral: "bg-surface-variant text-on-surface-variant",
};

/* ── Ranking ────────────────────────────────────────────────────────────── */

export type RankMode = "model_alpha" | "deadline" | "value" | "newest";

export const RANK_MODES: { key: RankMode; label: string; hint: string }[] = [
  {
    key: "model_alpha",
    label: "Model Alpha (Live)",
    hint: "Rules-engine priority score",
  },
  { key: "deadline", label: "Deadline (Soonest)", hint: "Closest SLA first" },
  { key: "value", label: "Deal Value", hint: "Largest estimated value first" },
  { key: "newest", label: "Newest First", hint: "Most recently raised" },
];

export function rankQueue<T extends Opportunity>(items: T[], mode: RankMode): T[] {
  const sorted = [...items];
  switch (mode) {
    case "deadline":
      sorted.sort((a, b) => +new Date(a.deadline) - +new Date(b.deadline));
      break;
    case "value":
      sorted.sort((a, b) => b.est_value - a.est_value || b.priority_score - a.priority_score);
      break;
    case "newest":
      sorted.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
      break;
    default:
      // Model Alpha: engine score first, then whatever is closest to breaching.
      sorted.sort(
        (a, b) =>
          b.priority_score - a.priority_score ||
          +new Date(a.deadline) - +new Date(b.deadline)
      );
  }
  return sorted;
}

/* ── Quarter helpers (the quota tile is quarterly) ──────────────────────── */

export function quarterOf(date: Date = new Date()) {
  const q = Math.floor(date.getMonth() / 3) + 1;
  const startMonth = (q - 1) * 3;
  const start = new Date(date.getFullYear(), startMonth, 1);
  const end = new Date(date.getFullYear(), startMonth + 3, 1);
  const periods = [0, 1, 2].map(
    (i) => `${date.getFullYear()}-${String(startMonth + i + 1).padStart(2, "0")}`
  );
  const elapsedPct = Math.max(
    0,
    Math.min(100, ((date.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100)
  );
  return { quarter: q, label: `Q${q}`, year: date.getFullYear(), start, end, periods, elapsedPct };
}
